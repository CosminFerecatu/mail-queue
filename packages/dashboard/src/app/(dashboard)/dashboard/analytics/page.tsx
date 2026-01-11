'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subDays, format, startOfDay, endOfDay } from 'date-fns';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDeliveryStats, getEngagementStats } from '@/lib/api';
import { useAppContext } from '@/contexts/app-context';

const timeRanges = [
  { label: 'Last 7 days', value: '7', days: 7 },
  { label: 'Last 14 days', value: '14', days: 14 },
  { label: 'Last 30 days', value: '30', days: 30 },
];

export default function AnalyticsPage() {
  const { apps } = useAppContext();
  const [timeRange, setTimeRange] = useState('7');
  const [selectedApp, setSelectedApp] = useState('');

  // Memoize date range to prevent infinite re-fetches
  // Normalize to day boundaries so dates are stable across renders/remounts
  const { from, to } = useMemo(() => {
    const days = timeRanges.find((r) => r.value === timeRange)?.days || 7;
    const now = new Date();
    return {
      from: startOfDay(subDays(now, days)).toISOString(),
      to: endOfDay(now).toISOString(),
    };
  }, [timeRange]);

  const { data: deliveryData, isLoading: isLoadingDelivery } = useQuery({
    queryKey: ['analytics-delivery', selectedApp, from, to],
    queryFn: () =>
      getDeliveryStats({
        appId: selectedApp || undefined,
        from,
        to,
      }),
  });

  const { data: engagementData, isLoading: isLoadingEngagement } = useQuery({
    queryKey: ['analytics-engagement', selectedApp, from, to],
    queryFn: () =>
      getEngagementStats({
        appId: selectedApp || undefined,
        from,
        to,
      }),
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'MMM d');
  };

  return (
    <>
      <Header title="Analytics" description="Email performance metrics and trends" />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <Tabs value={timeRange} onValueChange={setTimeRange}>
            <TabsList>
              {timeRanges.map((range) => (
                <TabsTrigger key={range.value} value={range.value}>
                  {range.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Select
            value={selectedApp || 'all'}
            onValueChange={(value) => setSelectedApp(value === 'all' ? '' : value)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Applications" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Applications</SelectItem>
              {apps.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Email Delivery</CardTitle>
              <CardDescription>
                Sent, delivered, bounced, and failed emails over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDelivery ? (
                <Skeleton className="h-[300px] w-full" />
              ) : deliveryData && deliveryData.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={deliveryData.data}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatDate}
                      className="text-xs fill-muted-foreground"
                    />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelFormatter={formatDate}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="sent"
                      stackId="1"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.5)"
                      name="Sent"
                    />
                    <Area
                      type="monotone"
                      dataKey="delivered"
                      stackId="2"
                      stroke="hsl(142 76% 36%)"
                      fill="hsl(142 76% 36% / 0.5)"
                      name="Delivered"
                    />
                    <Area
                      type="monotone"
                      dataKey="bounced"
                      stackId="3"
                      stroke="hsl(45 93% 47%)"
                      fill="hsl(45 93% 47% / 0.5)"
                      name="Bounced"
                    />
                    <Area
                      type="monotone"
                      dataKey="failed"
                      stackId="4"
                      stroke="hsl(0 84% 60%)"
                      fill="hsl(0 84% 60% / 0.5)"
                      name="Failed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engagement</CardTitle>
              <CardDescription>Opens, clicks, and unsubscribes over time</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingEngagement ? (
                <Skeleton className="h-[300px] w-full" />
              ) : engagementData && engagementData.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={engagementData.data}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatDate}
                      className="text-xs fill-muted-foreground"
                    />
                    <YAxis className="text-xs fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelFormatter={formatDate}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="opened"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      name="Opens"
                    />
                    <Line
                      type="monotone"
                      dataKey="clicked"
                      stroke="hsl(142 76% 36%)"
                      strokeWidth={2}
                      dot={false}
                      name="Clicks"
                    />
                    <Line
                      type="monotone"
                      dataKey="unsubscribed"
                      stroke="hsl(0 84% 60%)"
                      strokeWidth={2}
                      dot={false}
                      name="Unsubscribes"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Delivery Rate</CardTitle>
              <CardDescription>Percentage of emails successfully delivered</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDelivery ? (
                <Skeleton className="h-24" />
              ) : deliveryData ? (
                <div className="text-center">
                  <div className="text-5xl font-bold text-success">
                    {deliveryData.data.length > 0
                      ? `${(
                          (deliveryData.totals.delivered / Math.max(deliveryData.totals.sent, 1)) *
                            100
                        ).toFixed(1)}%`
                      : '0%'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {deliveryData.totals.delivered.toLocaleString()} of{' '}
                    {deliveryData.totals.sent.toLocaleString()} emails
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Rate</CardTitle>
              <CardDescription>Percentage of delivered emails opened</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingEngagement || isLoadingDelivery ? (
                <Skeleton className="h-24" />
              ) : engagementData && deliveryData ? (
                <div className="text-center">
                  <div className="text-5xl font-bold text-primary">
                    {deliveryData.data.length > 0 && engagementData.data.length > 0
                      ? `${(
                          (engagementData.totals.opened /
                            Math.max(deliveryData.totals.delivered, 1)) *
                            100
                        ).toFixed(1)}%`
                      : '0%'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {engagementData.totals.opened.toLocaleString()} opens
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Click Rate</CardTitle>
              <CardDescription>Percentage of opened emails with clicks</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingEngagement ? (
                <Skeleton className="h-24" />
              ) : engagementData ? (
                <div className="text-center">
                  <div className="text-5xl font-bold text-success">
                    {engagementData.data.length > 0
                      ? `${(
                          (engagementData.totals.clicked /
                            Math.max(engagementData.totals.opened, 1)) *
                            100
                        ).toFixed(1)}%`
                      : '0%'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {engagementData.totals.clicked.toLocaleString()} clicks
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
