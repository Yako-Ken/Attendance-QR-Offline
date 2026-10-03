import { useCallback, useEffect, useState } from 'react'
import type { AcademicYear, StudentProfile } from '../types/student'
import { isAcademicYear } from '../types/student'
import { nowIso } from '../lib/util/time'
import { randomUuid } from '../lib/util/uuid'
import {
  validateStudentDraft,
  type StudentDraft,
  type StudentFieldErrors,
} from '../lib/validation/student'
import { loadProfile, saveProfile } from '../services/storage/repository'

export interface ProfileController {
  readonly profile: StudentProfile | null;
  readonly status: 'loading' | 'ready';
  readonly save: (draft: StudentDraft) => StudentFieldErrors | null;
}

/**
 * Owns the editable student profile.
 *
 * The Device ID lives elsewhere by design: it identifies this browser
 * installation and must survive every edit the student makes to their name,
 * student ID, or year.
 */
export function useStudentProfile(): ProfileController {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let active = true;
    void loadProfile().then((stored) => {
      if (!active) return;
      setProfile(stored ?? null);
      setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback<ProfileController['save']>(
    (draft) => {
      const result = validateStudentDraft(draft);
      if (!result.ok) return result.errors;

      const previous = profile;
      const next: StudentProfile = {
        id: previous?.id ?? randomUuid(),
        fullName: result.value.fullName,
        studentId: result.value.studentId,
        academicYear: result.value.academicYear satisfies AcademicYear,
        createdAt: previous?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      };

      setProfile(next);
      void saveProfile(next);
      return null;
    },
    [profile],
  );

  return { profile, status, save };
}

export function draftFromProfile(profile: StudentProfile | null): StudentDraft {
  return {
    fullName: profile?.fullName ?? '',
    studentId: profile?.studentId ?? '',
    academicYear: profile?.academicYear ?? '',
  }
}

export { isAcademicYear };