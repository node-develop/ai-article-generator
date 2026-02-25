import { createSubscriber } from '../realtime/pubsub.js';
import type Redis from 'ioredis';

export interface InterruptResponse {
  action: 'approve' | 'reject' | 'edit';
  feedback?: string;
  updated_data?: unknown;
}

export interface InterruptHandler {
  waitForResponse(stage: string): Promise<InterruptResponse>;
}

const INTERRUPT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const createInterruptHandler = (channel: string): InterruptHandler => ({
  waitForResponse: (stage: string): Promise<InterruptResponse> => {
    return new Promise<InterruptResponse>((resolve, reject) => {
      let subscriber: Redis | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (subscriber) {
          subscriber.unsubscribe().catch(() => {});
          subscriber.disconnect();
          subscriber = null;
        }
      };

      subscriber = createSubscriber();

      subscriber.subscribe(channel, (err) => {
        if (err) {
          cleanup();
          reject(new Error(`Failed to subscribe to channel ${channel}: ${err.message}`));
        }
      });

      subscriber.on('message', (_ch: string, message: string) => {
        try {
          const event = JSON.parse(message);
          if (event.type === 'interrupt:response' && event.stage === stage) {
            cleanup();
            resolve({
              action: event.action,
              feedback: event.feedback,
              updated_data: event.updated_data,
            });
          }
        } catch {
          // Skip malformed messages
        }
      });

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Interrupt timeout: no response received for stage "${stage}" within 30 minutes`));
      }, INTERRUPT_TIMEOUT_MS);
    });
  },
});

/** Extract InterruptHandler from LangGraph RunnableConfig. */
export const getInterruptHandler = (config?: { configurable?: Record<string, unknown> }): InterruptHandler | null => {
  return (config?.configurable?.interruptHandler as InterruptHandler) ?? null;
};
