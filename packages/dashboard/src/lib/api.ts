import { getSession } from 'next-auth/react';

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

// Token cache to avoid redundant getSession() calls
let cachedToken: string | null = null;
let tokenPromise: Promise<string | null> | null = null;
let tokenExpiry = 0;
const TOKEN_CACHE_MS = 30 * 1000; // Cache token for 30 seconds

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // If a fetch is already in progress, wait for it
  if (tokenPromise) {
    return tokenPromise;
  }

  // Start a new token fetch
  tokenPromise = (async () => {
    try {
      // First try to get token from NextAuth session
      const session = await getSession();
      if (session?.accessToken) {
        cachedToken = session.accessToken;
        tokenExpiry = Date.now() + TOKEN_CACHE_MS;
        return cachedToken;
      }

      // Fallback to legacy localStorage token for admin users
      const localToken = localStorage.getItem('mq_token');
      if (localToken) {
        cachedToken = localToken;
        tokenExpiry = Date.now() + TOKEN_CACHE_MS;
      }
      return localToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

// Clear token cache (call on logout)
export function clearTokenCache() {
  cachedToken = null;
  tokenPromise = null;
  tokenExpiry = 0;
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

  if (response.status === 204) {
    return {} as Promise<T>;
  }

  return response.json() as Promise<T>;
}

// Auth
export async function login(email: string, password: string) {
  const response = await api<{
    success: boolean;
    data: {
      token: string;
      user: { id: string; email: string; name: string; role: string };
    };
  }>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  localStorage.setItem('mq_token', response.data.token);
  return response.data;
}

export async function logout() {
  localStorage.removeItem('mq_token');
  clearTokenCache();
}

export async function getCurrentUser() {
  const response = await api<{
    success: boolean;
    data: { id: string; email: string; name: string; role: string };
  }>('/v1/auth/me');
  return response.data;
}

// Dashboard
export async function getOverview() {
  const response = await api<{
    success: boolean;
    data: {
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
    };
  }>('/v1/analytics/overview');
  return response.data;
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
  const response = await api<{ success: boolean; data: App }>(`/v1/apps/${id}`);
  return response.data;
}

export async function createApp(data: { name: string; description?: string }) {
  const response = await api<{ success: boolean; data: App }>('/v1/apps', {
    method: 'POST',
    body: data,
  });
  return response.data;
}

export async function updateApp(
  id: string,
  data: { name?: string; description?: string; isActive?: boolean }
) {
  const response = await api<{ success: boolean; data: App }>(`/v1/apps/${id}`, {
    method: 'PATCH',
    body: data,
  });
  return response.data;
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
  const response = await api<{ success: boolean; data: Queue }>(`/v1/queues/${id}`);
  return response.data;
}

export async function createQueue(data: {
  appId: string;
  name: string;
  priority?: number;
  rateLimit?: number;
}) {
  const response = await api<{ success: boolean; data: Queue }>('/v1/queues', {
    method: 'POST',
    body: data,
  });
  return response.data;
}

export async function updateQueue(id: string, data: Partial<Queue>) {
  const response = await api<{ success: boolean; data: Queue }>(`/v1/queues/${id}`, {
    method: 'PATCH',
    body: data,
  });
  return response.data;
}

export async function deleteQueue(id: string) {
  return api<void>(`/v1/queues/${id}`, { method: 'DELETE' });
}

export async function pauseQueue(id: string) {
  const response = await api<{ success: boolean; data: Queue }>(`/v1/queues/${id}/pause`, {
    method: 'POST',
  });
  return response.data;
}

export async function resumeQueue(id: string) {
  const response = await api<{ success: boolean; data: Queue }>(`/v1/queues/${id}/resume`, {
    method: 'POST',
  });
  return response.data;
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
  const response = await api<{ success: boolean; data: Email }>(`/v1/emails/${id}`);
  return response.data;
}

export async function getEmailEvents(id: string) {
  const response = await api<{ success: boolean; data: EmailEvent[] }>(`/v1/emails/${id}/events`);
  return response.data;
}

export async function retryEmail(id: string) {
  const response = await api<{ success: boolean; data: Email }>(`/v1/emails/${id}/retry`, {
    method: 'POST',
  });
  return response.data;
}

export async function cancelEmail(id: string) {
  return api<void>(`/v1/emails/${id}`, { method: 'DELETE' });
}

// Analytics
export interface DeliveryMetrics {
  period: { from: string; to: string };
  granularity: 'minute' | 'hour' | 'day';
  data: {
    timestamp: string;
    sent: number;
    delivered: number;
    bounced: number;
    failed: number;
  }[];
  totals: {
    sent: number;
    delivered: number;
    bounced: number;
    failed: number;
  };
}

export interface EngagementMetrics {
  period: { from: string; to: string };
  granularity: 'minute' | 'hour' | 'day';
  data: {
    timestamp: string;
    delivered: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
  }[];
  totals: {
    delivered: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
  };
  rates: {
    openRate: number;
    clickRate: number;
    unsubscribeRate: number;
  };
}

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

  const response = await api<{
    success: boolean;
    data: DeliveryMetrics;
  }>(`/v1/analytics/delivery?${searchParams.toString()}`);
  return response.data;
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

  const response = await api<{
    success: boolean;
    data: EngagementMetrics;
  }>(`/v1/analytics/engagement?${searchParams.toString()}`);
  return response.data;
}

// Suppression
export interface SuppressionEntry {
  id: string;
  appId: string | null;
  emailAddress: string;
  reason: 'hard_bounce' | 'soft_bounce' | 'complaint' | 'unsubscribe' | 'manual';
  expiresAt: string | null;
  createdAt: string;
}

export async function getSuppressions(params: {
  limit?: number;
  cursor?: string;
  reason?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.reason) searchParams.set('reason', params.reason);

  return api<{ data: SuppressionEntry[]; cursor: string | null; hasMore: boolean }>(
    `/v1/suppression?${searchParams.toString()}`
  );
}

export async function addSuppression(data: { emailAddress: string; reason: string }) {
  const response = await api<{ success: boolean; data: SuppressionEntry }>('/v1/suppression', {
    method: 'POST',
    body: data,
  });
  return response.data;
}

export async function deleteSuppression(email: string) {
  return api<void>(`/v1/suppression/${encodeURIComponent(email)}`, { method: 'DELETE' });
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
