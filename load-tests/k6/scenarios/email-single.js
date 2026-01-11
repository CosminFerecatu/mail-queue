/**
 * Single Email Sending Load Test
 *
 * Tests the throughput and latency of single email sending.
 *
 * Run: k6 run load-tests/k6/scenarios/email-single.js
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config, getAuthHeaders, generateEmailPayload, randomSleep } from '../config.js';
import { checkEmailCreated, checkRateLimitHeaders } from '../lib/assertions.js';

// Custom metrics
const emailsQueued = new Counter('emails_queued');
const emailQueueTime = new Trend('email_queue_time');

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // Ramp up to 50 VUs
    { duration: '3m', target: 50 }, // Sustain 50 VUs
    { duration: '1m', target: 100 }, // Peak at 100 VUs
    { duration: '2m', target: 100 }, // Sustain peak
    { duration: '1m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    emails_queued: ['count>1000'],
    email_queue_time: ['p(95)<250'],
  },
};

export default function () {
  const url = `${config.baseUrl}/v1/emails`;
  const payload = JSON.stringify(generateEmailPayload());
  const headers = getAuthHeaders();

  const startTime = Date.now();
  const response = http.post(url, payload, { headers });
  const duration = Date.now() - startTime;

  // Record metrics
  emailQueueTime.add(duration);

  // Validate response
  if (checkEmailCreated(response)) {
    emailsQueued.add(1);
  }

  // Check rate limit headers
  checkRateLimitHeaders(response);

  // Random sleep between requests
  sleep(randomSleep(0.5, 1.5));
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'load-tests/results/email-single.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const { metrics } = data;

  let summary = '\n========== Email Single Load Test Summary ==========\n\n';

  summary += `Total Requests: ${metrics.http_reqs?.values?.count || 0}\n`;
  summary += `Failed Requests: ${metrics.http_req_failed?.values?.passes || 0}\n`;
  summary += `Emails Queued: ${metrics.emails_queued?.values?.count || 0}\n`;

  summary += '\nLatency:\n';
  summary += `  p(50): ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(95): ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(99): ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'} ms\n`;

  summary += '\n====================================================\n';

  return summary;
}
