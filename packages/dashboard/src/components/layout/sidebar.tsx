'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Mail,
  Layers,
  AppWindow,
  BarChart3,
  Settings,
  Users,
  ShieldBan,
  LogOut,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AppSwitcher } from './app-switcher';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Apps', href: '/dashboard/apps', icon: AppWindow },
];

// App-scoped navigation (requires selected app)
const appNavigation = [
  { name: 'Queues', href: '/dashboard/queues', icon: Layers },
  { name: 'Emails', href: '/dashboard/emails', icon: Mail },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'API Keys', href: '/dashboard/api-keys', icon: Key },
  { name: 'Suppression', href: '/dashboard/suppression', icon: ShieldBan },
];

// Team/Account navigation
const teamNavigation = [
  { name: 'Team', href: '/dashboard/team', icon: Users },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

// Admin navigation (for legacy admin users)
const adminNavigation = [
  { name: 'Users', href: '/dashboard/users', icon: Users },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface SidebarProps {
  user?: {
    name: string;
    email: string;
    role: string;
  };
  onLogout?: () => void;
}

export function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminUser = user?.role === 'super_admin' || user?.role === 'admin';

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const handleCreateApp = () => {
    router.push('/dashboard/apps?create=true');
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          <span className="font-semibold">Mail Queue</span>
        </Link>
      </div>

      {/* App Switcher */}
      <div className="px-3 py-3 border-b">
        <AppSwitcher onCreateApp={handleCreateApp} />
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        {/* Main navigation */}
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* App-scoped navigation */}
        <Separator className="my-4" />
        <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
          Current App
        </div>
        <nav className="space-y-1">
          {appNavigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Team/Account navigation (for SaaS users) */}
        {!isAdminUser && (
          <>
            <Separator className="my-4" />
            <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
              Account
            </div>
            <nav className="space-y-1">
              {teamNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </>
        )}

        {/* Admin navigation (for legacy admin users) */}
        {isAdminUser && (
          <>
            <Separator className="my-4" />
            <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
              Administration
            </div>
            <nav className="space-y-1">
              {adminNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </>
        )}
      </ScrollArea>

      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {user?.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col items-start text-left">
                <span className="text-sm font-medium">{user?.name || 'User'}</span>
                <span className="text-xs text-muted-foreground">{user?.email || ''}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
