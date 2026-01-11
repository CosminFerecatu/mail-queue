'use client';

import { useState } from 'react';
import { ChevronsUpDown, Plus, Check, AppWindow } from 'lucide-react';
import { useAppContext } from '@/contexts/app-context';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface AppSwitcherProps {
  onCreateApp?: () => void;
}

export function AppSwitcher({ onCreateApp }: AppSwitcherProps) {
  const { selectedApp, apps, setSelectedAppId, isLoading } = useAppContext();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 animate-pulse">
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={onCreateApp}
      >
        <Plus className="h-4 w-4" />
        Create your first app
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          // biome-ignore lint/a11y/useSemanticElements: used for shadcn ui combobox pattern
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <AppWindow className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{selectedApp?.name ?? 'Select app'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <div className="p-2">
          <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Your Applications</p>
          <div className="space-y-1">
            {apps.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => {
                  setSelectedAppId(app.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors',
                  selectedApp?.id === app.id && 'bg-muted'
                )}
              >
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    app.isActive ? 'bg-green-500' : 'bg-muted-foreground'
                  )}
                />
                <span className="flex-1 truncate text-left">{app.name}</span>
                {selectedApp?.id === app.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
        {onCreateApp && (
          <>
            <div className="border-t" />
            <div className="p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateApp();
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                Create new app
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
