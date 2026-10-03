/**
 * Application shell: mode navigation, offline and secure-context banners,
 * settings, toasts, and routing between the two workflows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThemePreference, Toast } from '../../types/app'
import { useAppSettings, useToasts } from '../../state/useAppSettings'
import { BREAKPOINTS, useMediaQuery } from '../../state/useMediaQuery'
import { ModeSwitch, type AppMode } from './ModeSwitch'
import { StudentMode } from '../student/StudentMode'
import { AttendanceMode, type AttendanceStage } from '../attendance/AttendanceMode'
import { Dialog, ToastList } from '../ui/primitives'
import { Icon, type IconName } from '../ui/Icon'
import { checkCameraSupport } from '../../services/scanner/camera'
import { getStorageKind } from '../../services/storage/idb'
import { loadOrCreateDeviceId } from '../../services/storage/repository'

const STAGE_KEY = 'attendance.stage';

export function App() {
  const [mode, setMode] = useState<AppMode>('student');
  const [deviceId, setDeviceId] = useState<string>('');
  const [stage, setStage] = useState<AttendanceStage>(() => {
    if (typeof sessionStorage === 'undefined') return 'setup';
    const stored = sessionStorage.getItem(STAGE_KEY);
    return stored === 'live' || stored === 'review' ? stored : 'setup';
  });
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [memoryOnly, setMemoryOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [settings, updateSettings] = useAppSettings();
  const { toasts, push, dismiss } = useToasts();
  const isDesktop = useMediaQuery(BREAKPOINTS.desktopRail);

  useEffect(() => {
    let active = true;
    void loadOrCreateDeviceId().then((id) => {
      if (active) setDeviceId(id);
    });
    void getStorageKind().then((kind) => {
      if (active) setMemoryOnly(kind === 'memory');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STAGE_KEY, stage);
  }, [stage]);

  useEffect(() => {
    const onOnline = (): void => setOnline(true);
    const onOffline = (): void => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const notify = useCallback(
    (tone: Toast['tone'], title: string, text?: string): void => {
      const entry = text === undefined ? { tone, title } : { tone, title, text };
      push({ ...entry, durationMs: tone === 'danger' ? 7000 : 4200 });
    },
    [push],
  );

  const context = useMemo(() => {
    if (mode === 'student') {
      return { title: 'Student pass', sub: 'QR for attendance' };
    }
    if (stage === 'setup') return { title: 'Attendance', sub: 'New session' };
    if (stage === 'live') return { title: 'Attendance', sub: 'Live scanning' };
    return { title: 'Attendance', sub: 'Review & export' };
  }, [mode, stage]);

  const navigate = useCallback((next: AppMode): void => {
    setMode(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const cameraSupport = checkCameraSupport();

  return (
    <div className="aq-app">
      <a className="aq-skip" href="#aq-main">
        Skip to main content
      </a>

      <nav className="aq-rail" aria-label="Primary">
        <div className="aq-brand">
          <span className="aq-brand__mark" aria-hidden="true">
            <Icon name="scan" size={18} />
          </span>
          <span>
            <span className="aq-brand__name">Attendance QR</span>
            <span className="aq-brand__tag">Offline first</span>
          </span>
        </div>

        <div className="aq-nav" role="list">
          <NavItem
            icon="student"
            label="Student"
            hint="بطاقة الطالب"
            active={mode === 'student'}
            onSelect={() => navigate('student')}
          />
          <NavItem
            icon="scan"
            label="Attendance"
            hint="تسجيل الحضور"
            active={mode === 'attendance'}
            onSelect={() => navigate('attendance')}
          />
        </div>

        <div className="aq-raildetail">
          {deviceId !== '' ? (
            <div className="aq-kv">
              <span className="aq-kv__k">Device ID</span>
              <span className="aq-kv__v aq-mono" title={deviceId}>
                {deviceId.slice(0, 8)}…{deviceId.slice(-4)}
              </span>
            </div>
          ) : null}
          <div className="aq-row">
            <button
              type="button"
              className="aq-iconbtn"
              onClick={() => setShowSettings(true)}
              aria-label="Settings and privacy notes"
            >
              <Icon name="settings" size={18} />
            </button>
            <span className="aq-text-xs aq-text-muted">
              All data stays on this device.
            </span>
          </div>
        </div>
      </nav>

      <div className="aq-frame">
        {!isDesktop ? (
          <header className="aq-topbar">
            <div className="aq-brand">
              <span className="aq-brand__mark" aria-hidden="true">
                <Icon name="scan" size={16} />
              </span>
              <div className="aq-topbar__ctx">
                <span className="aq-topbar__title">{context.title}</span>
                <span className="aq-topbar__sub">{context.sub}</span>
              </div>
            </div>
            <button
              type="button"
              className="aq-iconbtn"
              onClick={() => setShowSettings(true)}
              aria-label="Settings and privacy notes"
            >
              <Icon name="settings" size={18} />
            </button>
          </header>
        ) : null}

        {!isDesktop ? (
          <div style={{ padding: 'var(--s-3) var(--s-4) 0' }}>
            <ModeSwitch mode={mode} onChange={navigate} block />
          </div>
        ) : null}

        {!online ? (
          <p className="aq-ribbon">
            <Icon name="wifiOff" size={15} />
            You are offline. The app is still fully usable.
          </p>
        ) : null}

        {memoryOnly ? (
          <p className="aq-ribbon">
            <Icon name="alert" size={15} />
            Storage is blocked in this browser mode, so data is kept in memory only and will be lost
            on reload.
          </p>
        ) : null}

        {mode === 'attendance' && cameraSupport.blocker !== null ? (
          <p className="aq-ribbon">
            <Icon name="lock" size={15} />
            {cameraSupport.message}
          </p>
        ) : null}

        <main className="aq-main" id="aq-main" tabIndex={-1}>
          {mode === 'student' ? (
            <StudentMode deviceId={deviceId} />
          ) : (
            <AttendanceMode
              settings={settings}
              haptics={settings.haptics}
              onNotify={notify}
              initialStage={stage}
              onStageChange={setStage}
            />
          )}
        </main>
      </div>

      <ToastList toasts={toasts} onDismiss={dismiss} />

      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={settings.theme}
        onTheme={(theme) => updateSettings({ theme })}
        haptics={settings.haptics}
        onHaptics={(haptics) => updateSettings({ haptics })}
        keepAwake={settings.keepAwake}
        onKeepAwake={(keepAwake) => updateSettings({ keepAwake })}
        deviceId={deviceId}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

interface NavItemProps {
  readonly icon: IconName;
  readonly label: string;
  readonly hint: string;
  readonly active: boolean;
  readonly onSelect: () => void;
}

function NavItem({ icon, label, hint, active, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      role="listitem"
      className="aq-nav__item"
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
    >
      <Icon name={icon} size={18} />
      <span className="aq-stack" style={{ gap: 0 }}>
        <span>{label}</span>
        <span className="aq-text-xs aq-text-muted" style={{ fontWeight: 500 }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

interface SettingsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly theme: ThemePreference;
  readonly onTheme: (theme: ThemePreference) => void;
  readonly haptics: boolean;
  readonly onHaptics: (value: boolean) => void;
  readonly keepAwake: boolean;
  readonly onKeepAwake: (value: boolean) => void;
  readonly deviceId: string;
}

const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

function SettingsDialog({
  open,
  onClose,
  theme,
  onTheme,
  haptics,
  onHaptics,
  keepAwake,
  onKeepAwake,
  deviceId,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} title="Settings" onClose={onClose}>
      <div className="aq-stack">
        <div className="aq-row aq-row--between aq-row--wrap">
          <span className="aq-text-sm">Appearance</span>
          <div className="aq-row">
            {(['system', 'light', 'dark'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="aq-btn aq-btn--sm"
                aria-pressed={theme === option}
                style={
                  theme === option
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent' }
                    : undefined
                }
                onClick={() => onTheme(option)}
              >
                {THEME_LABEL[option]}
              </button>
            ))}
          </div>
        </div>

        <Toggle
          label="Vibrate on a successful scan"
          hint="Uses the device's vibration motor when one is available."
          checked={haptics}
          onChange={onHaptics}
        />
        <Toggle
          label="Keep the screen on while scanning"
          hint="Stops the display sleeping mid-lecture, where the browser supports it."
          checked={keepAwake}
          onChange={onKeepAwake}
        />

        <div className="aq-kv">
          <span className="aq-kv__k">Device ID</span>
          <span className="aq-mono aq-text-xs" style={{ overflowWrap: 'anywhere' }}>
            {deviceId === '' ? 'Generating…' : deviceId}
          </span>
        </div>

        <p className="aq-text-xs aq-text-muted">
          The Device ID is a random value stored in this browser. It is used only to flag several
          attendance records that share one identifier. It is not a hardware address, it cannot
          identify a physical handset with certainty, and a student can defeat it by clearing site
          data or using a different browser.
        </p>

        <p className="aq-text-xs aq-text-muted">
          No analytics, no accounts, no server. The app works fully offline once it has loaded.
        </p>
      </div>
    </Dialog>
  );
}

interface ToggleProps {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="aq-row aq-row--between aq-row--wrap" style={{ cursor: 'pointer' }}>
      <span className="aq-stack" style={{ gap: 0, flex: '1 1 14rem' }}>
        <span className="aq-text-sm">{label}</span>
        {hint !== undefined ? <span className="aq-text-xs aq-text-muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--accent)' }}
      />
    </label>
  )
}

