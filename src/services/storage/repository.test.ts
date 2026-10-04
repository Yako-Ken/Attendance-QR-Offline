/**
 * Persistence: the Device ID, the student profile, settings, and attendance
 * sessions, against a real IndexedDB implementation (fake-indexeddb).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { AttendanceSession } from '../../types/attendance'
import type { StudentProfile } from '../../types/student'
import { DEFAULT_SETTINGS } from '../../types/app'
import { isUuid } from '../../lib/util/uuid'
import { getBackend, resetBackendForTests, STORE_KV, STORE_SESSIONS } from './idb'
import {
  clearProfile,
  deleteSession,
  loadActiveSession,
  loadProfile,
  loadSession,
  loadSessionIndex,
  loadSettings,
  readDeviceId,
  saveProfile,
  saveSession,
  saveSettings,
  setActiveSessionId,
  loadOrCreateDeviceId,
} from './repository'

const DEVICE = 'aaaaaaaa-1111-4111-8111-111111111111';

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    fullName: 'Ahmed Mohamed Ali',
    studentId: '001234',
    academicYear: '3',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

function session(overrides: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: 'cccccccc-3333-4333-8333-333333333333',
    sectionName: 'CS-3-A',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:05:00.000Z',
    duplicateAttempts: 2,
    records: [
      {
        id: 'r1',
        fullName: 'Ahmed Mohamed Ali',
        studentId: '001234',
        academicYear: '3',
        deviceId: DEVICE,
        scannedAt: '2026-10-01T09:02:00.000Z',
        duplicateDeviceFlag: false,
        note: '',
      },
      {
        id: 'r2',
        fullName: 'Sara Ibrahim',
        studentId: '000999',
        academicYear: '2',
        deviceId: DEVICE,
        scannedAt: '2026-10-01T09:05:00.000Z',
        duplicateDeviceFlag: true,
        note: 'Late',
      },
    ],
    ...overrides,
  };
}

async function wipe(): Promise<void> {
  const backend = await getBackend();
  await backend.clear(STORE_KV);
  await backend.clear(STORE_SESSIONS);
}

beforeEach(async () => {
  resetBackendForTests();
  await wipe();
});

describe('storage backend', () => {
  it('reports which backend is in use', async () => {
    await expect(getBackend()).resolves.toMatchObject({ kind: 'indexeddb' });
  });

  it('stores and retrieves typed values', async () => {
    const backend = await getBackend();
    await backend.set(STORE_KV, 'probe', { hello: 'world' });

    await expect(backend.get<{ hello: string }>(STORE_KV, 'probe')).resolves.toEqual({
      hello: 'world',
    });
  });

  it('returns undefined for a missing key', async () => {
    const backend = await getBackend();

    await expect(backend.get(STORE_KV, 'nope')).resolves.toBeUndefined();
  });
});

describe('Device ID', () => {
  it('creates a cryptographically random UUID on first use', async () => {
    const id = await loadOrCreateDeviceId();

    expect(isUuid(id)).toBe(true);
  });

  it('returns the same Device ID on every subsequent call', async () => {
    const first = await loadOrCreateDeviceId();
    const second = await loadOrCreateDeviceId();

    expect(second).toBe(first);
  });

  it('survives a backend reconnect, which is what a page reload does', async () => {
    const first = await loadOrCreateDeviceId();
    resetBackendForTests();

    expect(await loadOrCreateDeviceId()).toBe(first);
  });

  it('is independent of the student profile and unaffected by edits to it', async () => {
    const id = await loadOrCreateDeviceId();
    await saveProfile(profile());
    await saveProfile(profile({ fullName: 'Renamed Person', studentId: '000001' }));

    expect(await readDeviceId()).toBe(id);
  });

  it('regenerates nothing when the profile is cleared', async () => {
    const id = await loadOrCreateDeviceId();
    await clearProfile();

    expect(await loadOrCreateDeviceId()).toBe(id);
  });

  it('replaces a corrupted value rather than trusting it', async () => {
    const backend = await getBackend();
    await backend.set(STORE_KV, 'deviceId', 'corrupted-not-a-uuid');

    const id = await loadOrCreateDeviceId();

    expect(isUuid(id)).toBe(true);
  });
});

describe('student profile persistence', () => {
  it('returns undefined before anything is saved', async () => {
    await expect(loadProfile()).resolves.toBeUndefined();
  });

  it('round-trips a profile', async () => {
    await saveProfile(profile());

    await expect(loadProfile()).resolves.toEqual(profile());
  });

  it('preserves leading zeros in the student ID', async () => {
    await saveProfile(profile({ studentId: '000123' }));

    const loaded = await loadProfile();

    expect(loaded?.studentId).toBe('000123');
  });

  it('preserves Arabic names', async () => {
    await saveProfile(profile({ fullName: 'أحمد محمد علي' }));

    expect((await loadProfile())?.fullName).toBe('أحمد محمد علي');
  });

  it('overwrites cleanly on the second save', async () => {
    await saveProfile(profile());
    await saveProfile(profile({ fullName: 'Second Edit' }));

    expect((await loadProfile())?.fullName).toBe('Second Edit');
  });

  it('discards a stored value that no longer matches the schema', async () => {
    const backend = await getBackend();
    await backend.set(STORE_KV, 'studentProfile', { fullName: 'Broken', studentId: 1234 });

    await expect(loadProfile()).resolves.toBeUndefined();
  });

  it('clears the profile on request', async () => {
    await saveProfile(profile());
    await clearProfile();

    await expect(loadProfile()).resolves.toBeUndefined();
  });
});

describe('settings persistence', () => {
  it('returns defaults when nothing is stored', async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings', async () => {
    await saveSettings({ theme: 'dark', haptics: false, keepAwake: true, notePromptOnScan: false });

    await expect(loadSettings()).resolves.toEqual({
      theme: 'dark',
      haptics: false,
      keepAwake: true,
      notePromptOnScan: false,
    });
  });

  it('falls back to defaults for an unrecognised theme', async () => {
    const backend = await getBackend();
    await backend.set(STORE_KV, 'settings', { theme: 'neon', haptics: false });

    await expect(loadSettings()).resolves.toEqual({ ...DEFAULT_SETTINGS, haptics: false });
  });
});

describe('attendance session persistence', () => {
  it('returns undefined for an unknown session', async () => {
    await expect(loadSession('missing')).resolves.toBeUndefined();
  });

  it('round-trips a session including records and duplicate attempts', async () => {
    await saveSession(session());

    const loaded = await loadSession(session().id);

    expect(loaded).toEqual(session());
    expect(loaded?.records).toHaveLength(2);
    expect(loaded?.duplicateAttempts).toBe(2);
  });

  it('preserves leading zeros and device flags through storage', async () => {
    await saveSession(session());
    const loaded = await loadSession(session().id);

    expect(loaded?.records[0]?.studentId).toBe('001234');
    expect(loaded?.records[1]?.studentId).toBe('000999');
    expect(loaded?.records[1]?.duplicateDeviceFlag).toBe(true);
  });

  it('keeps the Device ID on the record for duplicate detection after a reload', async () => {
    await saveSession(session());

    expect((await loadSession(session().id))?.records[0]?.deviceId).toBe(DEVICE);
  });

  it('recovers an in-progress session after a reload', async () => {
    await saveSession(session());
    await setActiveSessionId(session().id);
    resetBackendForTests();

    const recovered = await loadActiveSession();

    expect(recovered?.id).toBe(session().id);
    expect(recovered?.records).toHaveLength(2);
  });

  it('returns undefined when no session is active', async () => {
    await expect(loadActiveSession()).resolves.toBeUndefined();
  });

  it('stops reporting a session as active once cleared', async () => {
    await saveSession(session());
    await setActiveSessionId(session().id);
    await setActiveSessionId(null);

    await expect(loadActiveSession()).resolves.toBeUndefined();
  });

  it('discards a stored session that does not match the schema', async () => {
    const backend = await getBackend();
    await backend.set(STORE_SESSIONS, 'broken', { id: 'broken' });

    await expect(loadSession('broken')).resolves.toBeUndefined();
  });

  it('drops malformed records rather than surfacing a half-valid row', async () => {
    await backendPut(session({ records: [{ nope: true } as never] }));

    const loaded = await loadSession(session().id);

    expect(loaded?.records).toHaveLength(0);
  });

  it('deletes a session and its index entry', async () => {
    await saveSession(session());
    await expect(loadSessionIndex()).resolves.toHaveLength(1);

    await deleteSession(session().id);

    await expect(loadSession(session().id)).resolves.toBeUndefined();
    await expect(loadSessionIndex()).resolves.toHaveLength(0);
  });

  it('lists recent sessions newest first', async () => {
    await saveSession(session({ id: 's1', updatedAt: '2026-10-01T09:00:00.000Z' }));
    await saveSession(session({ id: 's2', updatedAt: '2026-10-02T09:00:00.000Z' }));

    const index = await loadSessionIndex();

    expect(index.map((entry) => entry.id)).toEqual(['s2', 's1']);
  });

  it('bounds the recent-session index', async () => {
    for (let i = 0; i < 40; i += 1) {
      await saveSession(session({ id: `s${i}`, updatedAt: `2026-10-01T09:${String(i % 60).padStart(2, '0')}:00.000Z` }));
    }

    await expect(loadSessionIndex()).resolves.toHaveLength(30);
  });
});

async function backendPut(value: AttendanceSession): Promise<void> {
  const backend = await getBackend();
  await backend.set(STORE_SESSIONS, value.id, value);
}
