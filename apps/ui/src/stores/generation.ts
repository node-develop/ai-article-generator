import { create } from 'zustand';
import type { SSEEvent } from '@articleforge/shared';

type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

interface StageState {
  status: StageStatus;
  progress?: number;
  message?: string;
}

interface InterruptData {
  stage: string;
  data: unknown;
}

interface GenerationStore {
  // Active generation monitoring
  activeRunId: string | null;
  events: SSEEvent[];
  stages: Record<string, StageState>;
  interruptData: InterruptData | null;
  isCompleted: boolean;
  isFailed: boolean;
  error: string | null;
  articleId: string | null;

  // Actions
  setActiveRun: (runId: string) => void;
  addEvent: (event: SSEEvent) => void;
  setInterrupt: (data: InterruptData | null) => void;
  reset: () => void;
}

const initialState = {
  activeRunId: null as string | null,
  events: [] as SSEEvent[],
  stages: {} as Record<string, StageState>,
  interruptData: null as InterruptData | null,
  isCompleted: false,
  isFailed: false,
  error: null as string | null,
  articleId: null as string | null,
};

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  ...initialState,

  setActiveRun: (runId: string) => {
    set({
      ...initialState,
      activeRunId: runId,
    });
  },

  addEvent: (event: SSEEvent) => {
    const state = get();
    const updatedEvents = [...state.events, event];
    const updatedStages = { ...state.stages };

    switch (event.type) {
      case 'stage:started': {
        updatedStages[event.stage] = {
          status: 'running',
          progress: 0,
          message: undefined,
        };
        set({ events: updatedEvents, stages: updatedStages });
        break;
      }

      case 'stage:progress': {
        const existing = updatedStages[event.stage] || { status: 'running' as StageStatus };
        updatedStages[event.stage] = {
          ...existing,
          status: 'running',
          progress: event.percent,
          message: event.message,
        };
        set({ events: updatedEvents, stages: updatedStages });
        break;
      }

      case 'stage:completed': {
        updatedStages[event.stage] = {
          status: 'completed',
          progress: 100,
          message: undefined,
        };
        set({ events: updatedEvents, stages: updatedStages });
        break;
      }

      case 'stage:failed': {
        updatedStages[event.stage] = {
          status: 'failed',
          message: event.error,
        };
        set({ events: updatedEvents, stages: updatedStages });
        break;
      }

      case 'generation:completed': {
        set({
          events: updatedEvents,
          isCompleted: true,
          articleId: event.article_id,
        });
        break;
      }

      case 'generation:failed': {
        set({
          events: updatedEvents,
          isFailed: true,
          error: event.error,
        });
        break;
      }

      case 'interrupt:waiting': {
        set({
          events: updatedEvents,
          interruptData: { stage: event.stage, data: event.data },
        });
        break;
      }

      case 'interrupt:resumed': {
        set({
          events: updatedEvents,
          interruptData: null,
        });
        break;
      }

      default: {
        set({ events: updatedEvents });
        break;
      }
    }
  },

  setInterrupt: (data: InterruptData | null) => {
    set({ interruptData: data });
  },

  reset: () => {
    set({ ...initialState });
  },
}));
