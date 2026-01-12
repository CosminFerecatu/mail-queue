'use client';

import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock, RefreshCw, Send, XCircle } from 'lucide-react';

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

interface EmailStatusBadgeProps {
  status: string;
}

export function EmailStatusBadge({ status }: EmailStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
