import { useState, useEffect } from 'react';
import { usePrompts, usePromptHistory, useUpdatePrompt } from '@/api/hooks';
import type { PromptResponse } from '@articleforge/shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster';
import {
  FileText,
  Save,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Eye,
  X,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { key: 'research', label: 'Research' },
  { key: 'outline', label: 'Outline' },
  { key: 'write_section', label: 'Write Sections' },
  { key: 'edit_polish', label: 'Edit & Polish' },
  { key: 'image_prompt', label: 'Image Generate' },
] as const;

const STAGE_PLACEHOLDERS: Record<string, string[]> = {
  research: ['{topic}', '{target_keywords}', '{input_url}'],
  outline: ['{topic}', '{research_results}', '{rag_context}', '{target_keywords}'],
  write_section: ['{topic}', '{outline}', '{research_results}', '{rag_context}'],
  edit_polish: ['{topic}', '{draft}', '{sections}', '{target_keywords}'],
  image_prompt: ['{topic}', '{outline}', '{sections}'],
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const PromptEditorPage = () => {
  const [selectedStage, setSelectedStage] = useState<string>('research');
  const [selectedContentType, setSelectedContentType] = useState<string>('all');
  const [editName, setEditName] = useState('');
  const [editTemplate, setEditTemplate] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<PromptResponse | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data: prompts, isLoading: promptsLoading } = usePrompts();
  const { data: history, isLoading: historyLoading } = usePromptHistory(selectedStage);
  const updatePrompt = useUpdatePrompt();

  const activePrompt = Array.isArray(prompts)
    ? prompts.find((p) => {
        const stageMatch = p.stage === selectedStage && p.is_active;
        if (selectedContentType === 'all') return stageMatch && !p.content_type;
        return stageMatch && p.content_type === selectedContentType;
      })
    : undefined;

  useEffect(() => {
    if (activePrompt && !viewingVersion) {
      setEditName(activePrompt.name);
      setEditTemplate(activePrompt.template);
      setIsDirty(false);
    }
  }, [activePrompt, viewingVersion]);

  const handleStageSelect = (stage: string) => {
    setSelectedStage(stage);
    setViewingVersion(null);
    setHistoryOpen(false);
    setIsDirty(false);
  };

  const handleSave = () => {
    if (!activePrompt) return;
    updatePrompt.mutate(
      { id: activePrompt.id, template: editTemplate, name: editName },
      {
        onSuccess: () => {
          toast({ title: 'Prompt saved', description: 'A new version has been created.' });
          setIsDirty(false);
          setViewingVersion(null);
        },
        onError: (err) => {
          toast({
            title: 'Save failed',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleViewVersion = (version: PromptResponse) => {
    setViewingVersion(version);
    setEditName(version.name);
    setEditTemplate(version.template);
    setIsDirty(false);
  };

  const handleExitVersionView = () => {
    setViewingVersion(null);
    if (activePrompt) {
      setEditName(activePrompt.name);
      setEditTemplate(activePrompt.template);
    }
    setIsDirty(false);
  };

  const placeholders = STAGE_PLACEHOLDERS[selectedStage] ?? [];
  const stageLabel = PIPELINE_STAGES.find((s) => s.key === selectedStage)?.label ?? selectedStage;
  const historyItems = Array.isArray(history) ? history : [];

  return (
    <div className="flex h-full gap-6">
      {/* Left sidebar - Stage list */}
      <div className="w-64 shrink-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Pipeline Stages
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <nav className="flex flex-col">
              {PIPELINE_STAGES.map((stage) => {
                const isActive = selectedStage === stage.key;
                const hasPrompt = Array.isArray(prompts)
                  ? prompts.some((p) => p.stage === stage.key && p.is_active)
                  : false;
                return (
                  <button
                    key={stage.key}
                    onClick={() => handleStageSelect(stage.key)}
                    className={`flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent ${
                      isActive
                        ? 'border-l-2 border-primary bg-accent font-medium text-foreground'
                        : 'border-l-2 border-transparent text-muted-foreground'
                    }`}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{stage.label}</span>
                    {hasPrompt && (
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                    )}
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>
      </div>

      {/* Main editor area */}
      <div className="flex-1 space-y-4">
        {promptsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !activePrompt ? (
          <Card>
            <CardContent className="flex h-64 items-center justify-center">
              <p className="text-muted-foreground">
                No active prompt found for stage "{stageLabel}".
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">
                  {viewingVersion ? viewingVersion.name : editName}
                </h2>
                <Badge variant="secondary">{stageLabel}</Badge>
                {viewingVersion && (
                  <Badge variant="outline">
                    Version {viewingVersion.version} (read-only)
                  </Badge>
                )}
                {activePrompt && !viewingVersion && (
                  <Badge variant="outline">v{activePrompt.version}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {viewingVersion && (
                  <Button variant="outline" size="sm" onClick={handleExitVersionView}>
                    <X className="mr-1 h-4 w-4" />
                    Exit version view
                  </Button>
                )}
                {!viewingVersion && (
                  <Button
                    onClick={handleSave}
                    disabled={updatePrompt.isPending || !isDirty}
                    size="sm"
                  >
                    {updatePrompt.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Save
                  </Button>
                )}
              </div>
            </div>

            {/* Content Type Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-muted-foreground">Format:</label>
              <Select value={selectedContentType} onValueChange={setSelectedContentType}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Universal (default)</SelectItem>
                  <SelectItem value="longread">Longread</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="tutorial">Tutorial</SelectItem>
                  <SelectItem value="news">News</SelectItem>
                  <SelectItem value="digest">Digest</SelectItem>
                </SelectContent>
              </Select>
              {selectedContentType !== 'all' && !activePrompt && (
                <span className="text-xs text-muted-foreground">
                  No format-specific prompt. Using universal default.
                </span>
              )}
            </div>

            {/* Prompt Name */}
            {!viewingVersion && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Prompt Name
                </label>
                <Input
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Prompt name..."
                  className="max-w-md"
                />
              </div>
            )}

            {/* Template Editor */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Template
              </label>
              <Textarea
                value={viewingVersion ? viewingVersion.template : editTemplate}
                onChange={(e) => {
                  setEditTemplate(e.target.value);
                  setIsDirty(true);
                }}
                readOnly={!!viewingVersion}
                className="min-h-[400px] resize-y font-mono text-sm leading-relaxed"
                placeholder="Enter your prompt template..."
              />
            </div>

            {/* Placeholders reference */}
            {placeholders.length > 0 && (
              <div className="rounded-lg border bg-muted/50 px-4 py-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Available Placeholders
                </p>
                <div className="flex flex-wrap gap-2">
                  {placeholders.map((ph) => (
                    <code
                      key={ph}
                      className="rounded bg-background px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {ph}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Version History Panel */}
            <div>
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {historyOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Clock className="h-4 w-4" />
                Version History
              </button>

              {historyOpen && (
                <Card className="mt-3">
                  <CardContent className="p-0">
                    {historyLoading ? (
                      <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : historyItems.length === 0 ? (
                      <div className="flex h-32 items-center justify-center">
                        <p className="text-sm text-muted-foreground">No version history yet.</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-64">
                        <div className="divide-y">
                          {historyItems.map((version) => (
                            <div
                              key={version.id}
                              className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent ${
                                viewingVersion?.id === version.id ? 'bg-accent' : ''
                              }`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    Version {version.version}
                                  </span>
                                  {version.is_active && (
                                    <Badge variant="default" className="text-[10px]">
                                      Active
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {formatDate(version.created_at)}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewVersion(version)}
                                className="shrink-0"
                              >
                                <Eye className="mr-1 h-3.5 w-3.5" />
                                View
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
