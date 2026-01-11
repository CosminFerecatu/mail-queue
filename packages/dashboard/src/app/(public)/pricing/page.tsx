import Link from 'next/link';
import { CheckCircle, X } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Perfect for getting started and small projects',
    features: {
      apps: '1 Application',
      queues: '1 Queue per app',
      teamMembers: 'Owner only',
      analytics: 'Basic analytics',
      emailLogs: '7-day retention',
      apiAccess: true,
      webhooks: false,
      customSmtp: false,
      priorityQueue: false,
      dedicatedSupport: false,
      sla: false,
    },
    cta: 'Start Free',
    ctaLink: '/register',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    yearlyPrice: '$290/year',
    description: 'For growing teams and businesses',
    features: {
      apps: '3 Applications',
      queues: '3 Queues per app',
      teamMembers: 'Up to 5 members',
      analytics: 'Advanced analytics',
      emailLogs: '30-day retention',
      apiAccess: true,
      webhooks: true,
      customSmtp: true,
      priorityQueue: true,
      dedicatedSupport: false,
      sla: false,
    },
    cta: 'Start Free Trial',
    ctaLink: '/register?plan=pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    yearlyPrice: '$990/year',
    description: 'For large-scale operations',
    features: {
      apps: '10 Applications',
      queues: '10 Queues per app',
      teamMembers: 'Unlimited members',
      analytics: 'Full analytics suite',
      emailLogs: '90-day retention',
      apiAccess: true,
      webhooks: true,
      customSmtp: true,
      priorityQueue: true,
      dedicatedSupport: true,
      sla: true,
    },
    cta: 'Start Free Trial',
    ctaLink: '/register?plan=enterprise',
    highlighted: false,
  },
];

const featureRows = [
  { key: 'apps', label: 'Applications' },
  { key: 'queues', label: 'Queues per app' },
  { key: 'teamMembers', label: 'Team members' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'emailLogs', label: 'Email log retention' },
  { key: 'apiAccess', label: 'API access', type: 'boolean' },
  { key: 'webhooks', label: 'Webhook events', type: 'boolean' },
  { key: 'customSmtp', label: 'Custom SMTP', type: 'boolean' },
  { key: 'priorityQueue', label: 'Priority queue', type: 'boolean' },
  { key: 'dedicatedSupport', label: 'Dedicated support', type: 'boolean' },
  { key: 'sla', label: 'SLA guarantee', type: 'boolean' },
];

export default function PricingPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include a 14-day free trial. No credit
            card required to start.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-20">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`p-8 rounded-lg border ${
                plan.highlighted ? 'border-primary bg-card shadow-lg scale-105' : 'bg-card'
              }`}
            >
              {plan.highlighted && (
                <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                  Most Popular
                </div>
              )}
              <h2 className="text-2xl font-bold">{plan.name}</h2>
              <div className="mt-4 mb-2">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              {plan.yearlyPrice && (
                <p className="text-sm text-muted-foreground mb-2">
                  or {plan.yearlyPrice} (save 17%)
                </p>
              )}
              <p className="text-muted-foreground mb-6">{plan.description}</p>
              <Link
                href={plan.ctaLink}
                className={`block text-center py-3 rounded-md font-medium transition-colors ${
                  plan.highlighted
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border border-border hover:bg-muted'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Compare Features</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-4 font-semibold">Feature</th>
                  {plans.map((plan) => (
                    <th key={plan.name} className="p-4 font-semibold text-center">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row, idx) => (
                  <tr key={row.key} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
                    <td className="p-4 font-medium">{row.label}</td>
                    {plans.map((plan) => {
                      const value = plan.features[row.key as keyof typeof plan.features];
                      return (
                        <td key={`${plan.name}-${row.key}`} className="p-4 text-center">
                          {row.type === 'boolean' ? (
                            value ? (
                              <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-5 w-5 text-muted-foreground mx-auto" />
                            )
                          ) : (
                            <span>{value as string}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-20">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Can I change plans later?</h3>
              <p className="text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. When upgrading, you&apos;ll
                get immediate access to the new features. When downgrading, the change takes effect
                at the end of your billing period.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">What happens if I exceed my limits?</h3>
              <p className="text-muted-foreground">
                We&apos;ll notify you when you&apos;re approaching your limits. You won&apos;t be
                able to create new apps or queues beyond your plan limits, but existing emails will
                continue to be processed.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Is there a free trial?</h3>
              <p className="text-muted-foreground">
                Yes! All paid plans come with a 14-day free trial. You can try all features before
                committing. No credit card required to start.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Do you offer custom enterprise plans?</h3>
              <p className="text-muted-foreground">
                Yes, for organizations with specific requirements, we offer custom enterprise plans
                with dedicated infrastructure, custom SLAs, and priority support. Contact us for
                details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
