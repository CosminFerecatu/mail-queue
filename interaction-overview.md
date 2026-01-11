# Mail Queue - Integration Overview

A comprehensive guide for developers and businesses looking to integrate enterprise-grade email delivery into their applications.

---

## What is Mail Queue?

Mail Queue is an **enterprise-grade email orchestration system** designed to handle high-volume email delivery (1M+ emails/day) with reliability, observability, and multi-tenant isolation.

Think of it as your private email infrastructure that sits between your application and SMTP servers, providing:

- **Queuing & Retry Logic** - Emails are queued and automatically retried on failure
- **Rate Limiting** - Protect your SMTP servers and maintain sender reputation
- **Analytics & Tracking** - Know exactly what happened to every email
- **Multi-Tenant Support** - Isolate different applications or customers
- **Compliance** - GDPR-ready with data export and deletion capabilities

---

## Who Should Use Mail Queue?

### SaaS Companies
You have multiple products or customer tenants that need isolated email sending with separate configurations, limits, and analytics.

### High-Volume Senders
You send transactional emails (receipts, notifications, password resets) at scale and need reliability guarantees.

### E-commerce Platforms
You need order confirmations, shipping updates, and marketing emails with delivery tracking.

### Agencies & Platforms
You manage email sending for multiple clients and need per-client isolation, billing, and reporting.

### Enterprises
You need an on-premise or private cloud email solution with full control over your data.

---

## Why Choose Mail Queue Over Alternatives?

| Feature | Mail Queue | SendGrid/Mailgun | Self-hosted SMTP |
|---------|------------|------------------|------------------|
| **Data Ownership** | Full control | Third-party | Full control |
| **Multi-Tenancy** | Built-in | Limited | Manual |
| **Cost at Scale** | Fixed infra cost | Per-email pricing | Fixed infra cost |
| **Customization** | Unlimited | Limited | Unlimited |
| **Compliance** | Self-managed | Vendor-dependent | Self-managed |
| **Vendor Lock-in** | None | High | None |
| **Setup Complexity** | Medium | Low | High |

### Key Benefits

1. **No Per-Email Costs** - Pay for infrastructure, not per email
2. **Complete Data Control** - Your emails, your servers, your data
3. **White-Label Ready** - No third-party branding
4. **Flexible SMTP** - Use any SMTP provider (AWS SES, Mailgun SMTP, your own servers)
5. **Real-Time Visibility** - Dashboard with live queue monitoring
6. **Developer-Friendly** - TypeScript SDK with full type safety

---

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Your App       │     │   Mail Queue    │     │  SMTP Server    │
│                 │     │                 │     │                 │
│  SDK or REST ───┼────▶│  Queue + Retry  │────▶│  AWS SES        │
│  API call       │     │  Rate Limiting  │     │  Mailgun        │
│                 │     │  Analytics      │     │  Your SMTP      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Dashboard      │
                        │  - Monitoring   │
                        │  - Analytics    │
                        │  - Management   │
                        └─────────────────┘
```

---

## Getting Started

### Step 1: Get Your API Credentials

After deploying Mail Queue, access the dashboard and:

1. Create an **App** (represents your application/tenant)
2. Generate an **API Key** with appropriate scopes
3. Configure your **SMTP settings** (connection to your email server)
4. Create a **Queue** (e.g., "transactional", "marketing")

You'll receive an API key like: `mq_live_abc123...`

### Step 2: Choose Your Integration Method

#### Option A: TypeScript/JavaScript SDK (Recommended)

```bash
npm install @mail-queue/sdk
```

```typescript
import { MailQueue } from '@mail-queue/sdk';

const mq = new MailQueue({
  apiKey: 'mq_live_abc123...',
  baseUrl: 'https://your-mail-queue-instance.com',
});
```

#### Option B: REST API

Use any HTTP client to call the REST API directly:

```bash
curl -X POST https://your-mail-queue-instance.com/v1/emails \
  -H "Authorization: Bearer mq_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{...}'
```

---

## Real-Life Examples

### Example 1: E-Commerce Order Confirmation

**Scenario:** Customer completes a purchase, you need to send an order confirmation immediately.

#### Using the SDK

```typescript
import { MailQueue } from '@mail-queue/sdk';

const mq = new MailQueue({
  apiKey: process.env.MAIL_QUEUE_API_KEY,
  baseUrl: process.env.MAIL_QUEUE_URL,
});

// After order is created in your system
async function sendOrderConfirmation(order: Order) {
  const result = await mq.emails.send({
    queue: 'transactional',  // High-priority queue
    from: {
      email: 'orders@yourstore.com',
      name: 'YourStore',
    },
    to: [
      {
        email: order.customer.email,
        name: order.customer.name,
      },
    ],
    subject: `Order Confirmed - #${order.id}`,
    html: `
      <h1>Thank you for your order, ${order.customer.firstName}!</h1>
      <p>Order #${order.id} has been confirmed.</p>
      <h2>Order Summary</h2>
      <ul>
        ${order.items.map(item => `<li>${item.name} x ${item.quantity} - $${item.price}</li>`).join('')}
      </ul>
      <p><strong>Total: $${order.total}</strong></p>
      <p>We'll notify you when your order ships.</p>
    `,
    metadata: {
      orderId: order.id,
      customerId: order.customer.id,
      type: 'order_confirmation',
    },
  });

  console.log(`Email queued with ID: ${result.id}`);
  return result;
}
```

#### Using REST API

```bash
curl -X POST https://mail-queue.yourcompany.com/v1/emails \
  -H "Authorization: Bearer mq_live_abc123..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-confirm-12345" \
  -d '{
    "queue": "transactional",
    "from": {
      "email": "orders@yourstore.com",
      "name": "YourStore"
    },
    "to": [{"email": "customer@example.com", "name": "John Doe"}],
    "subject": "Order Confirmed - #12345",
    "html": "<h1>Thank you for your order!</h1><p>Order #12345 confirmed.</p>",
    "metadata": {
      "orderId": "12345",
      "type": "order_confirmation"
    }
  }'
```

---

### Example 2: User Registration Flow

**Scenario:** New user signs up, send welcome email + email verification.

```typescript
import { MailQueue } from '@mail-queue/sdk';

const mq = new MailQueue({
  apiKey: process.env.MAIL_QUEUE_API_KEY,
  baseUrl: process.env.MAIL_QUEUE_URL,
});

async function handleUserRegistration(user: User) {
  // Generate verification token
  const verificationToken = generateToken();
  const verificationUrl = `https://yourapp.com/verify?token=${verificationToken}`;

  // Send welcome + verification email
  const result = await mq.emails.send({
    queue: 'transactional',
    from: {
      email: 'hello@yourapp.com',
      name: 'YourApp',
    },
    to: [{ email: user.email, name: user.name }],
    subject: 'Welcome to YourApp - Please verify your email',
    html: `
      <h1>Welcome to YourApp, ${user.firstName}!</h1>
      <p>Thanks for signing up. Please verify your email address:</p>
      <a href="${verificationUrl}" style="
        display: inline-block;
        padding: 12px 24px;
        background: #007bff;
        color: white;
        text-decoration: none;
        border-radius: 4px;
      ">Verify Email</a>
      <p>Or copy this link: ${verificationUrl}</p>
      <p>This link expires in 24 hours.</p>
    `,
    text: `Welcome to YourApp! Verify your email: ${verificationUrl}`,
    metadata: {
      userId: user.id,
      type: 'welcome_verification',
    },
  });

  return result;
}
```

---

### Example 3: Bulk Newsletter Campaign

**Scenario:** Send a newsletter to 10,000 subscribers with personalization.

```typescript
import { MailQueue } from '@mail-queue/sdk';

const mq = new MailQueue({
  apiKey: process.env.MAIL_QUEUE_API_KEY,
  baseUrl: process.env.MAIL_QUEUE_URL,
});

async function sendNewsletter(subscribers: Subscriber[], campaign: Campaign) {
  // Use batch sending for efficiency
  const result = await mq.emails.sendBatch({
    queue: 'newsletter',  // Lower priority queue with rate limiting
    from: {
      email: 'newsletter@yourcompany.com',
      name: 'YourCompany Newsletter',
    },
    subject: campaign.subject,
    html: campaign.htmlTemplate,  // Contains {{firstName}}, {{unsubscribeUrl}}
    emails: subscribers.map(sub => ({
      to: sub.email,
      personalizations: {
        firstName: sub.firstName || 'there',
        unsubscribeUrl: `https://yourapp.com/unsubscribe?id=${sub.id}`,
        preferencesUrl: `https://yourapp.com/preferences?id=${sub.id}`,
      },
    })),
    metadata: {
      campaignId: campaign.id,
      type: 'newsletter',
    },
  });

  console.log(`Batch queued: ${result.accepted} emails accepted`);
  return result;
}

// Usage
const subscribers = await getActiveSubscribers(); // 10,000 subscribers
const campaign = {
  id: 'campaign-2024-01',
  subject: 'January Newsletter - {{firstName}}, check out what\'s new!',
  htmlTemplate: `
    <h1>Hi {{firstName}}!</h1>
    <p>Here's what's new this month...</p>
    <!-- newsletter content -->
    <hr>
    <p>
      <a href="{{unsubscribeUrl}}">Unsubscribe</a> |
      <a href="{{preferencesUrl}}">Email Preferences</a>
    </p>
  `,
};

await sendNewsletter(subscribers, campaign);
```

---

### Example 4: Password Reset with Expiration

**Scenario:** User requests password reset, send time-sensitive email.

```typescript
async function sendPasswordReset(user: User) {
  const resetToken = generateSecureToken();
  const resetUrl = `https://yourapp.com/reset-password?token=${resetToken}`;

  // Store token with expiration in your database
  await saveResetToken(user.id, resetToken, expiresIn: '1h');

  const result = await mq.emails.send({
    queue: 'transactional',
    from: {
      email: 'security@yourapp.com',
      name: 'YourApp Security',
    },
    to: [{ email: user.email }],
    subject: 'Password Reset Request',
    html: `
      <h2>Password Reset</h2>
      <p>We received a request to reset your password.</p>
      <p>Click the button below to reset it:</p>
      <a href="${resetUrl}" style="
        display: inline-block;
        padding: 12px 24px;
        background: #dc3545;
        color: white;
        text-decoration: none;
        border-radius: 4px;
      ">Reset Password</a>
      <p><strong>This link expires in 1 hour.</strong></p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr>
      <p style="color: #666; font-size: 12px;">
        For security, this request was received from IP: ${requestIp}
      </p>
    `,
    metadata: {
      userId: user.id,
      type: 'password_reset',
      requestIp: requestIp,
    },
  });

  return result;
}
```

---

### Example 5: Scheduled Email (Future Send)

**Scenario:** Schedule a reminder email to be sent 24 hours before an event.

```typescript
async function scheduleEventReminder(event: Event, attendee: User) {
  // Calculate send time: 24 hours before event
  const sendAt = new Date(event.startTime);
  sendAt.setHours(sendAt.getHours() - 24);

  const result = await mq.emails.send({
    queue: 'transactional',
    from: {
      email: 'events@yourapp.com',
      name: 'YourApp Events',
    },
    to: [{ email: attendee.email, name: attendee.name }],
    subject: `Reminder: ${event.title} is tomorrow!`,
    html: `
      <h1>Event Reminder</h1>
      <p>Hi ${attendee.firstName},</p>
      <p>This is a reminder that <strong>${event.title}</strong> is happening tomorrow!</p>
      <p><strong>When:</strong> ${formatDate(event.startTime)}</p>
      <p><strong>Where:</strong> ${event.location}</p>
      <a href="${event.calendarLink}">Add to Calendar</a>
    `,
    scheduled_at: sendAt.toISOString(),  // Schedule for future delivery
    metadata: {
      eventId: event.id,
      attendeeId: attendee.id,
      type: 'event_reminder',
    },
  });

  console.log(`Reminder scheduled for ${sendAt.toISOString()}`);
  return result;
}
```

---

### Example 6: Webhook Integration (Track Delivery)

**Scenario:** Get notified when emails are delivered, opened, or bounced.

#### 1. Configure Webhook in Dashboard

Set your webhook URL in the app settings:
- **URL:** `https://yourapp.com/webhooks/mail-queue`
- **Events:** `sent`, `delivered`, `bounced`, `opened`, `clicked`
- **Secret:** `whsec_abc123...` (for signature verification)

#### 2. Handle Webhooks in Your App

```typescript
import crypto from 'crypto';
import express from 'express';

const app = express();

app.post('/webhooks/mail-queue', express.json(), (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const payload = JSON.stringify(req.body);

  const expectedSig = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  if (signature !== `sha256=${expectedSig}`) {
    return res.status(401).send('Invalid signature');
  }

  // Process the event
  const event = req.body;

  switch (event.type) {
    case 'email.delivered':
      console.log(`Email ${event.emailId} delivered to ${event.recipient}`);
      // Update your database, trigger next workflow step, etc.
      break;

    case 'email.bounced':
      console.log(`Email ${event.emailId} bounced: ${event.bounceType}`);
      // Mark email as invalid, notify user, update suppression list
      if (event.bounceType === 'hard') {
        await markEmailAsInvalid(event.recipient);
      }
      break;

    case 'email.opened':
      console.log(`Email ${event.emailId} opened by ${event.recipient}`);
      // Track engagement
      await recordEmailOpen(event.emailId, event.metadata);
      break;

    case 'email.clicked':
      console.log(`Link clicked in ${event.emailId}: ${event.url}`);
      // Track click-through
      await recordLinkClick(event.emailId, event.url, event.metadata);
      break;
  }

  res.status(200).send('OK');
});
```

---

## Queue Configuration Best Practices

### Recommended Queue Setup

```typescript
// Create queues via SDK or Dashboard

// High-priority transactional emails
await mq.queues.create({
  name: 'transactional',
  priority: 9,           // Highest priority
  rateLimit: 1000,       // 1000 emails/minute
  maxRetries: 5,
  retryDelay: [30, 120, 600, 3600, 86400], // Escalating retry delays
});

// Medium-priority notifications
await mq.queues.create({
  name: 'notifications',
  priority: 5,
  rateLimit: 500,
  maxRetries: 3,
  retryDelay: [60, 300, 1800],
});

// Lower-priority marketing/newsletters
await mq.queues.create({
  name: 'marketing',
  priority: 2,
  rateLimit: 100,        // Slower to protect reputation
  maxRetries: 2,
  retryDelay: [3600, 86400],
});
```

### Priority Hierarchy

| Queue Type | Priority | Rate Limit | Use Case |
|------------|----------|------------|----------|
| System Alerts | 10 | Unlimited | Critical system notifications |
| Transactional | 8-9 | High | Password resets, receipts, confirmations |
| Notifications | 5-7 | Medium | Activity updates, reminders |
| Marketing | 2-4 | Low | Newsletters, promotions |
| Bulk | 1 | Very Low | Mass campaigns, digests |

---

## Error Handling

### SDK Error Handling

```typescript
import { MailQueue, MailQueueError, RateLimitError, ValidationError } from '@mail-queue/sdk';

try {
  const result = await mq.emails.send({
    queue: 'transactional',
    from: { email: 'noreply@yourapp.com' },
    to: [{ email: 'user@example.com' }],
    subject: 'Hello',
    html: '<p>Hello World</p>',
  });
  console.log('Email queued:', result.id);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limiting - wait and retry
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
    await sleep(error.retryAfter * 1000);
    // Retry the request
  } else if (error instanceof ValidationError) {
    // Handle validation errors - fix the request
    console.error('Invalid request:', error.details);
  } else if (error instanceof MailQueueError) {
    // Handle other API errors
    console.error(`API Error ${error.statusCode}: ${error.message}`);
  } else {
    // Handle unexpected errors
    console.error('Unexpected error:', error);
  }
}
```

### Common Error Codes

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 400 | Validation error | Check request payload |
| 401 | Invalid API key | Verify API key |
| 403 | Insufficient permissions | Check API key scopes |
| 404 | Resource not found | Check queue/email ID |
| 409 | Duplicate (idempotency) | Request already processed |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Retry with backoff |

---

## Checking Email Status

### Get Single Email Status

```typescript
const email = await mq.emails.get('email-uuid-here');

console.log({
  id: email.id,
  status: email.status,        // 'queued' | 'processing' | 'sent' | 'delivered' | 'bounced' | 'failed'
  sentAt: email.sentAt,
  deliveredAt: email.deliveredAt,
  retryCount: email.retryCount,
  lastError: email.lastError,
});
```

### Get Email Events (Full History)

```typescript
const events = await mq.emails.getEvents('email-uuid-here');

events.forEach(event => {
  console.log(`${event.createdAt}: ${event.type}`, event.data);
});

// Output:
// 2024-01-15T10:00:00Z: queued {}
// 2024-01-15T10:00:01Z: processing {}
// 2024-01-15T10:00:02Z: sent { messageId: '<abc123@smtp.example.com>' }
// 2024-01-15T10:00:05Z: delivered {}
// 2024-01-15T10:05:00Z: opened { userAgent: 'Mozilla/5.0...', ip: '1.2.3.4' }
```

---

## Suppression List Management

Automatically manage email addresses that should not receive emails:

```typescript
// Add to suppression list (manual)
await mq.suppression.add({
  email: 'unsubscribed@example.com',
  reason: 'unsubscribe',  // 'hard_bounce' | 'soft_bounce' | 'complaint' | 'unsubscribe' | 'manual'
});

// Check if email is suppressed
const status = await mq.suppression.check('user@example.com');
if (status.suppressed) {
  console.log(`Cannot send to ${status.email}: ${status.reason}`);
}

// Remove from suppression (re-enable sending)
await mq.suppression.remove('user@example.com');

// List all suppressed emails
const list = await mq.suppression.list({ limit: 100 });
```

**Note:** Hard bounces and complaints are automatically added to the suppression list.

---

## GDPR Compliance

Mail Queue includes built-in GDPR compliance features:

### Export User Data

```typescript
// Export all email data for a user (GDPR data access request)
const exportData = await mq.gdpr.export('user@example.com');

// Returns all emails, events, and metadata for this address
console.log(exportData);
```

### Delete User Data

```typescript
// Delete all data for a user (GDPR erasure request)
await mq.gdpr.delete('user@example.com');

// This removes:
// - All emails sent to/from this address
// - All tracking events
// - Suppression list entries
// - Any stored metadata
```

---

## API Reference Quick Links

| Resource | Endpoint | Description |
|----------|----------|-------------|
| Emails | `POST /v1/emails` | Queue single email |
| Batch | `POST /v1/emails/batch` | Queue batch emails |
| Status | `GET /v1/emails/:id` | Get email status |
| Events | `GET /v1/emails/:id/events` | Get email events |
| Queues | `GET /v1/queues` | List queues |
| Analytics | `GET /v1/analytics/overview` | Get analytics |
| Suppression | `POST /v1/suppression` | Add to suppression |
| GDPR Export | `GET /v1/gdpr/export/:email` | Export user data |
| Health | `GET /v1/health` | Health check |

---

## Support & Resources

- **Dashboard:** Monitor queues, view analytics, manage configuration
- **API Documentation:** Full REST API reference
- **SDK Documentation:** TypeScript SDK with examples
- **GitHub Issues:** Report bugs and request features

---

## Quick Checklist for Integration

- [ ] Deploy Mail Queue (Docker Compose or Kubernetes)
- [ ] Create an App in the dashboard
- [ ] Generate API key with required scopes
- [ ] Configure SMTP settings
- [ ] Create queues (transactional, marketing, etc.)
- [ ] Install SDK or set up REST API client
- [ ] Implement email sending in your application
- [ ] Set up webhook endpoint for delivery tracking
- [ ] Configure suppression list handling
- [ ] Test in sandbox mode before going live
- [ ] Monitor dashboard for delivery metrics

---

*Mail Queue - Enterprise Email Orchestration Made Simple*
