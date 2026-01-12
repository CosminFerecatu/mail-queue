import type { MailQueueConfig, ApiResponse, ApiErrorResponse } from './types.js';
import { MailQueueError, NetworkError, TimeoutError, RateLimitError, createErrorFromResponse } from './errors.js';
import { SDK_VERSION } from './version.js';

const DEFAULT_BASE_URL = 'https://api.mailqueue.io';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

function isApiResponse<T>(data: unknown): data is ApiResponse<T> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    (data as Record<string, unknown>).success === true &&
    'data' in data
  );
}

/**
 * HTTP client for making requests to the Mail Queue API
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retryConfig: RetryConfig;
  private readonly customHeaders: Record<string, string>;

  constructor(config: MailQueueConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.customHeaders = config.headers || {};

    this.retryConfig = {
      maxRetries: config.retry?.maxRetries ?? DEFAULT_MAX_RETRIES,
      initialDelay: config.retry?.initialDelay ?? DEFAULT_INITIAL_DELAY,
      maxDelay: config.retry?.maxDelay ?? DEFAULT_MAX_DELAY,
      backoffMultiplier: config.retry?.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
    };
  }

  /**
   * Make a GET request
   */
  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: 'GET', path, query });
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown, options?: { idempotencyKey?: string }): Promise<T> {
    return this.request<T>({
      method: 'POST',
      path,
      body,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body });
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    return this.request<T>({ method: 'DELETE', path });
  }

  /**
   * Make a request with automatic retries
   */
  private async request<T>(options: RequestOptions): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) except rate limits
        if (error instanceof MailQueueError) {
          if (
            error.statusCode &&
            error.statusCode >= 400 &&
            error.statusCode < 500 &&
            error.statusCode !== 429
          ) {
            throw error;
          }
        }

        // Don't retry if we've exhausted all attempts
        if (attempt >= this.retryConfig.maxRetries) {
          throw lastError;
        }

        // Honor Retry-After header for rate limit errors
        let delay: number;
        if (error instanceof RateLimitError && error.retryAfter) {
          delay = error.retryAfter * 1000;
        } else {
          delay = this.calculateDelay(attempt);
        }
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Request failed');
  }

  /**
   * Execute a single request
   */
  private async executeRequest<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle no-content response
      if (response.status === 204) {
        return undefined as T;
      }

      const data: unknown = await response.json();

      if (!response.ok) {
        const errorResponse = data as ApiErrorResponse;
        throw createErrorFromResponse(
          response.status,
          errorResponse.error || { message: 'Unknown error' },
          response.headers
        );
      }

      if (isApiResponse<T>(data)) {
        return data.data;
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MailQueueError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(`Request timed out after ${this.timeout}ms`, this.timeout);
        }
        throw new NetworkError(error.message, error);
      }

      throw new NetworkError('Unknown network error');
    }
  }

  /**
   * Build the full URL with query parameters
   */
  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`/v1${path}`, this.baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Build request headers
   */
  private buildHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `mail-queue-sdk-js/${SDK_VERSION}`,
      ...this.customHeaders,
      ...options.headers,
    };

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    return headers;
  }

  /**
   * Calculate delay for retry with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.retryConfig.initialDelay * this.retryConfig.backoffMultiplier ** attempt;
    const delay = Math.min(exponentialDelay, this.retryConfig.maxDelay);

    // Add jitter (0-25% of delay)
    const jitter = delay * 0.25 * Math.random();

    return Math.floor(delay + jitter);
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
