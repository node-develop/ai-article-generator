import { useEffect, useRef, useState, useCallback } from 'react';
import type { SSEEvent } from '@articleforge/shared';
import { useGenerationStore } from '@/stores/generation';

interface UseSSEOptions {
  runId: string | null;
  enabled?: boolean;
}

interface UseSSEReturn {
  events: SSEEvent[];
  isConnected: boolean;
  lastEvent: SSEEvent | null;
  error: string | null;
}

export const useSSE = ({ runId, enabled = true }: UseSSEOptions): UseSSEReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;

  const events = useGenerationStore((s) => s.events);
  const addEvent = useGenerationStore((s) => s.addEvent);
  const isCompleted = useGenerationStore((s) => s.isCompleted);
  const isFailed = useGenerationStore((s) => s.isFailed);

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!runId || !enabled) return;

    // Don't reconnect if generation is already done
    if (isCompleted || isFailed) return;

    cleanup();

    const url = `/api/sse/generation/${runId}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    });

    // All SSE event types we want to handle
    const eventTypes = [
      'stage:started',
      'stage:progress',
      'stage:completed',
      'stage:failed',
      'generation:completed',
      'generation:failed',
      'interrupt:waiting',
      'interrupt:resumed',
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as SSEEvent;
          addEvent(event);

          // Close on terminal events
          if (event.type === 'generation:completed' || event.type === 'generation:failed') {
            cleanup();
          }
        } catch {
          // Skip malformed events
        }
      });
    }

    es.onerror = () => {
      setIsConnected(false);

      // Don't reconnect if terminal state reached
      if (isCompleted || isFailed) {
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
        cleanup();
      }
    };
  }, [runId, enabled, isCompleted, isFailed, addEvent, cleanup]);

  useEffect(() => {
    if (runId && enabled) {
      connect();
    }

    return cleanup;
  }, [runId, enabled, connect, cleanup]);

  return {
    events,
    isConnected,
    lastEvent,
    error,
  };
};
