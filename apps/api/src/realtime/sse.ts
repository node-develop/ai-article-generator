import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type Redis from 'ioredis';
import { createSubscriber } from './pubsub.js';
import { getGenerationChannel } from '@articleforge/shared';
import type { SSEEvent } from '@articleforge/shared';

// Track active SSE subscriptions: runId -> Set of subscriber Redis instances
const activeSubscriptions = new Map<string, Set<Redis>>();

const addSubscription = (runId: string, subscriber: Redis): void => {
  if (!activeSubscriptions.has(runId)) {
    activeSubscriptions.set(runId, new Set());
  }
  activeSubscriptions.get(runId)!.add(subscriber);
};

const removeSubscription = (runId: string, subscriber: Redis): void => {
  const subs = activeSubscriptions.get(runId);
  if (subs) {
    subs.delete(subscriber);
    if (subs.size === 0) {
      activeSubscriptions.delete(runId);
    }
  }
};

const cleanupSubscriber = async (runId: string, subscriber: Redis): Promise<void> => {
  removeSubscription(runId, subscriber);
  try {
    await subscriber.unsubscribe();
    subscriber.disconnect();
  } catch {
    // Ignore errors during cleanup
  }
};

export const sseRoutes = new Hono();

sseRoutes.get('/generation/:runId', (c) => {
  const runId = c.req.param('runId');
  const channel = getGenerationChannel(runId);

  return streamSSE(c, async (stream) => {
    const subscriber = createSubscriber();
    addSubscription(runId, subscriber);

    let closed = false;

    // Set up heartbeat interval
    const heartbeatInterval = setInterval(async () => {
      if (closed) return;
      try {
        await stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
          id: String(Date.now()),
        });
      } catch {
        // Stream may be closed, will be handled by abort
      }
    }, 15_000);

    // Clean up on disconnect
    stream.onAbort(() => {
      closed = true;
      clearInterval(heartbeatInterval);
      cleanupSubscriber(runId, subscriber);
    });

    // Subscribe to Redis channel and forward events to SSE stream
    subscriber.on('message', async (msgChannel: string, message: string) => {
      if (msgChannel !== channel || closed) return;

      try {
        const event = JSON.parse(message) as SSEEvent;
        await stream.writeSSE({
          event: event.type,
          data: message,
          id: String(Date.now()),
        });

        // Auto-close the stream on terminal events
        if (event.type === 'generation:completed' || event.type === 'generation:failed') {
          closed = true;
          clearInterval(heartbeatInterval);
          await cleanupSubscriber(runId, subscriber);
          await stream.close();
        }
      } catch {
        // Skip malformed messages
      }
    });

    await subscriber.subscribe(channel);

    // Send initial connected event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ run_id: runId, timestamp: new Date().toISOString() }),
      id: String(Date.now()),
    });

    // Keep the stream open until aborted or terminal event
    // We use a promise that resolves when closed is set to true
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (closed) {
          clearInterval(check);
          resolve();
        }
      }, 500);

      // Also listen to abort
      stream.onAbort(() => {
        clearInterval(check);
        resolve();
      });
    });
  });
});

// Utility to get the count of active SSE connections (for monitoring)
export const getActiveSSEConnectionCount = (): number => {
  let count = 0;
  for (const subs of activeSubscriptions.values()) {
    count += subs.size;
  }
  return count;
};
