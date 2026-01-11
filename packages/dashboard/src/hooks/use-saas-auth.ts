'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export interface SaaSUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export interface SaaSAccount {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'editor' | 'viewer';
}

export function useSaaSAuth() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const loading = status === 'loading';
  const authenticated = status === 'authenticated';

  const user: SaaSUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
        image: session.user.image ?? undefined,
      }
    : null;

  const account: SaaSAccount | null = session?.account ?? null;
  const selectedAppId = session?.selectedAppId ?? null;

  // Check if user has a specific permission based on role
  const hasPermission = (permission: string): boolean => {
    if (!account) return false;

    const rolePermissions: Record<string, string[]> = {
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

    return rolePermissions[account.role]?.includes(permission) ?? false;
  };

  // Check if user is at least a certain role level
  const isAtLeastRole = (requiredRole: 'owner' | 'admin' | 'editor' | 'viewer'): boolean => {
    if (!account) return false;

    const roleHierarchy = ['viewer', 'editor', 'admin', 'owner'];
    const userRoleIndex = roleHierarchy.indexOf(account.role);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

    return userRoleIndex >= requiredRoleIndex;
  };

  // Login with email/password
  const login = async (email: string, password: string): Promise<boolean> => {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.ok) {
      router.push('/dashboard');
      return true;
    }
    return false;
  };

  // Login with Google
  const loginWithGoogle = async () => {
    await signIn('google', { callbackUrl: '/dashboard' });
  };

  // Logout
  const logout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  // Update selected app
  const setSelectedAppId = async (appId: string | null) => {
    await update({ selectedAppId: appId });
  };

  return {
    user,
    account,
    selectedAppId,
    loading,
    authenticated,
    hasPermission,
    isAtLeastRole,
    login,
    loginWithGoogle,
    logout,
    setSelectedAppId,
  };
}
