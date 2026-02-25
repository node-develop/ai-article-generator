import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Search,
  Database,
  ListTree,
  Pen,
  Wand2,
  Image,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  FileText,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useGeneration } from '@/api/hooks';
import { apiFetch } from '@/api/fetcher';
import { useSSE } from '@/hooks/useSSE';
import { useGenerationStore } from '@/stores/generation';
import type { GenerationStatus } from '@articleforge/shared/types';
import type { SSEEvent } from '@articleforge/shared/events';

// ---------------------------------------------------------------------------
// Pipeline stage definitions
// ---------------------------------------------------------------------------

interface StageDefinition {
  key: string;
  label: string;
  icon: React.ElementType;
  matchStatuses: GenerationStatus[];
}

const PIPELINE_STAGES: StageDefinition[] = [
  {
    key: 'research',
    label: 'Research',
    icon: Search,
    matchStatuses: ['research'],
  },
  {
    key: 'rag_context',
    label: 'RAG Context',
    icon: Database,
    matchStatuses: ['rag_context'],
  },
  {
    key: 'outline',
    label: 'Outline',
    icon: ListTree,
    matchStatuses: ['outline', 'outline_review'],
  },
  {
    key: 'write_sections',
    label: 'Write Sections',
    icon: Pen,
    matchStatuses: ['writing'],
  },
  {
    key: 'edit_polish',
    label: 'Edit & Polish',
    icon: Wand2,
    matchStatuses: ['editing', 'edit_review'],
  },
  {
    key: 'image_generate',
    label: 'Image Generation',
    icon: Image,
    matchStatuses: ['images'],
  },
  {
    key: 'assemble',
    label: 'Assembly',
    icon: Package,
    matchStatuses: ['assembling'],
  },
];

// ---------------------------------------------------------------------------
// Stage status helpers
// ---------------------------------------------------------------------------

type StageState = 'pending' | 'running' | 'completed' | 'failed' | 'review';

const getStageState = (
  stageKey: string,
  stageDef: StageDefinition,
  currentStatus: GenerationStatus,
  stagesLog: Array<{ stage: string; status: string }>,
  storeStages: Record<string, { status: string }>,
): StageState => {
  // Check store stages first (real-time SSE-driven state)
  const storeStage = storeStages[stageKey];
  if (storeStage) {
    if (storeStage.status === 'completed') return 'completed';
    if (storeStage.status === 'failed') return 'failed';
    if (storeStage.status === 'running') return 'running';
  }

  // Check logs for this stage
  const logEntry = stagesLog.find((l) => l.stage === stageKey);

  if (logEntry?.status === 'completed') return 'completed';
  if (logEntry?.status === 'failed') return 'failed';

  // Check if current status matches this stage
  if (stageDef.matchStatuses.includes(currentStatus)) {
    if (currentStatus === 'outline_review' || currentStatus === 'edit_review') {
      return 'review';
    }
    return 'running';
  }

  // If generation completed/failed
  if (currentStatus === 'completed') return 'completed';

  if (currentStatus === 'failed') {
    if (logEntry?.status === 'started') return 'failed';
    if (logEntry) return logEntry.status as StageState;
    return 'pending';
  }

  // Check if any later stage is running, meaning this one is done
  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.key === stageKey);
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) =>
    s.matchStatuses.includes(currentStatus),
  );
  if (currentStageIndex > stageIndex) return 'completed';

  if (logEntry?.status === 'started') return 'running';

  return 'pending';
};

const stageStateConfig: Record<StageState, { className: string; icon: React.ElementType }> = {
  pending: { className: 'text-muted-foreground', icon: Clock },
  running: { className: 'text-blue-600', icon: Loader2 },
  completed: { className: 'text-green-600', icon: CheckCircle2 },
  failed: { className: 'text-red-600', icon: XCircle },
  review: { className: 'text-amber-600', icon: AlertTriangle },
};

// ---------------------------------------------------------------------------
// Pipeline Stage Component
// ---------------------------------------------------------------------------

const PipelineStage = ({
  definition,
  state,
  progressMessage,
  progressPercent,
}: {
  definition: StageDefinition;
  state: StageState;
  progressMessage?: string;
  progressPercent?: number;
}) => {
  const config = stageStateConfig[state];
  const StateIcon = state === 'running' ? Loader2 : config.icon;
  const StageIcon = definition.icon;

  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2 ${
          state === 'completed'
            ? 'border-green-500 bg-green-50'
            : state === 'running'
              ? 'border-blue-500 bg-blue-50'
              : state === 'failed'
                ? 'border-red-500 bg-red-50'
                : state === 'review'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-muted bg-muted/30'
        }`}
      >
        <StageIcon className={`h-4 w-4 ${config.className}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${config.className}`}>{definition.label}</span>
          <StateIcon
            className={`h-3.5 w-3.5 ${config.className} ${state === 'running' ? 'animate-spin' : ''}`}
          />
        </div>
        {progressMessage && state === 'running' && (
          <p className="text-xs text-muted-foreground mt-0.5">{progressMessage}</p>
        )}
        {progressPercent !== undefined && state === 'running' && (
          <Progress value={progressPercent} className="mt-1.5 h-1.5" />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Review Panel
// ---------------------------------------------------------------------------

const ReviewPanel = ({
  runId,
  stage,
  data,
  onReviewed,
}: {
  runId: string;
  stage: string;
  data: unknown;
  onReviewed: () => void;
}) => {
  const [feedback, setFeedback] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayText =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  // Initialize edited content when entering edit mode
  const handleStartEditing = () => {
    setEditedContent(displayText);
    setIsEditing(true);
  };

  const handleAction = async (action: 'approve' | 'reject' | 'edit') => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/generations/${runId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          stage,
          feedback: action === 'reject' ? feedback : undefined,
          updated_data: action === 'edit' ? editedContent : undefined,
        }),
      });
      onReviewed();
    } catch {
      // Errors handled by UI
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-5 w-5" />
          Review Required: {stage === 'outline_review' ? 'Outline' : 'Edited Text'}
        </CardTitle>
        <CardDescription className="text-amber-700">
          Review the content below. You can approve, reject with feedback, or edit directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />
        ) : (
          <ScrollArea className="h-64 rounded-md border bg-white p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono">{displayText}</pre>
          </ScrollArea>
        )}

        {!isEditing && (
          <div className="space-y-2">
            <Textarea
              placeholder="Optional feedback (required for rejection)..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
          </div>
        )}

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                onClick={() => handleAction('edit')}
                disabled={isSubmitting || !editedContent.trim()}
                className="flex-1"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="h-4 w-4" />
                )}
                Save & Continue
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
              >
                Cancel Edit
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => handleAction('approve')}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={handleStartEditing}
                disabled={isSubmitting}
                className="flex-1"
              >
                <Pen className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleAction('reject')}
                disabled={isSubmitting || !feedback.trim()}
                className="flex-1"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsDown className="h-4 w-4" />
                )}
                Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Event log entry helper
// ---------------------------------------------------------------------------

const formatEventMessage = (event: SSEEvent): string => {
  switch (event.type) {
    case 'stage:started':
      return `Stage "${event.stage}" started`;
    case 'stage:progress':
      return `[${event.stage}] ${event.message}`;
    case 'stage:completed':
      return `Stage "${event.stage}" completed in ${(event.duration_ms / 1000).toFixed(1)}s${event.tokens ? ` (${event.tokens} tokens)` : ''}`;
    case 'stage:failed':
      return `Stage "${event.stage}" failed: ${event.error}`;
    case 'generation:completed':
      return `Generation completed. Article ID: ${event.article_id}`;
    case 'generation:failed':
      return `Generation failed: ${event.error}`;
    case 'interrupt:waiting':
      return `Waiting for review at stage "${event.stage}"`;
    case 'interrupt:resumed':
      return `Review completed, resuming from stage "${event.stage}"`;
    default:
      return 'Unknown event';
  }
};

// ---------------------------------------------------------------------------
// Generation Monitor Page
// ---------------------------------------------------------------------------

export const GenerationMonitorPage = () => {
  const { id: runId } = useParams<{ id: string }>();
  const { data: generation, isLoading, error, refetch } = useGeneration(runId);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Generation store state (populated by SSE)
  const storeStages = useGenerationStore((s) => s.stages);
  const storeEvents = useGenerationStore((s) => s.events);
  const interruptData = useGenerationStore((s) => s.interruptData);
  const setActiveRun = useGenerationStore((s) => s.setActiveRun);
  const setInterrupt = useGenerationStore((s) => s.setInterrupt);
  const resetStore = useGenerationStore((s) => s.reset);

  // Determine if generation is still active (not completed/failed)
  const isActive =
    !!generation &&
    generation.status !== 'completed' &&
    generation.status !== 'failed';

  // Set active run in store and connect SSE
  useEffect(() => {
    if (runId) {
      setActiveRun(runId);
    }
    return () => {
      resetStore();
    };
  }, [runId, setActiveRun, resetStore]);

  // Connect SSE via the shared hook
  const { isConnected, error: sseError } = useSSE({
    runId: runId ?? null,
    enabled: isActive,
  });

  // Refetch generation data when terminal SSE events arrive
  const prevEventsLength = useRef(0);
  useEffect(() => {
    if (storeEvents.length > prevEventsLength.current) {
      const newEvents = storeEvents.slice(prevEventsLength.current);
      prevEventsLength.current = storeEvents.length;

      const hasTerminal = newEvents.some(
        (e) =>
          e.type === 'generation:completed' ||
          e.type === 'generation:failed' ||
          e.type === 'stage:completed' ||
          e.type === 'stage:failed' ||
          e.type === 'interrupt:waiting',
      );
      if (hasTerminal) {
        refetch();
      }
    }
  }, [storeEvents, refetch]);

  // Detect interrupt state from generation data (if SSE missed it)
  useEffect(() => {
    if (
      generation &&
      (generation.status === 'outline_review' || generation.status === 'edit_review') &&
      !interruptData
    ) {
      setInterrupt({ stage: generation.status, data: null });
    }
  }, [generation, interruptData, setInterrupt]);

  // Auto-scroll event log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storeEvents.length]);

  // Compute overall progress percentage
  const computeProgress = (): number => {
    if (!generation) return 0;
    if (generation.status === 'completed') return 100;
    if (generation.status === 'failed') return 0;
    const totalStages = PIPELINE_STAGES.length;
    let completed = 0;
    for (const stage of PIPELINE_STAGES) {
      const state = getStageState(
        stage.key,
        stage,
        generation.status,
        generation.stages_log ?? [],
        storeStages,
      );
      if (state === 'completed') completed++;
      else if (state === 'running' || state === 'review') completed += 0.5;
    }
    return Math.round((completed / totalStages) * 100);
  };

  // Loading / error states
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !generation) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-semibold">Generation Not Found</h2>
        <p className="text-muted-foreground">
          {error?.message || 'The generation you are looking for does not exist.'}
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const overallProgress = computeProgress();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Generation Monitor</h1>
          </div>
          <p className="text-muted-foreground ml-10 max-w-xl truncate">{generation.topic}</p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <Badge variant="outline" className={isConnected ? 'border-green-200 text-green-600' : 'border-yellow-200 text-yellow-600'}>
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </Badge>
          )}
          {sseError && (
            <Badge variant="outline" className="border-red-200 text-red-600">
              SSE Error
            </Badge>
          )}
          {generation.langsmith_trace_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={generation.langsmith_trace_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                LangSmith Trace
              </a>
            </Button>
          )}
          {generation.result_article_id && (
            <Button size="sm" asChild>
              <Link to={`/articles/${generation.result_article_id}`}>
                <FileText className="h-3.5 w-3.5" />
                View Article
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {generation.status === 'completed'
                ? 'Generation Complete'
                : generation.status === 'failed'
                  ? 'Generation Failed'
                  : 'Generation In Progress'}
            </span>
            <span className="text-sm text-muted-foreground">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>
              Started: {new Date(generation.created_at).toLocaleString()}
            </span>
            <span>
              {generation.total_tokens > 0 &&
                `${generation.total_tokens.toLocaleString()} tokens | $${Number(generation.total_cost_usd).toFixed(4)}`}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline stages */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Stages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0 divide-y">
                {PIPELINE_STAGES.map((stageDef) => {
                  const state = getStageState(
                    stageDef.key,
                    stageDef,
                    generation.status,
                    generation.stages_log ?? [],
                    storeStages,
                  );
                  const storeStage = storeStages[stageDef.key];
                  return (
                    <PipelineStage
                      key={stageDef.key}
                      definition={stageDef}
                      state={state}
                      progressMessage={storeStage?.message}
                      progressPercent={storeStage?.progress}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Review panel (if interrupt is active) */}
          {interruptData &&
            (generation.status === 'outline_review' ||
              generation.status === 'edit_review') && (
              <ReviewPanel
                runId={generation.id}
                stage={interruptData.stage}
                data={interruptData.data}
                onReviewed={() => {
                  setInterrupt(null);
                  refetch();
                }}
              />
            )}

          {/* Error display */}
          {generation.status === 'failed' && generation.error_message && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-800">
                  <XCircle className="h-5 w-5" />
                  Generation Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-700">{generation.error_message}</p>
              </CardContent>
            </Card>
          )}

          {/* Completion display */}
          {generation.status === 'completed' && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="h-5 w-5" />
                  Generation Completed
                </CardTitle>
                <CardDescription className="text-green-700">
                  Completed at {generation.completed_at ? new Date(generation.completed_at).toLocaleString() : 'N/A'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-700">
                    Total cost: ${Number(generation.total_cost_usd).toFixed(4)} |{' '}
                    {generation.total_tokens.toLocaleString()} tokens
                  </span>
                  {generation.result_article_id && (
                    <Button size="sm" asChild>
                      <Link to={`/articles/${generation.result_article_id}`}>
                        <FileText className="h-3.5 w-3.5" />
                        View Article
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Event log sidebar */}
        <div>
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Event Log</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {storeEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {isActive
                      ? 'Waiting for events...'
                      : 'No events recorded for this session.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {storeEvents.map((event, index) => {
                      const timestamp =
                        'timestamp' in event && typeof event.timestamp === 'string'
                          ? event.timestamp
                          : new Date().toISOString();
                      const message = formatEventMessage(event);

                      return (
                        <div key={index} className="text-xs">
                          <span className="text-muted-foreground">
                            {new Date(timestamp).toLocaleTimeString()}
                          </span>
                          <span className="mx-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 py-0 ${
                                event.type.includes('failed')
                                  ? 'border-red-200 text-red-600'
                                  : event.type.includes('completed')
                                    ? 'border-green-200 text-green-600'
                                    : event.type.includes('progress')
                                      ? 'border-blue-200 text-blue-600'
                                      : event.type.includes('interrupt')
                                        ? 'border-amber-200 text-amber-600'
                                        : 'border-gray-200 text-gray-600'
                              }`}
                            >
                              {event.type.split(':')[1] || event.type}
                            </Badge>
                          </span>
                          <p className="text-muted-foreground mt-0.5 leading-relaxed">
                            {message}
                          </p>
                          <Separator className="mt-2" />
                        </div>
                      );
                    })}
                    <div ref={logEndRef} />
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Generation details */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono truncate ml-2 max-w-[160px]">{generation.id}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={
                    generation.status === 'completed'
                      ? 'border-green-200 text-green-600'
                      : generation.status === 'failed'
                        ? 'border-red-200 text-red-600'
                        : 'border-blue-200 text-blue-600'
                  }
                >
                  {generation.status}
                </Badge>
              </div>
              <Separator />
              {generation.input_urls && generation.input_urls.length > 0 && (
                <>
                  <div>
                    <span className="text-muted-foreground">Source URLs</span>
                    <div className="mt-1 space-y-1">
                      {generation.input_urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-blue-600 hover:underline truncate max-w-[200px]"
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}
              {generation.target_keywords && generation.target_keywords.length > 0 && (
                <>
                  <div>
                    <span className="text-muted-foreground">Keywords</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {generation.target_keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[10px]">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(generation.created_at).toLocaleString()}</span>
              </div>
              {generation.completed_at && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span>{new Date(generation.completed_at).toLocaleString()}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
