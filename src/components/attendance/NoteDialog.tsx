/**
 * Attendance note.
 *
 * Shown as a dialog when the assistant has opted into a prompt after every
 * recorded scan, and reachable from the note button on any record when the
 * prompt is off. The dialog is the single place a note is written, so the two
 * entry points behave identically.
 */

import { useState, type FormEvent } from 'react'
import type { AttendanceRecord } from '../../types/attendance'
import { NOTE_MAX, normalizeNote } from '../../lib/attendance/engine'
import { Dialog, Field, Notice } from '../ui/primitives'
import { Icon } from '../ui/Icon'

export interface NoteDialogProps {
  readonly record: AttendanceRecord | null;
  /** True when opened by the post-scan prompt rather than by the note button. */
  readonly prompted: boolean;
  readonly onSave: (recordId: string, note: string) => void;
  readonly onClose: () => void;
}

export function NoteDialog({ record, prompted, onSave, onClose }: NoteDialogProps) {
  const [value, setValue] = useState('');
  const [seed, setSeed] = useState<string | null>(null);

  // Seed the field when a different record is opened. Comparing against the
  // previous id is the React-idiomatic way to reset state on a prop change.
  if (record !== null && seed !== record.id) {
    setSeed(record.id);
    setValue(record.note);
  }

  const trimmed = normalizeNote(value);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (record === null) return;
    onSave(record.id, trimmed);
  };

  return (
    <Dialog
      open={record !== null}
      title={prompted ? 'Add a note' : 'Edit note'}
      description={
        record === null
          ? undefined
          : `${record.fullName} · ${record.studentId} — recorded at year ${record.academicYear}`
      }
      onClose={onClose}
      footer={
        <>
          <button type="submit" form="aq-note-form" className="aq-btn aq-btn--primary">
            <Icon name="check" size={16} />
            Save note
          </button>
          <button type="button" className="aq-btn aq-btn--ghost" onClick={onClose}>
            {prompted ? 'Skip' : 'Cancel'}
          </button>
        </>
      }
    >
      <form id="aq-note-form" onSubmit={submit} className="aq-stack" noValidate>
        <Field
          label={`Note · ملاحظة (${NOTE_MAX} characters max)`}
          hint="For example a mark, a late arrival, or a warning. Saved with this student and exported to the worksheet."
        >
          {({ id, describedBy }) => (
            <textarea
              id={id}
              className="aq-input aq-textarea"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-describedby={describedBy}
              rows={4}
              maxLength={NOTE_MAX}
              autoFocus
              placeholder="Scored 18/20 in the quiz"
              dir="auto"
            />
          )}
        </Field>

        {trimmed !== value.trim() ? (
          <p className="aq-field__hint">
            {value.length > NOTE_MAX
              ? `Notes are limited to ${NOTE_MAX} characters; the rest will be dropped.`
              : 'Extra spaces and line breaks are removed when the note is saved.'}
          </p>
        ) : null}

        {prompted ? (
          <Notice tone="default" icon="info">
            The student is already recorded. Skipping this dialog simply leaves the note empty.
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}