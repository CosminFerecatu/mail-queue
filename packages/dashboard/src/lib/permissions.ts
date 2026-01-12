export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export type Permission =
  | 'apps:read'
  | 'apps:write'
  | 'apps:delete'
  | 'queues:read'
  | 'queues:write'
  | 'queues:delete'
  | 'emails:read'
  | 'emails:write'
  | 'emails:delete'
  | 'analytics:read'
  | 'api_keys:read'
  | 'api_keys:write'
  | 'team:read'
  | 'team:write'
  | 'settings:read'
  | 'settings:write'
  | 'billing:read'
  | 'billing:write';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
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
    'billing:read',
    'billing:write',
  ],
  admin: [
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
  editor: [
    'apps:read',
    'queues:read',
    'queues:write',
    'emails:read',
    'emails:write',
    'analytics:read',
    'api_keys:read',
  ],
  viewer: ['apps:read', 'queues:read', 'emails:read', 'analytics:read'],
};

const ROLE_HIERARCHY: Role[] = ['viewer', 'editor', 'admin', 'owner'];

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission as Permission) ?? false;
}

/**
 * Check if a user's role is at least the required role level
 */
export function isAtLeastRole(userRole: Role, requiredRole: Role): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  return userRoleIndex >= requiredRoleIndex;
}
