import type { HttpClient } from '../http-client.js';
import type {
  SmtpConfig,
  SmtpTestResult,
  CreateSmtpConfigParams,
  UpdateSmtpConfigParams,
  PaginationParams,
  PaginatedResponse,
} from '../types.js';

/**
 * Resource for managing SMTP configurations
 */
export class SmtpConfigsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a new SMTP configuration
   *
   * @example
   * ```typescript
   * const config = await mq.smtpConfigs.create({
   *   name: 'Primary SMTP',
   *   host: 'smtp.example.com',
   *   port: 587,
   *   username: 'user@example.com',
   *   password: 'secret',
   *   encryption: 'starttls',
   * });
   * console.log(config.id);
   * ```
   */
  async create(params: CreateSmtpConfigParams): Promise<SmtpConfig> {
    return this.client.post<SmtpConfig>('/smtp-configs', params);
  }

  /**
   * Get an SMTP configuration by ID
   *
   * @example
   * ```typescript
   * const config = await mq.smtpConfigs.get('config-uuid');
   * console.log(`${config.name}: ${config.host}:${config.port}`);
   * ```
   */
  async get(id: string): Promise<SmtpConfig> {
    return this.client.get<SmtpConfig>(`/smtp-configs/${id}`);
  }

  /**
   * List all SMTP configurations
   *
   * @example
   * ```typescript
   * const result = await mq.smtpConfigs.list();
   * for (const config of result.data) {
   *   console.log(`${config.name}: ${config.isActive ? 'Active' : 'Inactive'}`);
   * }
   * ```
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<SmtpConfig>> {
    return this.client.get<PaginatedResponse<SmtpConfig>>('/smtp-configs', {
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /**
   * Update an SMTP configuration
   *
   * @example
   * ```typescript
   * const config = await mq.smtpConfigs.update('config-uuid', {
   *   poolSize: 10,
   *   timeoutMs: 60000,
   * });
   * ```
   */
  async update(id: string, params: UpdateSmtpConfigParams): Promise<SmtpConfig> {
    return this.client.patch<SmtpConfig>(`/smtp-configs/${id}`, params);
  }

  /**
   * Delete an SMTP configuration
   *
   * @example
   * ```typescript
   * await mq.smtpConfigs.delete('config-uuid');
   * console.log('SMTP config deleted');
   * ```
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(`/smtp-configs/${id}`);
  }

  /**
   * Test an SMTP configuration
   *
   * @example
   * ```typescript
   * const result = await mq.smtpConfigs.test('config-uuid');
   * if (result.success) {
   *   console.log(`Connection successful (${result.latencyMs}ms)`);
   * } else {
   *   console.error(`Connection failed: ${result.error}`);
   * }
   * ```
   */
  async test(id: string): Promise<SmtpTestResult> {
    return this.client.post<SmtpTestResult>(`/smtp-configs/${id}/test`);
  }
}
