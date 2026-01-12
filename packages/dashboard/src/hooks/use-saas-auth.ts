'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  hasPermission as checkPermission,
  isAtLeastRole as checkRole,
  type Role,
} from '@/lib/permissions';

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
    return checkPermission(account.role, permission);
  };

  // Check if user is at least a certain role level
  const isAtLeastRole = (requiredRole: Role): boolean => {
    if (!account) return false;
    return checkRole(account.role, requiredRole);
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
