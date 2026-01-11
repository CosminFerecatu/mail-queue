# @mail-queue/sdk

Official JavaScript/TypeScript SDK for Mail Queue - Enterprise Email Orchestration.

## Installation

```bash
npm install @mail-queue/sdk
# or
pnpm add @mail-queue/sdk
# or
yarn add @mail-queue/sdk
```

## Quick Start

```typescript
import { MailQueue } from '@mail-queue/sdk';

// Initialize the client
const mq = new MailQueue({
  apiKey: 'mq_live_your-api-key',
  baseUrl: 'https://api.mailqueue.io', // optional
});

// Send an email
const email = await mq.emails.send({
  queue: 'transactional',
  from: { email: 'noreply@yourapp.com', name: 'Your App' },
  to: [{ email: 'user@example.com', name: 'John Doe' }],
  subject: 'Welcome to Our Service!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
});

console.log(`Email queued: ${email.id}`);
```

## Configuration

```typescript
const mq = new MailQueue({
  // Required: Your API key
  apiKey: 'mq_live_...',

  // Optional: API base URL (default: https://api.mailqueue.io)
  baseUrl: 'https://your-custom-endpoint.com',

  // Optional: Request timeout in ms (default: 30000)
  timeout: 60000,

  // Optional: Retry configuration
  retry: {
    maxRetries: 3,         // Maximum retry attempts (default: 3)
    initialDelay: 1000,    // Initial delay in ms (default: 1000)
    maxDelay: 30000,       // Maximum delay in ms (default: 30000)
    backoffMultiplier: 2,  // Exponential backoff multiplier (default: 2)
  },

  // Optional: Custom headers for all requests
  headers: {
    'X-Custom-Header': 'value',
  },
});
```

## Features

### Send Emails

#### Single Email

```typescript
const email = await mq.emails.send({
  queue: 'transactional',
  from: { email: 'noreply@yourapp.com', name: 'Your App' },
  to: [{ email: 'user@example.com' }],
  subject: 'Hello!',
  html: '<h1>Hello World</h1>',
  text: 'Hello World',

  // Optional: CC and BCC
  cc: [{ email: 'cc@example.com' }],
  bcc: [{ email: 'bcc@example.com' }],

  // Optional: Reply-to
  replyTo: 'support@yourapp.com',

  // Optional: Custom headers
  headers: {
    'X-Custom-ID': '12345',
  },

  // Optional: Template variables
  personalizations: {
    firstName: 'John',
    accountId: '12345',
  },

  // Optional: Custom metadata (returned in webhooks)
  metadata: {
    userId: 'user-123',
    campaign: 'onboarding',
  },

  // Optional: Schedule for later
  scheduledAt: '2024-12-25T10:00:00Z',

  // Optional: Idempotency key to prevent duplicates
  idempotencyKey: 'unique-request-id',
});
```

#### Batch Emails

```typescript
const result = await mq.emails.sendBatch({
  queue: 'newsletter',
  from: { email: 'newsletter@yourapp.com', name: 'Newsletter' },
  emails: [
    {
      to: 'user1@example.com',
      personalizations: { name: 'User 1', coupon: 'SAVE10' },
    },
    {
      to: { email: 'user2@example.com', name: 'User 2' },
      personalizations: { name: 'User 2', coupon: 'SAVE20' },
    },
  ],
  subject: 'Special Offer for {{name}}!',
  html: '<p>Hi {{name}}, use code {{coupon}} for a discount!</p>',
});

console.log(`Queued: ${result.queuedCount}/${result.totalCount}`);
if (result.errors) {
  console.log('Errors:', result.errors);
}
```

### Manage Emails

```typescript
// Get email by ID
const email = await mq.emails.get('email-uuid');
console.log(email.status); // 'delivered'

// List emails with filters
const result = await mq.emails.list({
  status: 'failed',
  queueId: 'queue-uuid',
  limit: 50,
  offset: 0,
});

// Get email events (opens, clicks, bounces, etc.)
const events = await mq.emails.getEvents('email-uuid');
for (const event of events) {
  console.log(`${event.eventType} at ${event.createdAt}`);
}

// Cancel a scheduled email
await mq.emails.cancel('email-uuid');

// Retry a failed email
await mq.emails.retry('email-uuid');
```

### Queue Management

```typescript
// Create a queue
const queue = await mq.queues.create({
  name: 'marketing',
  priority: 3,           // 1-10, higher = more priority
  rateLimit: 100,        // emails per minute
  maxRetries: 5,
  settings: {
    enableOpenTracking: true,
    enableClickTracking: true,
  },
});

// List queues
const queues = await mq.queues.list();

// Update queue
await mq.queues.update('queue-uuid', {
  rateLimit: 200,
  priority: 5,
});

// Pause queue
await mq.queues.pause('queue-uuid');

// Resume queue
await mq.queues.resume('queue-uuid');

// Get queue stats
const stats = await mq.queues.getStats('queue-uuid');
console.log(`Pending: ${stats.pending}`);
console.log(`Throughput (last hour): ${stats.throughput.lastHour}`);

// Delete queue
await mq.queues.delete('queue-uuid');
```

### Analytics

```typescript
// Get overview
const overview = await mq.analytics.getOverview({
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-31T23:59:59Z',
});
console.log(`Delivery rate: ${overview.rates.deliveryRate}%`);
console.log(`Bounce rate: ${overview.rates.bounceRate}%`);

// Get delivery metrics (time-series)
const delivery = await mq.analytics.getDeliveryMetrics({
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-07T23:59:59Z',
  granularity: 'day',
});

// Get engagement metrics
const engagement = await mq.analytics.getEngagementMetrics();
console.log(`Open rate: ${engagement.rates.openRate}%`);
console.log(`Click rate: ${engagement.rates.clickRate}%`);

// Get bounce breakdown
const bounces = await mq.analytics.getBounceBreakdown();
console.log(`Hard bounces: ${bounces.byType.hard}`);
console.log(`Soft bounces: ${bounces.byType.soft}`);

// Get reputation score
const reputation = await mq.analytics.getReputation();
console.log(`Score: ${reputation.score}/100`);
if (reputation.isThrottled) {
  console.log(`Warning: ${reputation.throttleReason}`);
}
```

### Suppression List

```typescript
// Add email to suppression list
await mq.suppression.add({
  emailAddress: 'bounced@example.com',
  reason: 'hard_bounce',
});

// Add multiple emails
await mq.suppression.addBulk({
  emailAddresses: ['user1@example.com', 'user2@example.com'],
  reason: 'manual',
});

// Check if email is suppressed
const result = await mq.suppression.check('user@example.com');
if (result.isSuppressed) {
  console.log(`Suppressed: ${result.reason}`);
}

// List suppressed emails
const list = await mq.suppression.list({
  reason: 'complaint',
  limit: 100,
});

// Remove from suppression list
await mq.suppression.remove('user@example.com');
```

### SMTP Configuration

```typescript
// Create SMTP config
const config = await mq.smtpConfigs.create({
  name: 'Primary SMTP',
  host: 'smtp.example.com',
  port: 587,
  username: 'user@example.com',
  password: 'secret',
  encryption: 'starttls',
  poolSize: 10,
});

// Test SMTP connection
const testResult = await mq.smtpConfigs.test(config.id);
if (testResult.success) {
  console.log(`Connected in ${testResult.latencyMs}ms`);
} else {
  console.log(`Failed: ${testResult.error}`);
}

// List configs
const configs = await mq.smtpConfigs.list();

// Update config
await mq.smtpConfigs.update(config.id, {
  poolSize: 20,
});

// Delete config
await mq.smtpConfigs.delete(config.id);
```

### API Key Management

```typescript
// Create new API key
const apiKey = await mq.apiKeys.create({
  name: 'Production Key',
  scopes: ['email:send', 'email:read', 'analytics:read'],
  rateLimit: 1000, // per minute
  ipAllowlist: ['192.168.1.0/24'],
});

// IMPORTANT: Store the key securely - it's only shown once!
console.log(`New API Key: ${apiKey.key}`);

// List API keys
const keys = await mq.apiKeys.list();
for (const key of keys.data) {
  console.log(`${key.name}: ${key.keyPrefix}...`);
}

// Rotate key (creates new key, old key has grace period)
const newKey = await mq.apiKeys.rotate('key-uuid');

// Revoke key
await mq.apiKeys.delete('key-uuid');
```

### Webhooks

```typescript
// Get webhook delivery logs
const logs = await mq.webhooks.getLogs({
  status: 'failed',
  eventType: 'email.bounced',
  limit: 50,
});

for (const delivery of logs.data) {
  console.log(`${delivery.eventType}: ${delivery.status}`);
  if (delivery.lastError) {
    console.log(`Error: ${delivery.lastError}`);
  }
}

// Retry failed webhook
await mq.webhooks.retry('delivery-uuid');
```

## Error Handling

The SDK provides specific error classes for different error types:

```typescript
import {
  MailQueue,
  MailQueueError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
} from '@mail-queue/sdk';

try {
  await mq.emails.send({ ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof AuthorizationError) {
    console.error('Missing required scope');
  } else if (error instanceof ValidationError) {
    console.error('Invalid request:', error.validationErrors);
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found');
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof MailQueueError) {
    console.error(`API error: ${error.code} - ${error.message}`);
  }
}
```

## TypeScript

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  Email,
  EmailStatus,
  Queue,
  SendEmailParams,
  AnalyticsOverview,
} from '@mail-queue/sdk';

// All parameters and responses are fully typed
const params: SendEmailParams = {
  queue: 'transactional',
  from: { email: 'noreply@example.com' },
  to: [{ email: 'user@example.com' }],
  subject: 'Hello',
  html: '<p>World</p>',
};

const email: Email = await mq.emails.send(params);
const status: EmailStatus = email.status;
```

## Requirements

- Node.js 18.0.0 or later
- A Mail Queue API key

## License

MIT
