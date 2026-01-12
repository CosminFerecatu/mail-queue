'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Email } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Mail, MoreHorizontal, RotateCcw, XCircle } from 'lucide-react';
import { EmailStatusBadge } from './email-status-badge';

interface EmailsTableProps {
  emails: Email[];
  isLoading: boolean;
  onViewDetails: (email: Email) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  getAppName: (appId: string) => string;
  getQueueName: (queueId: string) => string;
}

export function EmailsTable({
  emails,
  isLoading,
  onViewDetails,
  onRetry,
  onCancel,
  getAppName,
  getQueueName,
}: EmailsTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="p-4 space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={`skeleton-${i}`} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
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
            {emails.map((email) => (
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
                <TableCell>
                  <EmailStatusBadge status={email.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(email.createdAt), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetails(email)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {['failed', 'bounced'].includes(email.status) && (
                        <DropdownMenuItem onClick={() => onRetry(email.id)}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Retry
                        </DropdownMenuItem>
                      )}
                      {['queued', 'processing'].includes(email.status) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onCancel(email.id)}
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
            {emails.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No emails found matching your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
