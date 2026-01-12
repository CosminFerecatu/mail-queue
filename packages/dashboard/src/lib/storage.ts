const STORAGE_KEYS = {
  TOKEN: 'mq_token',
  SELECTED_APP: 'mq_selected_app',
} as const;

function isClient(): boolean {
  return typeof window !== 'undefined';
}

export const storage = {
  getToken: (): string | null => {
    if (!isClient()) return null;
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  },

  setToken: (token: string): void => {
    if (!isClient()) return;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  },

  removeToken: (): void => {
    if (!isClient()) return;
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
  },

  getSelectedApp: (): string | null => {
    if (!isClient()) return null;
    return localStorage.getItem(STORAGE_KEYS.SELECTED_APP);
  },

  setSelectedApp: (appId: string): void => {
    if (!isClient()) return;
    localStorage.setItem(STORAGE_KEYS.SELECTED_APP, appId);
  },

  removeSelectedApp: (): void => {
    if (!isClient()) return;
    localStorage.removeItem(STORAGE_KEYS.SELECTED_APP);
  },
};
