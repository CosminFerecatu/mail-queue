const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mq_token');
}

export async function api<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.message || 'Request failed', data);
  }

  return response.json() as Promise<T>;
}

// Auth
export async function login(email: string, password: string) {
  const data = await api<{
    token: string;
    user: { id: string; email: string; name: string; role: string };
  }>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  localStorage.setItem('mq_token', data.token);
  return data;
}

export async function logout() {
  localStorage.removeItem('mq_token');
}

export async function getCurrentUser() {
  return api<{ id: string; email: string; name: string; role: string }>('/v1/auth/me');
}

// Dashboard
export async function getOverview() {
  return api<{
    totalEmailsToday: number;
    totalEmailsMonth: number;
    deliveryRate: number;
    bounceRate: number;
    openRate: number;
    clickRate: number;
    activeApps: number;
    activeQueues: number;
    pendingEmails: number;
    processingEmails: number;
  }>('/v1/analytics/overview');
}

// Apps
export async function getApps(params?: { limit?: number; cursor?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  return api<{ data: App[]; cursor: string | null; hasMore: boolean }>(
    `/v1/apps?${searchParams.toString()}`
  );
}

export async function getApp(id: string) {
  return api<App>(`/v1/apps/${id}`);
}

export async function createApp(data: { name: string; description?: string }) {
  return api<App>('/v1/apps', { method: 'POST', body: data });
}

export async function updateApp(
  id: string,
  data: { name?: string; description?: string; isActive?: boolean }
) {
  return api<App>(`/v1/apps/${id}`, { method: 'PATCH', body: data });
}

export async function deleteApp(id: string) {
  return api<void>(`/v1/apps/${id}`, { method: 'DELETE' });
}

// Queues
export async function getQueues(params?: { appId?: string; limit?: number; cursor?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.appId) searchParams.set('appId', params.appId);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  return api<{ data: Queue[]; cursor: string | null; hasMore: boolean }>(
    `/v1/queues?${searchParams.toString()}`
  );
}

export async function getQueue(id: string) {
  return api<Queue>(`/v1/queues/${id}`);
}

export async function createQueue(data: {
  appId: string;
  name: string;
  priority?: number;
  rateLimit?: number;
}) {
  return api<Queue>('/v1/queues', { method: 'POST', body: data });
}

export async function updateQueue(id: string, data: Partial<Queue>) {
  return api<Queue>(`/v1/queues/${id}`, { method: 'PATCH', body: data });
}

export async function deleteQueue(id: string) {
  return api<void>(`/v1/queues/${id}`, { method: 'DELETE' });
}

export async function pauseQueue(id: string) {
  return api<Queue>(`/v1/queues/${id}/pause`, { method: 'POST' });
}

export async function resumeQueue(id: string) {
  return api<Queue>(`/v1/queues/${id}/resume`, { method: 'POST' });
}

// Emails
export async function getEmails(params?: {
  appId?: string;
  queueId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.appId) searchParams.set('appId', params.appId);
  if (params?.queueId) searchParams.set('queueId', params.queueId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  return api<{ data: Email[]; cursor: string | null; hasMore: boolean }>(
    `/v1/emails?${searchParams.toString()}`
  );
}

export async function getEmail(id: string) {
  return api<Email>(`/v1/emails/${id}`);
}

export async function getEmailEvents(id: string) {
  return api<EmailEvent[]>(`/v1/emails/${id}/events`);
}

export async function retryEmail(id: string) {
  return api<Email>(`/v1/emails/${id}/retry`, { method: 'POST' });
}

export async function cancelEmail(id: string) {
  return api<void>(`/v1/emails/${id}`, { method: 'DELETE' });
}

// Analytics
export async function getDeliveryStats(params: {
  appId?: string;
  queueId?: string;
  from: string;
  to: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.appId) searchParams.set('appId', params.appId);
  if (params.queueId) searchParams.set('queueId', params.queueId);
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);

  return api<{ date: string; sent: number; delivered: number; bounced: number; failed: number }[]>(
    `/v1/analytics/delivery?${searchParams.toString()}`
  );
}

export async function getEngagementStats(params: {
  appId?: string;
  queueId?: string;
  from: string;
  to: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.appId) searchParams.set('appId', params.appId);
  if (params.queueId) searchParams.set('queueId', params.queueId);
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);

  return api<{ date: string; opens: number; clicks: number; unsubscribes: number }[]>(
    `/v1/analytics/engagement?${searchParams.toString()}`
  );
}

// Types
export interface App {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sandboxMode: boolean;
  webhookUrl: string | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Queue {
  id: string;
  appId: string;
  name: string;
  priority: number;
  rateLimit: number | null;
  maxRetries: number;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Email {
  id: string;
  appId: string;
  queueId: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: { email: string; name?: string }[];
  subject: string;
  status: 'queued' | 'processing' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'cancelled';
  retryCount: number;
  lastError: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface EmailEvent {
  id: string;
  emailId: string;
  eventType:
    | 'queued'
    | 'processing'
    | 'sent'
    | 'delivered'
    | 'opened'
    | 'clicked'
    | 'bounced'
    | 'complained'
    | 'unsubscribed';
  eventData: Record<string, unknown> | null;
  createdAt: string;
}
