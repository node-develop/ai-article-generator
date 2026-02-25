import { useParams, Link, useNavigate } from 'react-router-dom';
import { useArticle, useSaveToLibrary, useDeleteArticle } from '@/api/hooks';
import { useAuthStore } from '@/stores/auth';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ExternalLink,
  Hash,
  FileText,
  Layers,
  Loader2,
  Trash2,
} from 'lucide-react';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  review: 'Review',
  tutorial: 'Tutorial',
  longread: 'Longread',
  news: 'News',
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  review: 'bg-blue-100 text-blue-800',
  tutorial: 'bg-green-100 text-green-800',
  longread: 'bg-purple-100 text-purple-800',
  news: 'bg-orange-100 text-orange-800',
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const ArticleDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: article, isLoading, error } = useArticle(id);
  const saveToLibrary = useSaveToLibrary();
  const deleteArticle = useDeleteArticle();
  const canDelete = useAuthStore((s) => s.canGenerate); // admin or editor

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="space-y-4">
        <Link to="/articles">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to articles
          </Button>
        </Link>
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Article not found.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const charCount = article.clean_text?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to={article.is_reference ? '/library' : '/articles'}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1 h-4 w-4" />
          {article.is_reference ? 'Back to library' : 'Back to articles'}
        </Button>
      </Link>

      {/* Actions for generated articles */}
      {!article.is_reference && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saveToLibrary.isPending}
            onClick={() => saveToLibrary.mutate(article.id)}
          >
            <BookOpen className="mr-1.5 h-4 w-4" />
            {saveToLibrary.isPending ? 'Saving...' : 'Save to Library'}
          </Button>
          {canDelete() && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteArticle.isPending}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {deleteArticle.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete article?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this article and all associated data.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => {
                      deleteArticle.mutate(article.id, {
                        onSuccess: () => navigate('/articles'),
                      });
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{article.title}</h1>
          <Badge
            className={`border-0 ${CONTENT_TYPE_COLORS[article.content_type] ?? ''}`}
          >
            {CONTENT_TYPE_LABELS[article.content_type] ?? article.content_type}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {formatDate(article.published_at ?? article.created_at)}
          </span>
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Source URL
            </a>
          )}
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-4">
          {/* Hubs */}
          {article.hubs && article.hubs.length > 0 && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-wrap gap-1.5">
                {article.hubs.map((hub) => (
                  <Badge key={hub} variant="secondary" className="text-xs">
                    {hub}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Char count */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{charCount.toLocaleString()} characters</span>
          </div>

          {/* Chunks count */}
          {article.chunks_count != null && article.chunks_count > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span>{article.chunks_count} chunks</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Article body */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Article Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.clean_text ?? ''}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
