// ===========================================
// Subscription Plans
// ===========================================

export const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    maxApps: 1,
    maxQueuesPerApp: 1,
    maxTeamMembers: 0,
    features: ['basic_analytics', 'email_logs', 'api_access'],
    price: {
      monthly: 0,
      yearly: 0,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For growing teams',
    maxApps: 3,
    maxQueuesPerApp: 3,
    maxTeamMembers: 5,
    features: [
      'basic_analytics',
      'email_logs',
      'api_access',
      'webhooks',
      'custom_smtp',
      'priority_queue',
      'advanced_analytics',
    ],
    price: {
      monthly: 29,
      yearly: 290,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large-scale operations',
    maxApps: 10,
    maxQueuesPerApp: 10,
    maxTeamMembers: null, // Unlimited
    features: [
      'basic_analytics',
      'email_logs',
      'api_access',
      'webhooks',
      'custom_smtp',
      'priority_queue',
      'advanced_analytics',
      'dedicated_support',
      'sla_guarantee',
      'custom_retention',
      'audit_logs',
    ],
    price: {
      monthly: 99,
      yearly: 990,
    },
  },
} as const;

export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlanId];

// ===========================================
// Plan Limits Helpers
// ===========================================

export function getPlanLimits(planId: SubscriptionPlanId) {
  const plan = SUBSCRIPTION_PLANS[planId];
  return {
    maxApps: plan.maxApps,
    maxQueuesPerApp: plan.maxQueuesPerApp,
    maxTeamMembers: plan.maxTeamMembers,
  };
}

export function isPlanFeatureEnabled(planId: SubscriptionPlanId, feature: string): boolean {
  const plan = SUBSCRIPTION_PLANS[planId];
  return (plan.features as readonly string[]).includes(feature);
}

export function canAddMoreApps(planId: SubscriptionPlanId, currentAppCount: number): boolean {
  const plan = SUBSCRIPTION_PLANS[planId];
  return currentAppCount < plan.maxApps;
}

export function canAddMoreQueues(planId: SubscriptionPlanId, currentQueueCount: number): boolean {
  const plan = SUBSCRIPTION_PLANS[planId];
  return currentQueueCount < plan.maxQueuesPerApp;
}

export function canAddMoreTeamMembers(
  planId: SubscriptionPlanId,
  currentMemberCount: number
): boolean {
  const plan = SUBSCRIPTION_PLANS[planId];
  // null means unlimited
  if (plan.maxTeamMembers === null) return true;
  return currentMemberCount < plan.maxTeamMembers;
}

// ===========================================
// Team Roles
// ===========================================

export const TEAM_ROLES = {
  admin: {
    id: 'admin',
    name: 'Admin',
    description: 'Full access to all features and team management',
    permissions: [
      'apps:read',
      'apps:write',
      'apps:delete',
      'queues:read',
      'queues:write',
      'queues:delete',
      'emails:read',
      'emails:write',
      'emails:delete',
      'analytics:read',
      'api_keys:read',
      'api_keys:write',
      'team:read',
      'team:write',
      'settings:read',
      'settings:write',
    ],
  },
  editor: {
    id: 'editor',
    name: 'Editor',
    description: 'Can manage emails and queues, but not team or billing',
    permissions: [
      'apps:read',
      'queues:read',
      'queues:write',
      'emails:read',
      'emails:write',
      'analytics:read',
      'api_keys:read',
    ],
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to all data',
    permissions: ['apps:read', 'queues:read', 'emails:read', 'analytics:read'],
  },
} as const;

export type TeamRoleId = keyof typeof TEAM_ROLES;
export type TeamRole = (typeof TEAM_ROLES)[TeamRoleId];

export function hasPermission(roleId: TeamRoleId, permission: string): boolean {
  const role = TEAM_ROLES[roleId];
  return (role.permissions as readonly string[]).includes(permission);
}

export function getRolePermissions(roleId: TeamRoleId): readonly string[] {
  return TEAM_ROLES[roleId].permissions;
}
