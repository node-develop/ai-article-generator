import { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import type Redis from 'ioredis';
import { createSubscriber, createPublisher, publishEvent } from './pubsub.js';
import { getGenerationChannel } from '@articleforge/shared';
import type { WSClientMessage, WSServerMessage } from '@articleforge/shared';
import { auth } from '../auth/index.js';

// Track connected WebSocket clients per runId
const clientsByRunId = new Map<string, Set<WSContext>>();
// Track Redis subscribers per runId (shared among all WS clients for that run)
const subscribersByRunId = new Map<string, { subscriber: Redis; refCount: number }>();
// Track which runId each WS client is subscribed to
const clientRunMap = new WeakMap<WSContext, string>();

// Shared publisher for all WS clients
let sharedPublisher: Redis | null = null;

const getPublisher = (): Redis => {
  if (!sharedPublisher) {
    sharedPublisher = createPublisher();
  }
  return sharedPublisher;
};

const addClient = (runId: string, ws: WSContext): void => {
  if (!clientsByRunId.has(runId)) {
    clientsByRunId.set(runId, new Set());
  }
  clientsByRunId.get(runId)!.add(ws);
  clientRunMap.set(ws, runId);
};

const removeClient = (ws: WSContext): void => {
  const runId = clientRunMap.get(ws);
  if (!runId) return;

  const clients = clientsByRunId.get(runId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      clientsByRunId.delete(runId);
      // Unsubscribe from Redis if no more clients for this runId
      cleanupRunSubscriber(runId);
    }
  }
};

const cleanupRunSubscriber = (runId: string): void => {
  const entry = subscribersByRunId.get(runId);
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    subscribersByRunId.delete(runId);
    try {
      entry.subscriber.unsubscribe();
      entry.subscriber.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }
};

const broadcastToRun = (runId: string, message: WSServerMessage): void => {
  const clients = clientsByRunId.get(runId);
  if (!clients) return;

  const data = JSON.stringify(message);
  for (const client of clients) {
    try {
      client.send(data);
    } catch {
      // Client may have disconnected
    }
  }
};

const subscribeToRun = (runId: string): void => {
  if (subscribersByRunId.has(runId)) {
    subscribersByRunId.get(runId)!.refCount += 1;
    return;
  }

  const subscriber = createSubscriber();
  const channel = getGenerationChannel(runId);

  subscriber.on('message', (msgChannel: string, message: string) => {
    if (msgChannel !== channel) return;

    try {
      const event = JSON.parse(message);
      // Only forward interrupt-related events to WebSocket clients
      if (event.type === 'interrupt:waiting') {
        const wsMsg: WSServerMessage = {
          type: 'interrupt:request',
          run_id: runId,
          stage: event.stage,
          data: event.data,
        };
        broadcastToRun(runId, wsMsg);
      } else if (event.type === 'interrupt:resumed') {
        const wsMsg: WSServerMessage = {
          type: 'interrupt:resumed',
          run_id: runId,
          stage: event.stage,
        };
        broadcastToRun(runId, wsMsg);
      }
    } catch {
      // Skip malformed messages
    }
  });

  subscriber.subscribe(channel);
  subscribersByRunId.set(runId, { subscriber, refCount: 1 });
};

const sendError = (ws: WSContext, message: string): void => {
  const error: WSServerMessage = { type: 'error', message };
  ws.send(JSON.stringify(error));
};

const handleClientMessage = async (ws: WSContext, raw: string): Promise<void> => {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendError(ws, 'Invalid JSON');
    return;
  }

  // Handle subscribe action (join a generation room)
  if (parsed.action === 'subscribe' && typeof parsed.run_id === 'string') {
    const runId = parsed.run_id;

    // Remove from previous room if any
    removeClient(ws);

    // Add to new room
    addClient(runId, ws);
    subscribeToRun(runId);

    ws.send(JSON.stringify({ type: 'subscribed', run_id: runId }));
    return;
  }

  // Handle approve/reject/edit actions
  const message = parsed as WSClientMessage;
  if (!message.action || !message.run_id || !message.stage) {
    sendError(ws, 'Missing required fields: action, run_id, stage');
    return;
  }

  if (!['approve', 'reject', 'edit'].includes(message.action)) {
    sendError(ws, `Unknown action: ${message.action}`);
    return;
  }

  // Publish the client's response to Redis so the worker can pick it up
  const publisher = getPublisher();
  const channel = getGenerationChannel(message.run_id);

  // Publish a response event the worker can consume
  await publishEvent(publisher, channel, {
    type: `interrupt:response`,
    action: message.action,
    stage: message.stage,
    run_id: message.run_id,
    feedback: message.action === 'reject' ? (message as any).feedback : undefined,
    updated_data: message.action === 'edit' ? (message as any).updated_data : undefined,
  });
};

// Verify session token for WebSocket auth
const verifyToken = async (token: string): Promise<boolean> => {
  try {
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);
    const session = await auth.api.getSession({ headers });
    return !!session;
  } catch {
    return false;
  }
};

// Factory function that takes upgradeWebSocket and returns configured routes
export const createWsRoutes = (
  upgradeWebSocket: (handler: any) => any,
): Hono => {
  const wsRoutes = new Hono();

  wsRoutes.get(
    '/generation',
    upgradeWebSocket((c: any) => {
      const token = c.req.query('token');
      let authenticated = false;

      return {
        async onOpen(_event: any, ws: WSContext) {
          // Verify token on connection
          if (!token) {
            sendError(ws, 'Authentication required: provide ?token= query parameter');
            ws.close(4001, 'Unauthorized');
            return;
          }

          const isValid = await verifyToken(token);
          if (!isValid) {
            sendError(ws, 'Invalid or expired session token');
            ws.close(4001, 'Unauthorized');
            return;
          }

          authenticated = true;
          ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
        },

        async onMessage(event: any, ws: WSContext) {
          if (!authenticated) {
            sendError(ws, 'Not authenticated');
            return;
          }

          const data = typeof event.data === 'string' ? event.data : event.data.toString();
          await handleClientMessage(ws, data);
        },

        onClose(_event: any, ws: WSContext) {
          removeClient(ws);
        },

        onError(_event: any, ws: WSContext) {
          removeClient(ws);
        },
      };
    }),
  );

  return wsRoutes;
};

// Backward-compatible export for the stub (will be replaced in server.ts)
export const wsRoutes = new Hono();
