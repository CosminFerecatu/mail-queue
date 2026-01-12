'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { App, Queue } from '@/lib/api';
import { RefreshCw } from 'lucide-react';
import type { EmailFilters as Filters } from '../_hooks/use-emails';

interface EmailFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  apps: App[];
  queues: Queue[];
  onRefresh: () => void;
}

export function EmailFilters({
  filters,
  onFiltersChange,
  apps,
  queues,
  onRefresh,
}: EmailFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center justify-between">
      <div className="flex gap-2">
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, status: value === 'all' ? '' : value })
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.appId || 'all'}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              appId: value === 'all' ? '' : value,
              queueId: '',
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Apps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Apps</SelectItem>
            {apps.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.queueId || 'all'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, queueId: value === 'all' ? '' : value })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Queues" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Queues</SelectItem>
            {queues.map((queue) => (
              <SelectItem key={queue.id} value={queue.id}>
                {queue.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" onClick={onRefresh}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
    </div>
  );
}
