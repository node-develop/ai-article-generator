import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArticles } from '@/api/hooks';
import type { ContentType } from '@articleforge/shared/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
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

const PER_PAGE = 12;

export const LibraryPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');

  const filters = {
    contentType: contentTypeFilter !== 'all' ? (contentTypeFilter as ContentType) : undefined,
    isReference: true,
  };

  const { data: response, isLoading } = useArticles(page, PER_PAGE, filters);

  const articles = response?.data ?? [];
  const totalPages = response?.total_pages ?? 1;
  const total = response?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reference Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse reference articles used for RAG context.{' '}
          {total > 0 && `${total} article${total !== 1 ? 's' : ''} in the library.`}
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

      {/* Article grid */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No reference articles found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Card
              key={article.id}
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => navigate(`/articles/${article.id}`)}
            >
              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <Badge
                    className={`shrink-0 border-0 ${CONTENT_TYPE_COLORS[article.content_type] ?? ''}`}
                  >
                    {CONTENT_TYPE_LABELS[article.content_type] ?? article.content_type}
                  </Badge>
                </div>
                <h3 className="line-clamp-2 text-sm font-medium leading-snug">
                  {article.title}
                </h3>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(article.published_at ?? article.created_at)}
                </div>
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
