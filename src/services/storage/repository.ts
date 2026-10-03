/**
 * Typed repositories over the storage backend.
 *
 * Nothing above this layer touches IndexedDB directly, and nothing here knows
 * about React. Every read is defensive: a stored value that no longer matches
 * the expected shape (older schema, corrupted entry, hand-edited storage) is
 * discarded rather than crashing the application.
 */

import type { AttendanceRecord, AttendanceSession } from '../../types/attendance';
import type { AppSettings, ThemePreference } from '../../types/app';
import { DEFAULT_SETTINGS } from '../../types/app';
import type { AcademicYear, StudentProfile } from '../../types/student';
import { isAcademicYear } from '../../types/student';
import { isUuid } from '../../lib/util/uuid';
import { getBackend, STORE_KV, STORE_SESSIONS } from './idb';

const KEY_DEVICE_ID = 'deviceId';
const KEY_PROFILE = 'studentProfile';
const KEY_SETTINGS = 'settings';
const KEY_ACTIVE_SESSION = 'activeSessionId';
const KEY_SESSIONS_INDEX = 'sessionsIndex';

export interface SessionSummary {
  readonly id: string;
  readonly sectionName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly total: number;
}

/* -------------------------------------------------------------------------- */
/* Device ID — created once, then never regenerated                           */
/* -------------------------------------------------------------------------- */

/**
 * A cryptographically random identifier for this browser installation.
 *
 * This is a *duplicate-device heuristic*, not proof of physical identity. A
 * browser cannot read a MAC address, and a user can clear storage or use a
 * different browser. We say so in the UI rather than overclaiming.
 */
export async function loadOrCreateDeviceId(): Promise<string> {
  const backend = await getBackend();
  const existing = await backend.get<unknown>(STORE_KV, KEY_DEVICE_ID);
  if (isUuid(existing)) return existing;

  const { randomUuid } = await import('../../lib/util/uuid');
  const created = randomUuid();
  await backend.set(STORE_KV, KEY_DEVICE_ID, created);
  return created;
}

export async function readDeviceId(): Promise<string | undefined> {
  const backend = await getBackend();
  const existing = await backend.get<unknown>(STORE_KV, KEY_DEVICE_ID);
  return isUuid(existing) ? existing : undefined;
}

/* -------------------------------------------------------------------------- */
/* Student profile                                                             */
/* -------------------------------------------------------------------------- */

function isStudentProfile(value: unknown): value is StudentProfile {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    isUuid(record['id']) &&
    typeof record['fullName'] === 'string' &&
    typeof record['studentId'] === 'string' &&
    record['studentId'].length > 0 &&
    typeof record['academicYear'] === 'string' &&
    isAcademicYear(record['academicYear']) &&
    typeof record['createdAt'] === 'string' &&
    typeof record['updatedAt'] === 'string'
  );
}

export async function loadProfile(): Promise<StudentProfile | undefined> {
  const backend = await getBackend();
  const stored = await backend.get<unknown>(STORE_KV, KEY_PROFILE);
  return isStudentProfile(stored) ? stored : undefined;
}

export async function saveProfile(profile: StudentProfile): Promise<void> {
  const backend = await getBackend();
  await backend.set(STORE_KV, KEY_PROFILE, profile);
}

export async function clearProfile(): Promise<void> {
  const backend = await getBackend();
  await backend.remove(STORE_KV, KEY_PROFILE);
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

const THEME_VALUES: readonly string[] = ['system', 'light', 'dark'];

function isSettings(value: unknown): value is Partial<AppSettings> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record['theme'] === undefined || typeof record['theme'] === 'string') &&
    (record['haptics'] === undefined || typeof record['haptics'] === 'boolean') &&
    (record['keepAwake'] === undefined || typeof record['keepAwake'] === 'boolean')
  );
}

function isTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_VALUES.includes(value);
}

function mergeSettings(stored: Partial<AppSettings>): AppSettings {
  return {
    theme: isTheme(stored.theme) ? stored.theme : 'system',
    haptics: typeof stored.haptics === 'boolean' ? stored.haptics : DEFAULT_SETTINGS.haptics,
    keepAwake:
      typeof stored.keepAwake === 'boolean' ? stored.keepAwake : DEFAULT_SETTINGS.keepAwake,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const backend = await getBackend();
  const stored = await backend.get<Partial<AppSettings>>(STORE_KV, KEY_SETTINGS);
  return stored === undefined || !isSettings(stored)
    ? DEFAULT_SETTINGS
    : mergeSettings(stored);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const backend = await getBackend();
  await backend.set(STORE_KV, KEY_SETTINGS, settings);
}

/* -------------------------------------------------------------------------- */
/* Attendance sessions                                                         */
/* -------------------------------------------------------------------------- */

function isRecordShape(value: unknown): value is AttendanceRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['fullName'] === 'string' &&
    typeof record['studentId'] === 'string' &&
    typeof record['academicYear'] === 'string' &&
    typeof record['deviceId'] === 'string' &&
    typeof record['scannedAt'] === 'string' &&
    typeof record['duplicateDeviceFlag'] === 'boolean'
  );
}

/**
 * A stored session is accepted if its envelope is sound; individual records
 * are filtered separately, so one corrupted row never costs a whole lecture's
 * attendance.
 */
function isSessionEnvelope(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    isUuid(record['id']) &&
    typeof record['sectionName'] === 'string' &&
    typeof record['createdAt'] === 'string' &&
    typeof record['updatedAt'] === 'string' &&
    typeof record['duplicateAttempts'] === 'number' &&
    Array.isArray(record['records'])
  );
}

function coerceSession(value: unknown): AttendanceSession | undefined {
  if (!isSessionEnvelope(value)) return undefined;

  const stored: Record<string, unknown> = value;
  const rawRows: unknown = stored['records'];
  const rows: unknown[] = Array.isArray(rawRows) ? rawRows : [];
  const records: AttendanceSession['records'] = [];
  for (const raw of rows) {
    if (!isRecordShape(raw)) continue;
    const year: unknown = raw.academicYear;
    const academicYear: AcademicYear = isAcademicYear(year) ? year : '1';
    records.push({ ...raw, academicYear });
  }

  return {
    id: stored['id'] as string,
    sectionName: stored['sectionName'] as string,
    createdAt: stored['createdAt'] as string,
    updatedAt: stored['updatedAt'] as string,
    duplicateAttempts: stored['duplicateAttempts'] as number,
    records,
  };
}

export async function loadSession(id: string): Promise<AttendanceSession | undefined> {
  const backend = await getBackend();
  const stored = await backend.get<unknown>(STORE_SESSIONS, id);
  return coerceSession(stored);
}

export async function saveSession(session: AttendanceSession): Promise<void> {
  const backend = await getBackend();
  await backend.set(STORE_SESSIONS, session.id, session);
  await writeSessionIndex(session);
}

export async function deleteSession(id: string): Promise<void> {
  const backend = await getBackend();
  await backend.remove(STORE_SESSIONS, id);
  const index = await readSessionIndex();
  await backend.set(
    STORE_KV,
    KEY_SESSIONS_INDEX,
    index.filter((entry) => entry.id !== id),
  );
}

export async function loadActiveSession(): Promise<AttendanceSession | undefined> {
  const backend = await getBackend();
  const id = await backend.get<string>(STORE_KV, KEY_ACTIVE_SESSION);
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return loadSession(id);
}

export async function setActiveSessionId(id: string | null): Promise<void> {
  const backend = await getBackend();
  if (id === null) {
    await backend.remove(STORE_KV, KEY_ACTIVE_SESSION);
    return;
  }
  await backend.set(STORE_KV, KEY_ACTIVE_SESSION, id);
}

/* -------------------------------------------------------------------------- */
/* Session index (recent sessions list)                                        */
/* -------------------------------------------------------------------------- */

async function readSessionIndex(): Promise<SessionSummary[]> {
  const backend = await getBackend();
  const stored = await backend.get<unknown>(STORE_KV, KEY_SESSIONS_INDEX);
  if (!Array.isArray(stored)) return [];
  const summaries: SessionSummary[] = [];
  for (const entry of stored) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record['id'] !== 'string' ||
      typeof record['sectionName'] !== 'string' ||
      typeof record['createdAt'] !== 'string' ||
      typeof record['updatedAt'] !== 'string' ||
      typeof record['total'] !== 'number'
    ) {
      continue;
    }
    summaries.push({
      id: record['id'],
      sectionName: record['sectionName'],
      createdAt: record['createdAt'],
      updatedAt: record['updatedAt'],
      total: record['total'],
    });
  }
  return summaries;
}

async function writeSessionIndex(session: AttendanceSession): Promise<void> {
  const backend = await getBackend();
  const index = (await readSessionIndex()).filter((entry) => entry.id !== session.id);
  index.unshift({
    id: session.id,
    sectionName: session.sectionName,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    total: session.records.length,
  });
  // Keep the list bounded; this is a convenience list, not an archive.
  await backend.set(STORE_KV, KEY_SESSIONS_INDEX, index.slice(0, 30));
}

export async function loadSessionIndex(): Promise<SessionSummary[]> {
  const index = await readSessionIndex();
  return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}