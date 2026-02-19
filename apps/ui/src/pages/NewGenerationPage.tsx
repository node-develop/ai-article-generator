import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus, X, Loader2, Link as LinkIcon, Tag, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ContentType } from '@articleforge/shared/types';
import { useCreateGeneration } from '@/api/hooks';

// ---------------------------------------------------------------------------
// Multi-value input helper
// ---------------------------------------------------------------------------

const MultiValueInput = ({
  label,
  placeholder,
  values,
  onAdd,
  onRemove,
  icon: Icon,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  icon: React.ElementType;
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !values.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" size="default" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {values.map((value, index) => (
            <Badge key={`${value}-${index}`} variant="secondary" className="gap-1 pr-1">
              {value}
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// New Generation Page
// ---------------------------------------------------------------------------

export const NewGenerationPage = () => {
  const navigate = useNavigate();
  const createMut = useCreateGeneration();

  const [topic, setTopic] = useState('');
  const [contentType, setContentType] = useState<ContentType>('longread');
  const [inputUrl, setInputUrl] = useState('');
  const [companyLinks, setCompanyLinks] = useState<string[]>([]);
  const [targetKeywords, setTargetKeywords] = useState<string[]>([]);
  const [enableOutlineReview, setEnableOutlineReview] = useState(false);
  const [enableEditReview, setEnableEditReview] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    try {
      const result = await createMut.mutateAsync({
        topic: topic.trim(),
        contentType,
        inputUrl: inputUrl.trim() || undefined,
        companyLinks: companyLinks.length > 0 ? companyLinks : undefined,
        targetKeywords: targetKeywords.length > 0 ? targetKeywords : undefined,
        enableOutlineReview,
        enableEditReview,
      });
      navigate(`/generation/${result.id}`);
    } catch {
      // Error is captured in createMut.error
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">New Article Generation</h1>
        <p className="text-muted-foreground">
          Configure and start a new AI-powered article generation pipeline.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Generation Settings</CardTitle>
            <CardDescription>
              Provide the topic and optional context for the generation pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Topic */}
            <div className="space-y-2">
              <Label htmlFor="topic">
                Topic <span className="text-destructive">*</span>
              </Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Best practices for React Server Components in 2026"
                required
              />
              <p className="text-xs text-muted-foreground">
                The main subject of the article to generate.
              </p>
            </div>

            {/* Content Type */}
            <div className="space-y-2">
              <Label htmlFor="contentType">Article Format</Label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger id="contentType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="longread">Longread — deep article, 4-6 sections</SelectItem>
                  <SelectItem value="review">Review — comparison, pros/cons</SelectItem>
                  <SelectItem value="tutorial">Tutorial — step-by-step guide</SelectItem>
                  <SelectItem value="news">News — brief format, facts</SelectItem>
                  <SelectItem value="digest">Digest — short annotated blocks</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose the article format. This affects structure, length, and style.
              </p>
            </div>

            {/* Input URL */}
            <div className="space-y-2">
              <Label htmlFor="inputUrl">Input URL (optional)</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="inputUrl"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://example.com/source-article"
                  type="url"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Provide a URL to use as the primary source for the article.
              </p>
            </div>

            <Separator />

            {/* Company Links */}
            <MultiValueInput
              label="Company Links (optional)"
              placeholder="https://company.com/product"
              values={companyLinks}
              onAdd={(v) => setCompanyLinks((prev) => [...prev, v])}
              onRemove={(i) => setCompanyLinks((prev) => prev.filter((_, idx) => idx !== i))}
              icon={LinkIcon}
            />

            {/* Target Keywords */}
            <MultiValueInput
              label="Target Keywords (optional)"
              placeholder="React, server components, performance"
              values={targetKeywords}
              onAdd={(v) => setTargetKeywords((prev) => [...prev, v])}
              onRemove={(i) => setTargetKeywords((prev) => prev.filter((_, idx) => idx !== i))}
              icon={Tag}
            />

            <Separator />

            {/* Review toggles */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Review Checkpoints</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="outline-review">Review outline before writing</Label>
                  <p className="text-xs text-muted-foreground">
                    Pause after outline generation to review and approve before continuing.
                  </p>
                </div>
                <Switch
                  id="outline-review"
                  checked={enableOutlineReview}
                  onCheckedChange={setEnableOutlineReview}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-review">Review text before image generation</Label>
                  <p className="text-xs text-muted-foreground">
                    Pause after editing to review the text before generating images.
                  </p>
                </div>
                <Switch
                  id="edit-review"
                  checked={enableEditReview}
                  onCheckedChange={setEnableEditReview}
                />
              </div>
            </div>

            {/* Error display */}
            {createMut.isError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">
                  {createMut.error?.message || 'An error occurred. Please try again.'}
                </p>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={!topic.trim() || createMut.isPending}>
              {createMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting Generation...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Start Generation
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};
