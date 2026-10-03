/**
 * Attendance session controller.
 *
 * All decisions live in `lib/attendance/engine`; this hook only sequences them
 * and keeps the session persisted. The teaching assistant's three-way choice on
 * a same-device conflict is held as *pending* state: nothing is written to the
 * session until the choice is made, so cancelling can never mutate attendance.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AttendanceRecord,
  AttendanceSession,
  EditResult,
  SessionStats,
} from '../types/attendance'
import type { AttendanceQrPayload } from '../types/qr'
import {
  appendConflictingRecord,
  appendRecord,
  computeSessionStats,
  createSession,
  editRecordInSession,
  evaluateScan,
  sharedDeviceIds,
} from '../lib/attendance/engine'
import { normalizeSectionName } from '../lib/validation/student'
import { nowIso } from '../lib/util/time'
import {
  loadActiveSession,
  saveSession,
  setActiveSessionId,
  deleteSession,
} from '../services/storage/repository'

export interface PendingConflict {
  readonly record: AttendanceRecord;
  readonly conflicts: readonly AttendanceRecord[];
}

export type ScanFeedback =
  | { readonly kind: 'added'; readonly record: AttendanceRecord }
  | { readonly kind: 'duplicate'; readonly record: AttendanceRecord }
  | { readonly kind: 'device-conflict' }
  | { readonly kind: 'invalid'; readonly message: string };

export interface SessionController {
  readonly session: AttendanceSession | null;
  readonly status: 'loading' | 'ready';
  readonly stats: SessionStats;
  readonly pendingConflict: PendingConflict | null;
  readonly sharedDevices: ReadonlySet<string>;
  readonly start: (sectionName: string) => void;
  readonly handleScan: (payload: AttendanceQrPayload) => ScanFeedback;
  readonly acceptPendingConflict: () => void;
  readonly dismissPendingConflict: () => void;
  readonly updateRecord: (recordId: string, patch: { fullName?: string; studentId?: string; academicYear?: string }) => EditResult;
  readonly removeRecord: (recordId: string) => void;
  readonly discardSession: () => void;
  readonly clearFeedback: () => void;
}

const EMPTY_STATS: SessionStats = {
  total: 0,
  deviceAlerts: 0,
  flaggedRecords: 0,
  duplicateAttempts: 0,
  firstScanAt: null,
  lastScanAt: null,
};

export function useAttendanceSession(onFeedback?: (feedback: ScanFeedback) => void): SessionController {
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const sessionRef = useRef<AttendanceSession | null>(null);
  sessionRef.current = session;
  const feedbackRef = useRef(onFeedback);
  feedbackRef.current = onFeedback;

  useEffect(() => {
    let active = true;
    void loadActiveSession().then((stored) => {
      if (!active) return;
      setSession(stored ?? null);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist on every mutation. Writes are small (one session object) and this
  // removes any window in which a reload loses an accepted scan.
  const commit = useCallback((next: AttendanceSession) => {
    sessionRef.current = next;
    setSession(next);
    void saveSession(next);
  }, []);

  const start = useCallback(
    (sectionName: string) => {
      const next = createSession({ sectionName: normalizeSectionName(sectionName) });
      commit(next);
      setPendingConflict(null);
      void setActiveSessionId(next.id);
    },
    [commit],
  );

  const handleScan = useCallback(
    (payload: AttendanceQrPayload): ScanFeedback => {
      const current = sessionRef.current;
      if (current === null) {
        return { kind: 'invalid', message: 'Start an attendance session first.' };
      }

      const evaluation = evaluateScan(current, payload);

      switch (evaluation.kind) {
        case 'duplicate': {
          commit({ ...current, duplicateAttempts: current.duplicateAttempts + 1, updatedAt: nowIso() });
          const feedback: ScanFeedback = { kind: 'duplicate', record: evaluation.existing };
          feedbackRef.current?.(feedback);
          return feedback;
        }
        case 'device-conflict': {
          setPendingConflict({ record: evaluation.record, conflicts: evaluation.conflicts });
          const feedback: ScanFeedback = { kind: 'device-conflict' };
          feedbackRef.current?.(feedback);
          return feedback;
        }
        case 'accepted': {
          commit(appendRecord(current, evaluation.record));
          const feedback: ScanFeedback = { kind: 'added', record: evaluation.record };
          feedbackRef.current?.(feedback);
          return feedback;
        }
      }
    },
    [commit],
  );

  const acceptPendingConflict = useCallback(() => {
    const current = sessionRef.current;
    if (current === null || pendingConflict === null) return;
    commit(appendConflictingRecord(current, pendingConflict.record));
    setPendingConflict(null);
  }, [commit, pendingConflict]);

  const dismissPendingConflict = useCallback(() => setPendingConflict(null), []);

  const updateRecord = useCallback(
    (
      recordId: string,
      patch: { fullName?: string; studentId?: string; academicYear?: string },
    ): EditResult => {
      const current = sessionRef.current;
      if (current === null) {
        return { ok: false, field: 'record', message: 'No session is open.' };
      }
      const outcome = editRecordInSession(current, recordId, patch);
      if (outcome === null) {
        return { ok: false, field: 'studentId', message: 'That change conflicts with an existing record.' };
      }
      commit(outcome.session);
      return outcome.result;
    },
    [commit],
  );

  const removeRecord = useCallback(
    (recordId: string) => {
      const current = sessionRef.current;
      if (current === null) return;
      commit({ ...current, records: current.records.filter((r) => r.id !== recordId), updatedAt: nowIso() });
    },
    [commit],
  );

  const discardSession = useCallback(() => {
    const current = sessionRef.current;
    if (current !== null) void deleteSession(current.id);
    sessionRef.current = null;
    setSession(null);
    setPendingConflict(null);
    void setActiveSessionId(null);
  }, []);

  const stats = useMemo(() => (session === null ? EMPTY_STATS : computeSessionStats(session)), [session]);
  const sharedDevices = useMemo(
    () => (session === null ? new Set<string>() : sharedDeviceIds(session)),
    [session],
  );

  const clearFeedback = useCallback(() => setPendingConflict(null), []);

  return {
    session,
    status,
    stats,
    pendingConflict,
    sharedDevices,
    start,
    handleScan,
    acceptPendingConflict,
    dismissPendingConflict,
    updateRecord,
    removeRecord,
    discardSession,
    clearFeedback,
  };
}