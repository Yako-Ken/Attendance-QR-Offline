/** App-wide settings and storage capability reporting. */

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  theme: ThemePreference;
  /** Short vibration on successful scan when the device supports it. */
  haptics: boolean;
  /** Request a screen wake lock while the scanner is running. */
  keepAwake: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  haptics: true,
  keepAwake: true,
};

/**
 * 'indexeddb' — durable, survives reloads and restarts.
 * 'memory'    — IndexedDB unavailable (e.g. blocked storage); session stays
 *               usable for the current tab but is lost on reload. The UI states
 *               this explicitly rather than pretending data is safe.
 */
export type StorageMode = 'indexeddb' | 'memory';

export type ToastTone = 'ok' | 'warn' | 'danger' | 'info';

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly text?: string;
  readonly action?: { readonly label: string; readonly run: () => void };
  readonly durationMs: number;
}