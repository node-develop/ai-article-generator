import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSClientMessage, WSServerMessage, WSInterruptRequest } from '@articleforge/shared';
import { useGenerationStore } from '@/stores/generation';

interface UseWebSocketOptions {
  runId: string | null;
  token: string | null;
  enabled?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  interruptData: { stage: string; data: unknown } | null;
  sendApprove: (stage: string) => void;
  sendReject: (stage: string, feedback: string) => void;
  sendEdit: (stage: string, updatedData: unknown) => void;
  error: string | null;
}

export const useWebSocket = ({
  runId,
  token,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;

  const interruptData = useGenerationStore((s) => s.interruptData);
  const setInterrupt = useGenerationStore((s) => s.setInterrupt);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: WSClientMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket is not connected');
      return;
    }
    wsRef.current.send(JSON.stringify(message));
  }, []);

  const sendApprove = useCallback(
    (stage: string) => {
      if (!runId) return;
      sendMessage({ action: 'approve', run_id: runId, stage });
      setInterrupt(null);
    },
    [runId, sendMessage, setInterrupt],
  );

  const sendReject = useCallback(
    (stage: string, feedback: string) => {
      if (!runId) return;
      sendMessage({ action: 'reject', run_id: runId, stage, feedback });
      setInterrupt(null);
    },
    [runId, sendMessage, setInterrupt],
  );

  const sendEdit = useCallback(
    (stage: string, updatedData: unknown) => {
      if (!runId) return;
      sendMessage({ action: 'edit', run_id: runId, stage, updated_data: updatedData });
      setInterrupt(null);
    },
    [runId, sendMessage, setInterrupt],
  );

  const connect = useCallback(() => {
    if (!runId || !token || !enabled) return;

    cleanup();

    // Build WebSocket URL using current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/ws/generation?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setError(null);
      reconnectAttemptsRef.current = 0;

      // Subscribe to the generation run
      ws.send(JSON.stringify({ action: 'subscribe', run_id: runId }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as WSServerMessage | { type: string; [key: string]: unknown };

        switch (message.type) {
          case 'connected':
            // Initial connection confirmation
            break;

          case 'subscribed':
            setIsConnected(true);
            break;

          case 'interrupt:request': {
            const interrupt = message as WSInterruptRequest;
            setInterrupt({ stage: interrupt.stage, data: interrupt.data });
            break;
          }

          case 'interrupt:resumed':
            setInterrupt(null);
            break;

          case 'error':
            setError((message as { message: string }).message);
            break;

          default:
            break;
        }
      } catch {
        // Skip malformed messages
      }
    };

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false);

      // Don't reconnect if closed intentionally (4001 = auth failure)
      if (event.code === 4001) {
        setError('Authentication failed');
        cleanup();
        return;
      }

      // Reconnect with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setError('Connection lost after maximum reconnection attempts');
      }
    };

    ws.onerror = () => {
      // Error handling is done in onclose
    };
  }, [runId, token, enabled, cleanup, setInterrupt]);

  useEffect(() => {
    if (runId && token && enabled) {
      connect();
    }

    return cleanup;
  }, [runId, token, enabled, connect, cleanup]);

  return {
    isConnected,
    interruptData,
    sendApprove,
    sendReject,
    sendEdit,
    error,
  };
};
