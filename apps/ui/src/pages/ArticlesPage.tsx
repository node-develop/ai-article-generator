import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArticles, useDeleteArticle } from '@/api/hooks';
import { useAuthStore } from '@/stores/auth';
import type { ContentType } from '@articleforge/shared/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  ExternalLink,
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const PER_PAGE = 10;

export const ArticlesPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const deleteArticle = useDeleteArticle();
  const canDelete = useAuthStore((s) => s.canGenerate); // admin or editor

  const filters = {
    contentType: contentTypeFilter !== 'all' ? (contentTypeFilter as ContentType) : undefined,
    isReference: false,
  };

  const { data: response, isLoading } = useArticles(page, PER_PAGE, filters);

  const articles = response?.data ?? [];
  const totalPages = response?.total_pages ?? 1;
  const total = response?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Articles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse your generated articles. {total > 0 && `${total} article${total !== 1 ? 's' : ''} total.`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Content Type:</label>
          <Select
            value={contentTypeFilter}
            onValueChange={(val) => {
              setContentTypeFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="tutorial">Tutorial</SelectItem>
              <SelectItem value="longread">Longread</SelectItem>
              <SelectItem value="news">News</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Article list */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No articles found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <Card
              key={article.id}
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => navigate(`/articles/${article.id}`)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{article.title}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(article.created_at)}
                    </span>
                    {article.source_url && (
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        Source
                      </span>
                    )}
                  </div>
                </div>
                <Badge
                  className={`shrink-0 border-0 ${CONTENT_TYPE_COLORS[article.content_type] ?? ''}`}
                >
                  {CONTENT_TYPE_LABELS[article.content_type] ?? article.content_type}
                </Badge>
                {canDelete() && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        disabled={deleteArticle.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete article?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{article.title}" and all associated data.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => deleteArticle.mutate(article.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
