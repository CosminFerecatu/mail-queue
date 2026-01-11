/**
 * API Stress Test
 *
 * Multi-endpoint stress test with weighted distribution.
 *
 * Run: k6 run load-tests/k6/scenarios/api-stress.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  config,
  getAuthHeaders,
  generateEmailPayload,
  randomString,
  randomSleep,
} from '../config.js';

// Custom metrics
const endpointErrors = new Counter('endpoint_errors');
const successRate = new Rate('success_rate');
const endpointLatency = new Trend('endpoint_latency');

export const options = {
  stages: [
    { duration: '1m', target: 100 }, // Ramp up
    { duration: '3m', target: 100 }, // Sustain
    { duration: '2m', target: 200 }, // Increase to peak
    { duration: '3m', target: 200 }, // Sustain peak
    { duration: '1m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<1000'],
    http_req_failed: ['rate<0.02'],
    success_rate: ['rate>0.98'],
    endpoint_latency: ['p(95)<250'],
  },
};

// Endpoint distribution (must sum to 100)
const endpoints = [
  { name: 'email_send', weight: 40, fn: sendEmail },
  { name: 'queue_list', weight: 15, fn: listQueues },
  { name: 'queue_stats', weight: 10, fn: getQueueStats },
  { name: 'analytics', weight: 10, fn: getAnalytics },
  { name: 'suppression_list', weight: 8, fn: listSuppression },
  { name: 'smtp_list', weight: 7, fn: listSmtpConfigs },
  { name: 'health', weight: 5, fn: checkHealth },
  { name: 'email_list', weight: 5, fn: listEmails },
];

function selectEndpoint() {
  const random = Math.random() * 100;
  let cumulative = 0;

  for (const endpoint of endpoints) {
    cumulative += endpoint.weight;
    if (random <= cumulative) {
      return endpoint;
    }
  }
  return endpoints[0];
}

function sendEmail() {
  const url = `${config.baseUrl}/v1/emails`;
  const payload = JSON.stringify(generateEmailPayload());

  const startTime = Date.now();
  const response = http.post(url, payload, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 201;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function listQueues() {
  const url = `${config.baseUrl}/v1/queues?limit=20`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function getQueueStats() {
  const url = `${config.baseUrl}/v1/queues/${config.testData.queueId}/stats`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200 || response.status === 404;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function getAnalytics() {
  const endpoints = ['overview', 'delivery', 'engagement', 'bounces', 'reputation'];
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = `${config.baseUrl}/v1/analytics/${endpoint}`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function listSuppression() {
  const url = `${config.baseUrl}/v1/suppression?limit=50`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function listSmtpConfigs() {
  const url = `${config.baseUrl}/v1/smtp-configs`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function checkHealth() {
  const url = `${config.baseUrl}/v1/health/detailed`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

function listEmails() {
  const url = `${config.baseUrl}/v1/emails?limit=20`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  endpointLatency.add(Date.now() - startTime);

  const success = response.status === 200;
  successRate.add(success);

  if (!success) {
    endpointErrors.add(1);
  }

  return response;
}

export default function () {
  const endpoint = selectEndpoint();
  endpoint.fn();

  sleep(randomSleep(0.1, 0.5));
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'load-tests/results/api-stress.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let summary = '\n========== API Stress Test Summary ==========\n\n';

  summary += `Total Requests: ${metrics.http_reqs?.values?.count || 0}\n`;
  summary += `Request Rate: ${metrics.http_reqs?.values?.rate?.toFixed(2) || 'N/A'}/s\n`;
  summary += `Success Rate: ${((metrics.success_rate?.values?.rate || 0) * 100).toFixed(2)}%\n`;
  summary += `Errors: ${metrics.endpoint_errors?.values?.count || 0}\n`;

  summary += '\nLatency:\n';
  summary += `  p(50): ${metrics.endpoint_latency?.values?.['p(50)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(95): ${metrics.endpoint_latency?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(99): ${metrics.endpoint_latency?.values?.['p(99)']?.toFixed(2) || 'N/A'} ms\n`;

  summary += '\n=============================================\n';

  return summary;
}
