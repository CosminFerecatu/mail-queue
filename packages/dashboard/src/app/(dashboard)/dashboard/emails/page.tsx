'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  RefreshCw,
  MoreHorizontal,
  Eye,
  RotateCcw,
  XCircle,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getEmails,
  getEmail,
  getEmailEvents,
  retryEmail,
  cancelEmail,
  getApps,
  getQueues,
  type Email,
} from '@/lib/api';

const statusConfig: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive';
    icon: React.ElementType;
  }
> = {
  queued: { label: 'Queued', variant: 'secondary', icon: Clock },
  processing: { label: 'Processing', variant: 'warning', icon: RefreshCw },
  sent: { label: 'Sent', variant: 'default', icon: Send },
  delivered: { label: 'Delivered', variant: 'success', icon: CheckCircle },
  bounced: { label: 'Bounced', variant: 'destructive', icon: AlertCircle },
  failed: { label: 'Failed', variant: 'destructive', icon: XCircle },
  cancelled: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
};

export default function EmailsPage() {
  const queryClient = useQueryClient();
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    appId: '',
    queueId: '',
  });

  const { data: appsData } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps({ limit: 100 }),
  });

  const { data: queuesData } = useQuery({
    queryKey: ['queues', filters.appId],
    queryFn: () => getQueues({ appId: filters.appId || undefined, limit: 100 }),
    enabled: true,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['emails', filters],
    queryFn: () =>
      getEmails({
        status: filters.status || undefined,
        appId: filters.appId || undefined,
        queueId: filters.queueId || undefined,
        limit: 50,
      }),
    refetchInterval: 10000,
  });

  const { data: emailDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['email', selectedEmail?.id],
    queryFn: () => (selectedEmail ? getEmail(selectedEmail.id) : null),
    enabled: !!selectedEmail,
  });

  const { data: emailEvents } = useQuery({
    queryKey: ['emailEvents', selectedEmail?.id],
    queryFn: () => (selectedEmail ? getEmailEvents(selectedEmail.id) : null),
    enabled: !!selectedEmail,
  });

  const retryMutation = useMutation({
    mutationFn: retryEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.queued;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getAppName = (appId: string) => {
    const app = appsData?.data.find((a) => a.id === appId);
    return app?.name || 'Unknown';
  };

  const getQueueName = (queueId: string) => {
    const queue = queuesData?.data.find((q) => q.id === queueId);
    return queue?.name || 'Unknown';
  };

  return (
    <>
      <Header title="Emails" description="Browse and manage email messages" />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.appId}
              onValueChange={(value) => setFilters({ ...filters, appId: value, queueId: '' })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Apps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Apps</SelectItem>
                {appsData?.data.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.queueId}
              onValueChange={(value) => setFilters({ ...filters, queueId: value })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Queues" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Queues</SelectItem>
                {queuesData?.data.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id}>
                    {queue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={`skeleton-${i}`} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>App / Queue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {email.toAddresses[0]?.email}
                            {email.toAddresses.length > 1 && (
                              <span className="text-muted-foreground ml-1">
                                +{email.toAddresses.length - 1}
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{email.subject}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <div>{getAppName(email.appId)}</div>
                        <div className="text-xs">{getQueueName(email.queueId)}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(email.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedEmail(email)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {['failed', 'bounced'].includes(email.status) && (
                              <DropdownMenuItem onClick={() => retryMutation.mutate(email.id)}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Retry
                              </DropdownMenuItem>
                            )}
                            {['queued', 'processing'].includes(email.status) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => cancelMutation.mutate(email.id)}
                                  className="text-destructive"
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No emails found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Email Details Dialog */}
      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>
              {selectedEmail && getStatusBadge(selectedEmail.status)}
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            emailDetails && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">From</div>
                    <div>
                      {emailDetails.fromName && `${emailDetails.fromName} `}
                      &lt;{emailDetails.fromAddress}&gt;
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">To</div>
                    <div>
                      {emailDetails.toAddresses.map((to) => (
                        <div key={to.email}>
                          {to.name && `${to.name} `}&lt;{to.email}&gt;
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground">Subject</div>
                  <div className="font-medium">{emailDetails.subject}</div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Created</div>
                    <div>{format(new Date(emailDetails.createdAt), 'PPpp')}</div>
                  </div>
                  {emailDetails.sentAt && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Sent</div>
                      <div>{format(new Date(emailDetails.sentAt), 'PPpp')}</div>
                    </div>
                  )}
                  {emailDetails.deliveredAt && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Delivered</div>
                      <div>{format(new Date(emailDetails.deliveredAt), 'PPpp')}</div>
                    </div>
                  )}
                </div>

                {emailDetails.lastError && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Last Error</div>
                    <div className="text-destructive bg-destructive/10 p-2 rounded text-sm">
                      {emailDetails.lastError}
                    </div>
                  </div>
                )}

                {emailEvents && emailEvents.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      Event Timeline
                    </div>
                    <div className="space-y-2">
                      {emailEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 text-sm border-l-2 pl-3 py-1"
                        >
                          <div className="text-muted-foreground min-w-[100px]">
                            {format(new Date(event.createdAt), 'HH:mm:ss')}
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {event.eventType}
                          </Badge>
                          {event.eventData && (
                            <span className="text-muted-foreground text-xs">
                              {JSON.stringify(event.eventData)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
