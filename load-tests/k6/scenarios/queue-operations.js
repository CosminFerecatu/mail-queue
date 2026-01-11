/**
 * Queue Operations Load Test
 *
 * Tests queue management endpoints under load.
 *
 * Run: k6 run load-tests/k6/scenarios/queue-operations.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config, getAuthHeaders, randomString, randomSleep } from '../config.js';
import { checkQueueResponse, checkApiResponse } from '../lib/assertions.js';

// Custom metrics
const queuesCreated = new Counter('queues_created');
const queueStatsRequests = new Counter('queue_stats_requests');
const operationTime = new Trend('operation_time');

// Store created queue IDs for cleanup
const createdQueues = [];

export const options = {
  stages: [
    { duration: '30s', target: 30 },
    { duration: '2m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<400'],
    http_req_failed: ['rate<0.01'],
    queues_created: ['count>50'],
  },
};

// Operations to perform
const operations = [
  { name: 'create', weight: 20 },
  { name: 'list', weight: 30 },
  { name: 'get', weight: 20 },
  { name: 'stats', weight: 20 },
  { name: 'update', weight: 5 },
  { name: 'pause_resume', weight: 5 },
];

function selectOperation() {
  const total = operations.reduce((sum, op) => sum + op.weight, 0);
  let random = Math.random() * total;

  for (const op of operations) {
    random -= op.weight;
    if (random <= 0) {
      return op.name;
    }
  }
  return 'list';
}

function createQueue() {
  const url = `${config.baseUrl}/v1/queues`;
  const payload = JSON.stringify({
    name: `load-test-queue-${randomString(8)}`,
    priority: Math.floor(Math.random() * 5) + 1,
    rateLimit: 100,
    maxRetries: 3,
  });

  const startTime = Date.now();
  const response = http.post(url, payload, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  if (checkQueueResponse(response)) {
    queuesCreated.add(1);
    try {
      const data = JSON.parse(response.body);
      if (data.data?.id) {
        createdQueues.push(data.data.id);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
}

function listQueues() {
  const url = `${config.baseUrl}/v1/queues?limit=50`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  checkApiResponse(response, 'List Queues');
}

function getQueue() {
  if (createdQueues.length === 0) {
    return listQueues();
  }

  const queueId = createdQueues[Math.floor(Math.random() * createdQueues.length)];
  const url = `${config.baseUrl}/v1/queues/${queueId}`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  checkApiResponse(response, 'Get Queue');
}

function getQueueStats() {
  if (createdQueues.length === 0) {
    return listQueues();
  }

  const queueId = createdQueues[Math.floor(Math.random() * createdQueues.length)];
  const url = `${config.baseUrl}/v1/queues/${queueId}/stats`;

  const startTime = Date.now();
  const response = http.get(url, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  if (checkApiResponse(response, 'Queue Stats')) {
    queueStatsRequests.add(1);
  }
}

function updateQueue() {
  if (createdQueues.length === 0) {
    return createQueue();
  }

  const queueId = createdQueues[Math.floor(Math.random() * createdQueues.length)];
  const url = `${config.baseUrl}/v1/queues/${queueId}`;
  const payload = JSON.stringify({
    rateLimit: Math.floor(Math.random() * 500) + 50,
  });

  const startTime = Date.now();
  const response = http.patch(url, payload, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  checkApiResponse(response, 'Update Queue');
}

function pauseResumeQueue() {
  if (createdQueues.length === 0) {
    return createQueue();
  }

  const queueId = createdQueues[Math.floor(Math.random() * createdQueues.length)];

  // Pause
  let url = `${config.baseUrl}/v1/queues/${queueId}/pause`;
  let startTime = Date.now();
  let response = http.post(url, null, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  check(response, {
    'pause succeeded': (r) => r.status === 200 || r.status === 204,
  });

  sleep(0.5);

  // Resume
  url = `${config.baseUrl}/v1/queues/${queueId}/resume`;
  startTime = Date.now();
  response = http.post(url, null, { headers: getAuthHeaders() });
  operationTime.add(Date.now() - startTime);

  check(response, {
    'resume succeeded': (r) => r.status === 200 || r.status === 204,
  });
}

export default function () {
  const operation = selectOperation();

  switch (operation) {
    case 'create':
      createQueue();
      break;
    case 'list':
      listQueues();
      break;
    case 'get':
      getQueue();
      break;
    case 'stats':
      getQueueStats();
      break;
    case 'update':
      updateQueue();
      break;
    case 'pause_resume':
      pauseResumeQueue();
      break;
  }

  sleep(randomSleep(0.3, 1));
}

export function teardown() {
  // Cleanup created queues
  console.log(`Cleaning up ${createdQueues.length} test queues...`);

  for (const queueId of createdQueues) {
    const url = `${config.baseUrl}/v1/queues/${queueId}`;
    http.del(url, null, { headers: getAuthHeaders() });
  }
}
