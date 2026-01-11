'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApps, type App } from '@/lib/api';

interface AppContextValue {
  selectedAppId: string | null;
  selectedApp: App | null;
  apps: App[];
  isLoading: boolean;
  setSelectedAppId: (appId: string | null) => void;
  refreshApps: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const SELECTED_APP_KEY = 'mq_selected_app';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedAppId, setSelectedAppIdState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Fetch apps
  const {
    data: appsResponse,
    isLoading,
    refetch: refreshApps,
  } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps({ limit: 100 }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const apps = appsResponse?.data ?? [];

  // Initialize selected app from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !initialized) {
      const stored = localStorage.getItem(SELECTED_APP_KEY);
      if (stored) {
        setSelectedAppIdState(stored);
      }
      setInitialized(true);
    }
  }, [initialized]);

  // Auto-select first app if none selected and apps are loaded
  useEffect(() => {
    if (initialized && !selectedAppId && apps.length > 0) {
      setSelectedAppId(apps[0].id);
    }
  }, [initialized, selectedAppId, apps]);

  // Validate selected app exists
  useEffect(() => {
    if (initialized && selectedAppId && apps.length > 0) {
      const appExists = apps.some((app) => app.id === selectedAppId);
      if (!appExists) {
        // Selected app no longer exists, select first available
        setSelectedAppId(apps[0]?.id ?? null);
      }
    }
  }, [initialized, selectedAppId, apps]);

  const setSelectedAppId = useCallback((appId: string | null) => {
    setSelectedAppIdState(appId);
    if (typeof window !== 'undefined') {
      if (appId) {
        localStorage.setItem(SELECTED_APP_KEY, appId);
      } else {
        localStorage.removeItem(SELECTED_APP_KEY);
      }
    }
  }, []);

  const selectedApp = apps.find((app) => app.id === selectedAppId) ?? null;

  return (
    <AppContext.Provider
      value={{
        selectedAppId,
        selectedApp,
        apps,
        isLoading,
        setSelectedAppId,
        refreshApps,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
