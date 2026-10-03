/**
 * Student setup and pass.
 *
 * Designed mobile-first: one column, 44px targets, a native select for the
 * academic year (the platform picker is both faster and more accessible than a
 * custom list on a phone), and the QR pass sized to the viewport.
 */

import { useState, type FormEvent } from 'react'
import {
  draftFromProfile,
  useStudentProfile,
} from '../../state/useStudentProfile'
import { StudentQrCard } from '../qr/StudentQrCard'
import { Field, Notice } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import type { StudentDraft, StudentFieldErrors } from '../../lib/validation/student'

export interface StudentModeProps {
  readonly deviceId: string;
}

export function StudentMode({ deviceId }: StudentModeProps) {
  const { profile, status, save } = useStudentProfile();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<StudentFieldErrors | null>(null);

  if (status === 'loading') {
    return <div className="aq-stack" aria-busy="true" />;
  }

  if (profile === null || editing) {
    return (
      <StudentForm
        // Remounting on the profile id resets the form from the saved values
        // without an effect that writes state after render.
        key={profile === null ? 'new' : profile.id}
        initial={draftFromProfile(profile)}
        errors={errors}
        onSubmit={(nextDraft) => {
          const result = save(nextDraft);
          setErrors(result);
          if (result === null) setEditing(false);
        }}
        onCancel={editing && profile !== null ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <div className="aq-student-layout">
      <div className="aq-stack">
        <StudentQrCard
          profile={profile}
          deviceId={deviceId}
          onEdit={() => {
            setErrors(null);
            setEditing(true);
          }}
        />
      </div>
      <aside className="aq-card">
        <div className="aq-card__head">
          <span className="aq-card__title">On this device</span>
        </div>
        <div className="aq-card__body aq-stack">
          <div className="aq-kv">
            <span className="aq-kv__k">Device ID</span>
            <span className="aq-mono aq-text-xs" style={{ overflowWrap: 'anywhere' }}>
              {deviceId === '' ? 'Generating…' : deviceId}
            </span>
          </div>
          <p className="aq-text-xs aq-text-muted">
            Embedded in your QR code so a teaching assistant can spot two records that came from the
            same browser installation. It is not a hardware address, and it does not identify a
            physical handset with certainty.
          </p>
          <p className="aq-text-xs aq-text-muted">
            Nothing here is uploaded. The app keeps working with no internet connection.
          </p>
        </div>
      </aside>
    </div>
  );
}

interface StudentFormProps {
  readonly initial: StudentDraft;
  readonly errors: StudentFieldErrors | null;
  readonly onSubmit: (draft: StudentDraft) => void;
  readonly onCancel?: () => void;
}

function StudentForm({ initial, errors, onSubmit, onCancel }: StudentFormProps) {
  const [draft, setDraft] = useState<StudentDraft>(initial);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit(draft);
  };

  const update = (patch: Partial<StudentDraft>): void => {
    setDraft({ ...draft, ...patch });
  };

  return (
    <form className="aq-stack aq-stack--lg aq-form" onSubmit={submit} noValidate>
      <header className="aq-pagehead">
        <h1 className="aq-pagehead__title">Student pass · بطاقة الطالب</h1>
        <p className="aq-pagehead__lead">
          Enter your details once. They stay on this device and are shown as a QR code that a
          teaching assistant scans to record your attendance.
        </p>
      </header>

      <div className="aq-card">
        <div className="aq-card__body aq-stack">
          <Field label="Full name · الاسم بالكامل" error={errors?.fullName} required>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="aq-input aq-input--lg"
                type="text"
                value={draft.fullName}
                onChange={(event) => update({ fullName: event.target.value })}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                autoComplete="name"
                enterKeyHint="next"
                dir="auto"
                placeholder="Ahmed Mohamed Ali · أحمد محمد علي"
              />
            )}
          </Field>

          <Field
            label="Student ID · الرقم الجامعي"
            error={errors?.studentId}
            hint="Digits only. Leading zeros are kept exactly as you type them."
            required
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="aq-input aq-input--lg aq-input--mono"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={draft.studentId}
                onChange={(event) => update({ studentId: event.target.value })}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                enterKeyHint="next"
                placeholder="001234"
                dir="ltr"
              />
            )}
          </Field>

          <Field
            label="Academic year · الفرقة"
            error={errors?.academicYear}
            hint="A single digit from 1 to 7."
            required
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="aq-input aq-input--lg aq-input--mono aq-input--year"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={2}
                value={draft.academicYear}
                onChange={(event) => update({ academicYear: event.target.value })}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                enterKeyHint="done"
                placeholder="3"
                dir="ltr"
              />
            )}
          </Field>
        </div>

        <div className="aq-card__foot aq-stack aq-stack--sm">
          <button type="submit" className="aq-btn aq-btn--primary aq-btn--lg aq-btn--block">
            <Icon name="check" size={18} />
            Save and show my QR
          </button>
          {onCancel !== undefined ? (
            <button type="button" className="aq-btn aq-btn--ghost aq-btn--block" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <Notice tone="default" icon="lock">
        Your name, student ID, and QR code are stored only on this device. Nothing is uploaded, and
        the app keeps working with no internet connection.
      </Notice>
    </form>
  );
}