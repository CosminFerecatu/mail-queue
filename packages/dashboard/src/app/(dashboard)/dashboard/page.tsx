'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Mail,
  Send,
  CheckCircle,
  XCircle,
  MousePointerClick,
  Eye,
  AppWindow,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatPercentage } from '@/lib/utils';
import { getOverview } from '@/lib/api';

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {trend && (
              <span className={trend.positive ? 'text-success' : 'text-destructive'}>
                {trend.positive ? (
                  <ArrowUpRight className="h-3 w-3 inline" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 inline" />
                )}
                {trend.value}%
              </span>
            )}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['overview'],
    queryFn: getOverview,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <>
      <Header title="Overview" description="Monitor your email queue at a glance" />
      <div className="p-6 space-y-6">
        {error ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error loading dashboard</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : 'Failed to load data'}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={`stat1-${i}`} />)
          ) : (
            <>
              <StatCard
                title="Emails Today"
                value={formatNumber(data?.totalEmailsToday ?? 0)}
                description="from yesterday"
                icon={Mail}
                trend={{ value: 12, positive: true }}
              />
              <StatCard
                title="Emails This Month"
                value={formatNumber(data?.totalEmailsMonth ?? 0)}
                description="total this month"
                icon={Send}
              />
              <StatCard
                title="Active Apps"
                value={(data?.activeApps ?? 0).toString()}
                description="sending emails"
                icon={AppWindow}
              />
              <StatCard
                title="Active Queues"
                value={(data?.activeQueues ?? 0).toString()}
                description="processing emails"
                icon={Layers}
              />
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={`stat2-${i}`} />)
          ) : (
            <>
              <StatCard
                title="Delivery Rate"
                value={formatPercentage(data?.deliveryRate ?? 0)}
                icon={CheckCircle}
              />
              <StatCard
                title="Bounce Rate"
                value={formatPercentage(data?.bounceRate ?? 0)}
                icon={XCircle}
              />
              <StatCard
                title="Open Rate"
                value={formatPercentage(data?.openRate ?? 0)}
                icon={Eye}
              />
              <StatCard
                title="Click Rate"
                value={formatPercentage(data?.clickRate ?? 0)}
                icon={MousePointerClick}
              />
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Queue Status</CardTitle>
              <CardDescription>Current email processing status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-warning animate-pulse" />
                      <span className="text-sm font-medium">Pending</span>
                    </div>
                    <span className="text-2xl font-bold">
                      {formatNumber(data?.pendingEmails ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                      <span className="text-sm font-medium">Processing</span>
                    </div>
                    <span className="text-2xl font-bold">
                      {formatNumber(data?.processingEmails ?? 0)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <a
                href="/dashboard/apps"
                className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted transition-colors"
              >
                <AppWindow className="h-4 w-4" />
                <span className="text-sm">Manage Apps</span>
              </a>
              <a
                href="/dashboard/queues"
                className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted transition-colors"
              >
                <Layers className="h-4 w-4" />
                <span className="text-sm">View Queues</span>
              </a>
              <a
                href="/dashboard/emails"
                className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span className="text-sm">Browse Emails</span>
              </a>
              <a
                href="/dashboard/analytics"
                className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted transition-colors"
              >
                <Eye className="h-4 w-4" />
                <span className="text-sm">View Analytics</span>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
