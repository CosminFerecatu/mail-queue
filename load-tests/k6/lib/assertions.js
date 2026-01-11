/**
 * Custom assertions and checks for k6 load tests
 */

import { check } from 'k6';

/**
 * Check standard API response structure
 */
export function checkApiResponse(response, name = 'API Response') {
  return check(response, {
    [`${name} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} has success field`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success !== undefined;
      } catch {
        return false;
      }
    },
    [`${name} success is true`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check email creation response
 */
export function checkEmailCreated(response) {
  return check(response, {
    'email created status 201': (r) => r.status === 201,
    'email has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.id;
      } catch {
        return false;
      }
    },
    'email has status queued': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.status === 'queued';
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check batch email response
 */
export function checkBatchCreated(response, expectedCount) {
  return check(response, {
    'batch status 201': (r) => r.status === 201,
    'batch has results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && Array.isArray(body.data.results);
      } catch {
        return false;
      }
    },
    [`batch has ${expectedCount} results`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.results.length === expectedCount;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check rate limit headers
 */
export function checkRateLimitHeaders(response) {
  return check(response, {
    'has X-RateLimit-Limit header': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
    'has X-RateLimit-Remaining header': (r) => r.headers['X-Ratelimit-Remaining'] !== undefined,
  });
}

/**
 * Check pagination response
 */
export function checkPaginatedResponse(response) {
  return check(response, {
    'paginated status 200': (r) => r.status === 200,
    'has data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && Array.isArray(body.data);
      } catch {
        return false;
      }
    },
    'has pagination info': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.meta && body.meta.total !== undefined;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check queue response
 */
export function checkQueueResponse(response) {
  return check(response, {
    'queue status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'queue has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.id;
      } catch {
        return false;
      }
    },
    'queue has name': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.name;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check health endpoint
 */
export function checkHealthResponse(response) {
  return check(response, {
    'health status 200': (r) => r.status === 200,
    'health is ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok' || body.success === true;
      } catch {
        return false;
      }
    },
  });
}

/**
 * Check error response format
 */
export function checkErrorResponse(response, expectedStatus) {
  return check(response, {
    [`error status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'error has message': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.error && body.error.message;
      } catch {
        return false;
      }
    },
  });
}

export default {
  checkApiResponse,
  checkEmailCreated,
  checkBatchCreated,
  checkRateLimitHeaders,
  checkPaginatedResponse,
  checkQueueResponse,
  checkHealthResponse,
  checkErrorResponse,
};
