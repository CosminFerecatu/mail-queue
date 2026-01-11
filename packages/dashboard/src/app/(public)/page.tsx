import Link from 'next/link';
import { Mail, Shield, BarChart3, Webhook, Layers, Zap, Users, CheckCircle } from 'lucide-react';

const features = [
  {
    icon: Layers,
    title: 'Multi-Tenant Architecture',
    description:
      'Isolate your apps and queues with complete data separation. Each app has its own configuration, limits, and API keys.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description:
      'Track delivery rates, open rates, click rates, and bounces with detailed analytics dashboards.',
  },
  {
    icon: Webhook,
    title: 'Webhook Events',
    description:
      'Get notified instantly when emails are delivered, opened, clicked, or bounced with reliable webhook delivery.',
  },
  {
    icon: Shield,
    title: 'GDPR Compliant',
    description:
      'Built-in GDPR compliance with data export, deletion requests, and comprehensive audit logging.',
  },
  {
    icon: Zap,
    title: 'High Performance',
    description:
      'Process millions of emails per day with Redis-backed queues and horizontal scaling.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description:
      'Invite team members with role-based access control. Admins, editors, and viewers.',
  },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Perfect for getting started',
    features: ['1 Application', '1 Queue per app', 'Basic analytics', 'Email logs', 'API access'],
    cta: 'Start Free',
    ctaLink: '/register',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For growing teams',
    features: [
      '3 Applications',
      '3 Queues per app',
      '5 Team members',
      'Advanced analytics',
      'Custom SMTP',
      'Webhooks',
      'Priority queue',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/register?plan=pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    description: 'For large-scale operations',
    features: [
      '10 Applications',
      '10 Queues per app',
      'Unlimited team members',
      'Dedicated support',
      'SLA guarantee',
      'Custom retention',
      'Full audit logs',
    ],
    cta: 'Contact Sales',
    ctaLink: '/register?plan=enterprise',
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            Email Infrastructure
            <br />
            <span className="text-primary">That Scales With You</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Reliable, scalable email delivery for modern applications. Send transactional emails,
            track engagement, and manage your email infrastructure with ease.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Start Free
            </Link>
            <Link
              href="#features"
              className="border border-border px-8 py-3 rounded-md text-lg font-medium hover:bg-muted transition-colors"
            >
              Learn More
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Free forever plan</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Setup in minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Everything You Need</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A complete email infrastructure solution with all the features you need to send,
              track, and manage your transactional emails.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-lg border bg-card hover:shadow-md transition-shadow"
              >
                <feature.icon className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your needs. Start free and scale as you grow.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
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
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <div className="mt-4 mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <p className="text-muted-foreground mb-6">{plan.description}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
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
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Join thousands of developers who trust Mail Queue for their email infrastructure. Start
            sending in minutes.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-md text-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Mail className="h-5 w-5" />
            Create Your Free Account
          </Link>
        </div>
      </section>
    </div>
  );
}
