// SSE Events (Server -> Client)
export type SSEEventType =
  | 'stage:started'
  | 'stage:progress'
  | 'stage:completed'
  | 'stage:failed'
  | 'generation:completed'
  | 'generation:failed'
  | 'interrupt:waiting'
  | 'interrupt:resumed';

export interface SSEStageStarted {
  type: 'stage:started';
  stage: string;
  timestamp: string;
}

export interface SSEStageProgress {
  type: 'stage:progress';
  stage: string;
  message: string;
  percent?: number;
}

export interface SSEStageCompleted {
  type: 'stage:completed';
  stage: string;
  duration_ms: number;
  tokens?: number;
}

export interface SSEStageFailed {
  type: 'stage:failed';
  stage: string;
  error: string;
}

export interface SSEGenerationCompleted {
  type: 'generation:completed';
  article_id: string;
}

export interface SSEGenerationFailed {
  type: 'generation:failed';
  error: string;
}

export interface SSEInterruptWaiting {
  type: 'interrupt:waiting';
  stage: string;
  data: unknown;
}

export interface SSEInterruptResumed {
  type: 'interrupt:resumed';
  stage: string;
}

export type SSEEvent =
  | SSEStageStarted
  | SSEStageProgress
  | SSEStageCompleted
  | SSEStageFailed
  | SSEGenerationCompleted
  | SSEGenerationFailed
  | SSEInterruptWaiting
  | SSEInterruptResumed;

// WebSocket Messages (Client -> Server)
export interface WSApproveMessage {
  action: 'approve';
  run_id: string;
  stage: string;
}

export interface WSRejectMessage {
  action: 'reject';
  run_id: string;
  stage: string;
  feedback: string;
}

export interface WSEditMessage {
  action: 'edit';
  run_id: string;
  stage: string;
  updated_data: unknown;
}

export type WSClientMessage = WSApproveMessage | WSRejectMessage | WSEditMessage;

// WebSocket Messages (Server -> Client)
export interface WSInterruptRequest {
  type: 'interrupt:request';
  run_id: string;
  stage: string;
  data: unknown;
}

export interface WSInterruptResumed {
  type: 'interrupt:resumed';
  run_id: string;
  stage: string;
}

export interface WSError {
  type: 'error';
  message: string;
}

export type WSServerMessage = WSInterruptRequest | WSInterruptResumed | WSError;

// Redis PubSub channel helpers
export const getGenerationChannel = (runId: string): string =>
  `generation:${runId}`;

export const parseGenerationChannel = (channel: string): string | null => {
  const match = channel.match(/^generation:(.+)$/);
  return match ? match[1] : null;
};
