import type Redis from 'ioredis';
import { publishEvent } from '../realtime/pubsub.js';
import type { SSEStageStarted, SSEStageProgress, SSEStageCompleted, SSEStageFailed } from '@articleforge/shared';

export interface ProgressReporter {
  stageStarted(stage: string): Promise<void>;
  stageProgress(stage: string, message: string, percent?: number): Promise<void>;
  stageCompleted(stage: string, durationMs: number, tokens?: number): Promise<void>;
  stageFailed(stage: string, error: string): Promise<void>;
}

export const createProgressReporter = (
  publisher: Redis,
  channel: string,
): ProgressReporter => ({
  stageStarted: async (stage) => {
    const event: SSEStageStarted = {
      type: 'stage:started',
      stage,
      timestamp: new Date().toISOString(),
    };
    await publishEvent(publisher, channel, event);
  },

  stageProgress: async (stage, message, percent) => {
    const event: SSEStageProgress = {
      type: 'stage:progress',
      stage,
      message,
      ...(percent !== undefined && { percent }),
    };
    await publishEvent(publisher, channel, event);
  },

  stageCompleted: async (stage, durationMs, tokens) => {
    const event: SSEStageCompleted = {
      type: 'stage:completed',
      stage,
      duration_ms: durationMs,
      ...(tokens !== undefined && { tokens }),
    };
    await publishEvent(publisher, channel, event);
  },

  stageFailed: async (stage, error) => {
    const event: SSEStageFailed = {
      type: 'stage:failed',
      stage,
      error,
    };
    await publishEvent(publisher, channel, event);
  },
});

/** Extract ProgressReporter from LangGraph RunnableConfig. Returns a no-op reporter if not found. */
export const getProgress = (config?: { configurable?: Record<string, unknown> }): ProgressReporter => {
  const progress = config?.configurable?.progress as ProgressReporter | undefined;
  if (progress) return progress;

  // No-op fallback so nodes work even without reporter (e.g. in tests)
  return {
    stageStarted: async () => {},
    stageProgress: async () => {},
    stageCompleted: async () => {},
    stageFailed: async () => {},
  };
};
