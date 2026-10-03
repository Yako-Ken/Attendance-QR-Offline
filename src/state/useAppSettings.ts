import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ThemePreference, Toast } from '../types/app'
import { DEFAULT_SETTINGS } from '../types/app'
import { loadSettings, saveSettings } from '../services/storage/repository'
import { randomUuid } from '../lib/util/uuid'

const TOAST_LIMIT = 3;

export function useAppSettings(): [AppSettings, (patch: Partial<AppSettings>) => void] {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let active = true;
    void loadSettings().then((stored) => {
      if (active) setSettings(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  return [settings, update];
}

export interface ToastController {
  readonly toasts: readonly Toast[];
  readonly push: (toast: Omit<Toast, 'id'>) => void;
  readonly dismiss: (id: string) => void;
}

export function useToasts(): ToastController {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = randomUuid();
      setToasts((current) => [...current, { ...toast, id }].slice(-TOAST_LIMIT));
      const timer = window.setTimeout(() => {
        timers.current.delete(id);
        setToasts((current) => current.filter((entry) => entry.id !== id));
      }, toast.durationMs);
      timers.current.set(id, timer);
    },
    [],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
}

export function cycleTheme(current: ThemePreference): ThemePreference {
  return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
}