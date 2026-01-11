'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useSaaSAuth } from '@/hooks/use-saas-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { AppProvider } from '@/contexts/app-context';
import { Toaster } from '@/components/ui/toaster';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, account, loading, logout } = useSaaSAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="w-64 border-r p-4">
          <Skeleton className="h-10 w-32 mb-8" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`nav-skeleton-${i}`} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={`card-skeleton-${i}`} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Combine user and account role for Sidebar
  const sidebarUser = {
    name: user.name,
    email: user.email,
    role: account?.role ?? 'viewer',
  };

  return (
    <AppProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={sidebarUser} onLogout={logout} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster />
    </AppProvider>
  );
}
