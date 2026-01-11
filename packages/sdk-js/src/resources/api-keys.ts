import type { HttpClient } from '../http-client.js';
import type {
  ApiKey,
  ApiKeyWithSecret,
  CreateApiKeyParams,
  PaginationParams,
  PaginatedResponse,
} from '../types.js';

/**
 * Resource for managing API keys
 */
export class ApiKeysResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a new API key
   *
   * Note: The full key is only returned once at creation time.
   * Store it securely as it cannot be retrieved again.
   *
   * @example
   * ```typescript
   * const apiKey = await mq.apiKeys.create({
   *   name: 'Production Key',
   *   scopes: ['email:send', 'email:read'],
   *   rateLimit: 1000,
   * });
   * console.log(`Key created: ${apiKey.key}`); // Store this securely!
   * ```
   */
  async create(params: CreateApiKeyParams): Promise<ApiKeyWithSecret> {
    return this.client.post<ApiKeyWithSecret>('/api-keys', params);
  }

  /**
   * List all API keys
   *
   * Note: Full keys are never returned in listings, only the prefix.
   *
   * @example
   * ```typescript
   * const result = await mq.apiKeys.list();
   * for (const key of result.data) {
   *   console.log(`${key.name}: ${key.keyPrefix}... (${key.scopes.join(', ')})`);
   * }
   * ```
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<ApiKey>> {
    return this.client.get<PaginatedResponse<ApiKey>>('/api-keys', {
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /**
   * Get an API key by ID
   *
   * @example
   * ```typescript
   * const key = await mq.apiKeys.get('key-uuid');
   * console.log(`${key.name}: last used ${key.lastUsedAt}`);
   * ```
   */
  async get(id: string): Promise<ApiKey> {
    return this.client.get<ApiKey>(`/api-keys/${id}`);
  }

  /**
   * Revoke (delete) an API key
   *
   * @example
   * ```typescript
   * await mq.apiKeys.delete('key-uuid');
   * console.log('API key revoked');
   * ```
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(`/api-keys/${id}`);
  }

  /**
   * Rotate an API key
   *
   * Creates a new key with the same configuration and returns it.
   * The old key remains valid for a grace period (configurable).
   *
   * @example
   * ```typescript
   * const newKey = await mq.apiKeys.rotate('key-uuid');
   * console.log(`New key: ${newKey.key}`); // Update your application with this
   * ```
   */
  async rotate(id: string): Promise<ApiKeyWithSecret> {
    return this.client.post<ApiKeyWithSecret>(`/api-keys/${id}/rotate`);
  }
}
