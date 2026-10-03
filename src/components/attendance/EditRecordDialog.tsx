/**
 * Record editing.
 *
 * The same validation the student form uses applies here, and a Student ID that
 * collides with another record in the session is refused with a message naming
 * the clash — never silently accepted.
 */

import { useState, type FormEvent } from 'react'
import type { AttendanceRecord, EditResult } from '../../types/attendance'
import { formatDateTime } from '../../lib/util/time'
import { Dialog, Field, Notice } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import type { StudentFieldErrors } from '../../lib/validation/student'

export interface EditRecordDialogProps {
  readonly record: AttendanceRecord | null;
  readonly onSubmit: (
    recordId: string,
    patch: { fullName?: string; studentId?: string; academicYear?: string },
  ) => EditResult;
  readonly onClose: () => void;
}

export function EditRecordDialog({ record, onSubmit, onClose }: EditRecordDialogProps) {
  return (
    <Dialog
      open={record !== null}
      title="Edit attendance record"
      description="Corrections are validated the same way the student's own form is, and student IDs keep their leading zeros."
      onClose={onClose}
      footer={
        <>
          <button type="submit" form="aq-edit-record" className="aq-btn aq-btn--primary">
            <Icon name="check" size={16} />
            Save changes
          </button>
          <button type="button" className="aq-btn aq-btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {/*
        Keying on the record id resets the fields from the selected record
        without an effect that writes state after render.
      */}
      <RecordEditForm
        key={record?.id ?? 'none'}
        record={record}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Dialog>
  );
}

interface RecordEditFormProps {
  readonly record: AttendanceRecord | null;
  readonly onSubmit: EditRecordDialogProps['onSubmit'];
  readonly onClose: () => void;
}

function RecordEditForm({ record, onSubmit, onClose }: RecordEditFormProps) {
  const [fullName, setFullName] = useState(record?.fullName ?? '');
  const [studentId, setStudentId] = useState(record?.studentId ?? '');
  const [academicYear, setAcademicYear] = useState(record?.academicYear ?? '1');
  const [fieldErrors, setFieldErrors] = useState<StudentFieldErrors | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (record === null) return;
    const result = onSubmit(record.id, { fullName, studentId, academicYear });
    if (result.ok) {
      onClose();
      return;
    }
    if (result.field === 'fullName' || result.field === 'studentId' || result.field === 'academicYear') {
      setFieldErrors({ [result.field]: result.message });
      return;
    }
    setFormError(result.message);
  };

  return (
    <form id="aq-edit-record" onSubmit={submit} className="aq-stack" noValidate>
      {formError !== null ? (
        <Notice tone="danger" icon="alertCircle">
          {formError}
        </Notice>
      ) : null}

      <Field label="Full name · الاسم بالكامل" error={fieldErrors?.fullName} required>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="aq-input"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            autoComplete="off"
            dir="auto"
          />
        )}
      </Field>

      <Field
        label="Student ID · الرقم الجامعي"
        error={fieldErrors?.studentId}
        hint="Digits only; leading zeros are preserved."
        required
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="aq-input aq-input--mono"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            dir="ltr"
          />
        )}
      </Field>

      <Field
        label="Academic year · الفرقة"
        error={fieldErrors?.academicYear}
        hint="A single digit from 1 to 7."
        required
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="aq-input aq-input--mono aq-input--year"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={2}
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder="3"
            dir="ltr"
          />
        )}
      </Field>

      {record !== null ? (
        <p className="aq-text-xs aq-text-muted">
          Originally recorded at {formatDateTime(record.scannedAt)}.
        </p>
      ) : null}
    </form>
  );
}