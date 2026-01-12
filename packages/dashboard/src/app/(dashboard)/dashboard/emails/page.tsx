'use client';

import { Header } from '@/components/layout/header';
import { useAppContext } from '@/contexts/app-context';
import type { Email } from '@/lib/api';
import { useCallback, useState } from 'react';
import { EmailDetailsDialog } from './_components/email-details-dialog';
import { EmailFilters } from './_components/email-filters';
import { EmailsTable } from './_components/emails-table';
import { type EmailFilters as Filters, useEmails } from './_hooks/use-emails';

export default function EmailsPage() {
  const { apps } = useAppContext();
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [filters, setFilters] = useState<Filters>({
    status: '',
    appId: '',
    queueId: '',
  });

  const {
    emails,
    isLoadingEmails,
    refetchEmails,
    queues,
    emailDetails,
    isLoadingDetails,
    emailEvents,
    retryEmail,
    cancelEmail,
  } = useEmails(filters, selectedEmail?.id ?? null);

  const getAppName = useCallback(
    (appId: string) => {
      const app = apps.find((a) => a.id === appId);
      return app?.name || 'Unknown';
    },
    [apps]
  );

  const getQueueName = useCallback(
    (queueId: string) => {
      const queue = queues.find((q) => q.id === queueId);
      return queue?.name || 'Unknown';
    },
    [queues]
  );

  const handleCloseDialog = useCallback(() => {
    setSelectedEmail(null);
  }, []);

  return (
    <>
      <Header title="Emails" description="Browse and manage email messages" />
      <div className="p-6 space-y-6">
        <EmailFilters
          filters={filters}
          onFiltersChange={setFilters}
          apps={apps}
          queues={queues}
          onRefresh={refetchEmails}
        />

        <EmailsTable
          emails={emails}
          isLoading={isLoadingEmails}
          onViewDetails={setSelectedEmail}
          onRetry={retryEmail}
          onCancel={cancelEmail}
          getAppName={getAppName}
          getQueueName={getQueueName}
        />
      </div>

      <EmailDetailsDialog
        email={selectedEmail}
        emailDetails={emailDetails}
        emailEvents={emailEvents}
        isLoading={isLoadingDetails}
        onClose={handleCloseDialog}
      />
    </>
  );
}
