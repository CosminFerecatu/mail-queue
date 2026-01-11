/**
 * Authentication helpers for k6 load tests
 */

import http from 'k6/http';
import { config } from '../config.js';

/**
 * Create a new API key for testing
 */
export function createApiKey(name = 'load-test-key') {
  const url = `${config.baseUrl}/v1/api-keys`;
  const payload = JSON.stringify({
    name: name,
    scopes: ['email:send', 'email:read', 'queue:read'],
    rateLimit: 10000,
  });

  const response = http.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.adminToken}`,
    },
  });

  if (response.status === 201) {
    const data = JSON.parse(response.body);
    return data.data.key;
  }

  console.error(`Failed to create API key: ${response.status} ${response.body}`);
  return null;
}

/**
 * Revoke an API key
 */
export function revokeApiKey(keyId) {
  const url = `${config.baseUrl}/v1/api-keys/${keyId}`;

  const response = http.del(url, null, {
    headers: {
      Authorization: `Bearer ${config.adminToken}`,
    },
  });

  return response.status === 204;
}

/**
 * Validate API key is working
 */
export function validateApiKey(apiKey) {
  const url = `${config.baseUrl}/v1/health`;

  const response = http.get(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return response.status === 200;
}

export default {
  createApiKey,
  revokeApiKey,
  validateApiKey,
};
