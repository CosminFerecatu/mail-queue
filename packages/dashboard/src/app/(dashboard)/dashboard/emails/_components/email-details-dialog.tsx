'use client';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Email, EmailEvent } from '@/lib/api';
import { format } from 'date-fns';
import { EmailStatusBadge } from './email-status-badge';

interface EmailDetailsDialogProps {
  email: Email | null;
  emailDetails: Email | null;
  emailEvents: EmailEvent[];
  isLoading: boolean;
  onClose: () => void;
}

export function EmailDetailsDialog({
  email,
  emailDetails,
  emailEvents,
  isLoading,
  onClose,
}: EmailDetailsDialogProps) {
  return (
    <Dialog open={!!email} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Details</DialogTitle>
          <DialogDescription>
            {email && <EmailStatusBadge status={email.status} />}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
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

              {emailEvents.length > 0 && (
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
  );
}
