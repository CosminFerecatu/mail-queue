/**
 * Spike Test
 *
 * Tests system behavior under sudden load spikes.
 *
 * Run: k6 run load-tests/k6/scenarios/spike-test.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { config, getAuthHeaders, generateEmailPayload, randomSleep } from '../config.js';

// Custom metrics
const requestsDuringSpike = new Counter('requests_during_spike');
const errorsDuringSpike = new Counter('errors_during_spike');
const recoveryTime = new Trend('recovery_time');
const spikeSuccessRate = new Rate('spike_success_rate');

// Track test phases
let currentPhase = 'warmup';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Warmup - low load
    { duration: '10s', target: 500 }, // Spike! Sudden jump to 500 VUs
    { duration: '1m', target: 500 }, // Sustain spike
    { duration: '10s', target: 10 }, // Sudden drop
    { duration: '1m', target: 10 }, // Recovery observation
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    // Relaxed thresholds during spike
    http_req_duration: ['p(95)<1000', 'p(99)<3000'],
    http_req_failed: ['rate<0.10'], // Allow up to 10% failure during spike
    spike_success_rate: ['rate>0.90'], // At least 90% success during spike
  },
};

// Determine current phase based on VU count
function updatePhase(vuCount) {
  if (vuCount <= 20) {
    currentPhase = vuCount < 10 ? 'warmup' : 'recovery';
  } else if (vuCount >= 400) {
    currentPhase = 'spike';
  } else {
    currentPhase = 'transition';
  }
}

export default function () {
  updatePhase(__VU);

  const url = `${config.baseUrl}/v1/emails`;
  const payload = JSON.stringify(generateEmailPayload());
  const headers = getAuthHeaders();

  const startTime = Date.now();
  const response = http.post(url, payload, {
    headers,
    timeout: '10s', // Shorter timeout during high load
  });
  const duration = Date.now() - startTime;

  const success = response.status === 201;

  // Track spike-specific metrics
  if (currentPhase === 'spike') {
    requestsDuringSpike.add(1);
    spikeSuccessRate.add(success);

    if (!success) {
      errorsDuringSpike.add(1);
    }
  }

  // Track recovery
  if (currentPhase === 'recovery') {
    recoveryTime.add(duration);
  }

  // Basic check
  check(response, {
    'request completed': (r) => r.status === 201 || r.status === 429 || r.status === 503,
    'not timeout': (r) => r.timings.duration < 10000,
  });

  // Variable sleep based on phase
  if (currentPhase === 'spike') {
    sleep(randomSleep(0.05, 0.2)); // Faster during spike
  } else {
    sleep(randomSleep(0.5, 1));
  }
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'load-tests/results/spike-test.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let summary = '\n========== Spike Test Summary ==========\n\n';

  summary += 'Overall:\n';
  summary += `  Total Requests: ${metrics.http_reqs?.values?.count || 0}\n`;
  summary += `  Failed Requests: ${metrics.http_req_failed?.values?.passes || 0}\n`;
  summary += `  Error Rate: ${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%\n`;

  summary += '\nDuring Spike (500 VUs):\n';
  summary += `  Requests: ${metrics.requests_during_spike?.values?.count || 0}\n`;
  summary += `  Errors: ${metrics.errors_during_spike?.values?.count || 0}\n`;
  summary += `  Success Rate: ${((metrics.spike_success_rate?.values?.rate || 0) * 100).toFixed(2)}%\n`;

  summary += '\nLatency:\n';
  summary += `  p(50): ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(95): ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'} ms\n`;
  summary += `  p(99): ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'} ms\n`;

  summary += '\nRecovery:\n';
  summary += `  Avg Latency After Spike: ${metrics.recovery_time?.values?.avg?.toFixed(2) || 'N/A'} ms\n`;

  summary += '\n=========================================\n';

  return summary;
}
