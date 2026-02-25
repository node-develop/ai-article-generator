import { useAuth } from '@/hooks/useAuth';
import { useMyStats, useAdminStats, useAdminUserStats } from '@/api/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  FileText,
  Coins,
  Hash,
  Loader2,
  Users,
  Clock,
} from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

const StatCard = ({ label, value, icon, description }: StatCardProps) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

const formatCost = (cost: string | number) => {
  const num = typeof cost === 'string' ? parseFloat(cost) : cost;
  return `$${num.toFixed(4)}`;
};

const formatNumber = (n: number) => n.toLocaleString();

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MyStatsSection = () => {
  const { data: stats, isLoading } = useMyStats();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground">Could not load your statistics.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Generations"
          value={formatNumber(stats.total_generations)}
          icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          label="Completed"
          value={formatNumber(stats.completed_generations)}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
        />
        <StatCard
          label="Failed"
          value={formatNumber(stats.failed_generations)}
          icon={<XCircle className="h-5 w-5 text-red-500" />}
        />
        <StatCard
          label="Total Articles"
          value={formatNumber(stats.total_articles)}
          icon={<FileText className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          label="Tokens Used"
          value={formatNumber(stats.total_tokens_used)}
          icon={<Hash className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          label="Total Cost"
          value={formatCost(stats.total_cost_usd)}
          icon={<Coins className="h-5 w-5 text-muted-foreground" />}
        />
      </div>
      {stats.last_generation_at && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Last generation: {formatDate(stats.last_generation_at)}
        </p>
      )}
    </div>
  );
};

const GlobalStatsSection = () => {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground">Could not load global statistics.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Total Generations"
        value={formatNumber(stats.total_generations)}
        icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
      />
      <StatCard
        label="Completed"
        value={formatNumber(stats.completed_generations)}
        icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
      />
      <StatCard
        label="Failed"
        value={formatNumber(stats.failed_generations)}
        icon={<XCircle className="h-5 w-5 text-red-500" />}
      />
      <StatCard
        label="Total Articles"
        value={formatNumber(stats.total_articles)}
        icon={<FileText className="h-5 w-5 text-muted-foreground" />}
      />
      <StatCard
        label="Tokens Used"
        value={formatNumber(stats.total_tokens_used)}
        icon={<Hash className="h-5 w-5 text-muted-foreground" />}
      />
      <StatCard
        label="Total Cost"
        value={formatCost(stats.total_cost_usd)}
        icon={<Coins className="h-5 w-5 text-muted-foreground" />}
      />
    </div>
  );
};

const PerUserStatsSection = () => {
  const { data: userStats, isLoading } = useAdminUserStats();

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = Array.isArray(userStats) ? userStats : [];

  if (stats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No per-user statistics available.</p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Per-User Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 pr-4 font-medium text-muted-foreground">User</th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
                  Generations
                </th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
                  Completed
                </th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
                  Failed
                </th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
                  Articles
                </th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">
                  Tokens
                </th>
                <th className="pb-3 text-right font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((user) => (
                <tr key={user.user_id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{user.user_name}</td>
                  <td className="py-3 pr-4 text-right">
                    {formatNumber(user.total_generations)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatNumber(user.completed_generations)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatNumber(user.failed_generations)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatNumber(user.total_articles)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatNumber(user.total_tokens_used)}
                  </td>
                  <td className="py-3 text-right">{formatCost(user.total_cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export const StatsPage = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statistics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View generation statistics and usage metrics.
        </p>
      </div>

      {isAdmin() ? (
        <Tabs defaultValue="my-stats">
          <TabsList>
            <TabsTrigger value="my-stats">My Stats</TabsTrigger>
            <TabsTrigger value="global">Global</TabsTrigger>
          </TabsList>

          <TabsContent value="my-stats" className="mt-6">
            <MyStatsSection />
          </TabsContent>

          <TabsContent value="global" className="mt-6 space-y-6">
            <div>
              <h2 className="mb-4 text-lg font-semibold">Global Statistics</h2>
              <GlobalStatsSection />
            </div>
            <PerUserStatsSection />
          </TabsContent>
        </Tabs>
      ) : (
        <MyStatsSection />
      )}
    </div>
  );
};
