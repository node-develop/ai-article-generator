import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Hash,
  Loader2,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useGenerations, useDeleteGeneration } from '@/api/hooks';
import { useMyStats, useAdminStats } from '@/api/hooks';
import { useAuthStore } from '@/stores/auth';
import type { GenerationStatus } from '@articleforge/shared/types';

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  research: { label: 'Research', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  rag_context: { label: 'RAG Context', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  build_style_guide: { label: 'Style Guide', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  outline: { label: 'Outline', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  outline_review: { label: 'Outline Review', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  writing: { label: 'Writing', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  editing: { label: 'Editing', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  edit_review: { label: 'Edit Review', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  images: { label: 'Images', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  assembling: { label: 'Assembling', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700 border-red-200' },
};

const StatusBadge = ({ status }: { status: GenerationStatus }) => {
  const config = statusConfig[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
};

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

const StatCard = ({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------
// Generations table
// ---------------------------------------------------------------------------

const GenerationsTable = ({
  page,
  perPage,
  onPageChange,
}: {
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
}) => {
  const { data, isLoading, error } = useGenerations(page, perPage);
  const deleteMut = useDeleteGeneration();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">Failed to load generations: {error.message}</p>;
  }

  const generations = data?.data ?? [];
  const totalPages = data?.total_pages ?? 1;

  if (generations.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No generations yet. Start your first one!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Topic</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Cost</th>
              <th className="pb-3 pr-4 font-medium">Created</th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {generations.map((gen) => (
              <tr key={gen.id} className="border-b last:border-0">
                <td className="py-3 pr-4 max-w-xs truncate font-medium">{gen.topic}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={gen.status} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  ${Number(gen.total_cost_usd).toFixed(4)}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {new Date(gen.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/generation/${gen.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="ml-1">View</span>
                      </Link>
                    </Button>
                    {gen.result_article_id && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/articles/${gen.result_article_id}`}>
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('Delete this generation?')) {
                          deleteMut.mutate(gen.id);
                        }
                      }}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({data?.total ?? 0} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export const DashboardPage = () => {
  const [myPage, setMyPage] = useState(1);
  const [adminPage, setAdminPage] = useState(1);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const { data: myStats, isLoading: statsLoading } = useMyStats();
  const { data: adminStats } = useAdminStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your generation pipeline</p>
        </div>
        <Button asChild>
          <Link to="/generate">
            <Sparkles className="h-4 w-4" />
            New Article
          </Link>
        </Button>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-12 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : myStats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Generations"
            value={myStats.total_generations}
            icon={Hash}
          />
          <StatCard
            title="Completed"
            value={myStats.completed_generations}
            icon={CheckCircle2}
          />
          <StatCard
            title="Failed"
            value={myStats.failed_generations}
            icon={XCircle}
          />
          <StatCard
            title="Articles"
            value={myStats.total_articles}
            icon={FileText}
          />
          <StatCard
            title="Total Cost"
            value={`$${Number(myStats.total_cost_usd).toFixed(2)}`}
            icon={Coins}
            description={`${myStats.total_tokens_used.toLocaleString()} tokens used`}
          />
        </div>
      ) : null}

      <Separator />

      {/* Tabs for generations */}
      {isAdmin() ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">My Generations</TabsTrigger>
            <TabsTrigger value="all">All Generations (Admin)</TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>My Generations</CardTitle>
              </CardHeader>
              <CardContent>
                <GenerationsTable page={myPage} perPage={10} onPageChange={setMyPage} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <div className="space-y-4">
              {adminStats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    title="Global Generations"
                    value={adminStats.total_generations}
                    icon={Hash}
                  />
                  <StatCard
                    title="Global Completed"
                    value={adminStats.completed_generations}
                    icon={CheckCircle2}
                  />
                  <StatCard
                    title="Global Articles"
                    value={adminStats.total_articles}
                    icon={FileText}
                  />
                  <StatCard
                    title="Global Cost"
                    value={`$${Number(adminStats.total_cost_usd).toFixed(2)}`}
                    icon={Coins}
                    description={`${adminStats.total_tokens_used.toLocaleString()} tokens used`}
                  />
                </div>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>All Generations</CardTitle>
                </CardHeader>
                <CardContent>
                  <GenerationsTable page={adminPage} perPage={10} onPageChange={setAdminPage} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Generations</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <GenerationsTable page={myPage} perPage={10} onPageChange={setMyPage} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
