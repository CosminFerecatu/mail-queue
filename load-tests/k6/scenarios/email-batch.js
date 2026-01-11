/**
 * Batch Email Sending Load Test
 *
 * Tests the throughput of batch email operations.
 *
 * Run: k6 run load-tests/k6/scenarios/email-batch.js
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config, getAuthHeaders, generateBatchPayload, randomSleep } from '../config.js';
import { checkBatchCreated, checkRateLimitHeaders } from '../lib/assertions.js';

// Custom metrics
const batchesSent = new Counter('batches_sent');
const emailsInBatches = new Counter('emails_in_batches');
const batchProcessTime = new Trend('batch_process_time');

// Batch sizes to test
const BATCH_SIZES = [100, 250, 500, 1000];

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up
    { duration: '2m', target: 20 }, // Sustain small batches
    { duration: '30s', target: 50 }, // Increase load
    { duration: '2m', target: 50 }, // Sustain larger batches
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // Higher thresholds for batches
    http_req_failed: ['rate<0.02'],
    emails_in_batches: ['count>10000'],
    batch_process_time: ['p(95)<2000'],
  },
};

export default function () {
  // Rotate through batch sizes
  const batchSize = BATCH_SIZES[Math.floor(Math.random() * BATCH_SIZES.length)];

  const url = `${config.baseUrl}/v1/emails/batch`;
  const payload = JSON.stringify(generateBatchPayload(batchSize));
  const headers = getAuthHeaders();

  const startTime = Date.now();
  const response = http.post(url, payload, {
    headers,
    timeout: '30s', // Longer timeout for batches
  });
  const duration = Date.now() - startTime;

  // Record metrics
  batchProcessTime.add(duration);

  // Validate response
  if (checkBatchCreated(response, batchSize)) {
    batchesSent.add(1);
    emailsInBatches.add(batchSize);
  }

  // Check rate limit headers
  checkRateLimitHeaders(response);

  // Longer sleep between batch requests
  sleep(randomSleep(2, 5));
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'load-tests/results/email-batch.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let summary = '\n========== Email Batch Load Test Summary ==========\n\n';

  summary += `Total Batches: ${metrics.batches_sent?.values?.count || 0}\n`;
  summary += `Total Emails: ${metrics.emails_in_batches?.values?.count || 0}\n`;
  summary += `Failed Requests: ${metrics.http_req_failed?.values?.passes || 0}\n`;

  summary += '\nBatch Processing Time:\n';
  summary += `  p(50): ${metrics.batch_process_time?.values?.['p(50)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(95): ${metrics.batch_process_time?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(99): ${metrics.batch_process_time?.values?.['p(99)']?.toFixed(2) || 'N/A'} ms\n`;

  summary += '\n===================================================\n';

  return summary;
}
