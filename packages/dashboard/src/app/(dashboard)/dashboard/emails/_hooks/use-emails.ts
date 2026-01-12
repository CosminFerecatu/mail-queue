'use client';

import {
  type Email,
  type EmailEvent,
  type Queue,
  cancelEmail,
  getEmail,
  getEmailEvents,
  getEmails,
  getQueues,
  retryEmail,
} from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface EmailFilters {
  status: string;
  appId: string;
  queueId: string;
}

export interface UseEmailsReturn {
  // Emails list
  emails: Email[];
  isLoadingEmails: boolean;
  refetchEmails: () => void;

  // Queues
  queues: Queue[];

  // Email details
  emailDetails: Email | null;
  isLoadingDetails: boolean;

  // Email events
  emailEvents: EmailEvent[];

  // Mutations
  retryEmail: (id: string) => void;
  cancelEmail: (id: string) => void;
  isRetrying: boolean;
  isCancelling: boolean;
}

export function useEmails(filters: EmailFilters, selectedEmailId: string | null): UseEmailsReturn {
  const queryClient = useQueryClient();

  // Fetch queues based on selected app
  const { data: queuesData } = useQuery({
    queryKey: ['queues', filters.appId],
    queryFn: () => getQueues({ appId: filters.appId || undefined, limit: 100 }),
    enabled: true,
  });

  // Fetch emails list with filters
  const {
    data: emailsData,
    isLoading: isLoadingEmails,
    refetch: refetchEmails,
  } = useQuery({
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

  // Fetch email details when an email is selected
  const { data: emailDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['email', selectedEmailId],
    queryFn: () => (selectedEmailId ? getEmail(selectedEmailId) : null),
    enabled: !!selectedEmailId,
  });

  // Fetch email events when an email is selected
  const { data: emailEvents } = useQuery({
    queryKey: ['emailEvents', selectedEmailId],
    queryFn: () => (selectedEmailId ? getEmailEvents(selectedEmailId) : null),
    enabled: !!selectedEmailId,
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: retryEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: cancelEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });

  return {
    // Emails list
    emails: emailsData?.data ?? [],
    isLoadingEmails,
    refetchEmails,

    // Queues
    queues: queuesData?.data ?? [],

    // Email details
    emailDetails: emailDetails ?? null,
    isLoadingDetails,

    // Email events
    emailEvents: emailEvents ?? [],

    // Mutations
    retryEmail: retryMutation.mutate,
    cancelEmail: cancelMutation.mutate,
    isRetrying: retryMutation.isPending,
    isCancelling: cancelMutation.isPending,
  };
}
