/**
 * Mail Queue Load Testing Configuration
 *
 * Shared configuration for all k6 load test scenarios.
 * Environment variables:
 *   - BASE_URL: API base URL (default: http://localhost:3000)
 *   - API_KEY: API key for authentication
 *   - ADMIN_TOKEN: Admin token for privileged operations
 */

export const config = {
  // Base URL for API calls
  baseUrl: __ENV.BASE_URL || 'http://localhost:3000',

  // Authentication
  apiKey: __ENV.API_KEY || 'mq_test_key',
  adminToken: __ENV.ADMIN_TOKEN || 'admin_test_token',

  // Default thresholds
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>100'],
  },

  // Common headers
  headers: {
    'Content-Type': 'application/json',
  },

  // Test data
  testData: {
    queueId: __ENV.QUEUE_ID || 'test-queue-id',
    smtpConfigId: __ENV.SMTP_CONFIG_ID || 'test-smtp-id',
  },
};

/**
 * Get authenticated headers with API key
 */
export function getAuthHeaders() {
  return {
    ...config.headers,
    Authorization: `Bearer ${config.apiKey}`,
  };
}

/**
 * Get admin headers
 */
export function getAdminHeaders() {
  return {
    ...config.headers,
    Authorization: `Bearer ${config.adminToken}`,
  };
}

/**
 * Generate a random email address
 */
export function randomEmail() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test-${timestamp}-${random}@example.com`;
}

/**
 * Generate a random string
 */
export function randomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate test email payload
 */
export function generateEmailPayload(options = {}) {
  return {
    to: options.to || randomEmail(),
    subject: options.subject || `Test Email ${Date.now()}`,
    html: options.html || `<p>This is a test email sent at ${new Date().toISOString()}</p>`,
    text: options.text || `This is a test email sent at ${new Date().toISOString()}`,
    queueId: options.queueId || config.testData.queueId,
    ...options,
  };
}

/**
 * Generate batch email payload
 */
export function generateBatchPayload(count = 100) {
  const emails = [];
  for (let i = 0; i < count; i++) {
    emails.push(generateEmailPayload());
  }
  return { emails };
}

/**
 * Sleep for a random duration between min and max milliseconds
 */
export function randomSleep(minMs = 500, maxMs = 1500) {
  const duration = Math.random() * (maxMs - minMs) + minMs;
  return duration / 1000; // Convert to seconds for k6 sleep
}

export default config;
