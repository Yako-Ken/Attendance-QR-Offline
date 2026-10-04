/**
 * Export panel.
 *
 * The workbook is built in the browser on demand — the XLSX code is dynamically
 * imported so a student who only ever shows a QR never downloads it. The exact
 * column list and the file name are both shown before export, because "what
 * will the university see, and what will it be called" are the two questions a
 * teaching assistant actually needs answered.
 */

import { useCallback, useMemo, useState } from 'react'
import type { AttendanceSession } from '../../types/attendance'
import type { ToastTone } from '../../types/app'
import { EXPORT_COLUMNS, FORBIDDEN_EXPORT_TOKENS } from '../../services/export/attendanceWorkbook'
import { attendanceFileNameWithTime } from '../../lib/util/filename'
import { sanitizeExportName } from '../../lib/util/exportName'
import { formatDateTime, localDateStamp } from '../../lib/util/time'
import { downloadWorkbook, shareOrDownload } from '../../services/export/deliver'
import { Field } from '../ui/primitives'
import { Icon } from '../ui/Icon'

export interface ExportPanelProps {
  readonly session: AttendanceSession;
  readonly onNotify: (tone: ToastTone, title: string, text?: string) => void;
}


export function ExportPanel({ session, onNotify }: ExportPanelProps) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  const generated = useMemo(() => {
    const created = new Date(session.createdAt);
    const stamp = localDateStamp(created);
    const time = created.toTimeString().slice(0, 5).replace(':', '');
    return attendanceFileNameWithTime(session.sectionName, stamp, time === '' ? '0000' : time);
  }, [session]);

  const [fileName, setFileName] = useState(generated);
  const [touched, setTouched] = useState(false);

  // Follow the section until the assistant edits the name themselves, after
  // which their choice wins for the rest of the session.
  const effectiveName = touched ? fileName : generated;
  const cleanName = sanitizeExportName(effectiveName);
  const invalid = cleanName === null;

  const build = useCallback(async (): Promise<Uint8Array> => {
    const { buildAttendanceWorkbook: build } = await import(
      '../../services/export/attendanceWorkbook'
    );
    return build(session, formatDateTime).bytes;
  }, [session]);

  const run = useCallback(
    async (mode: 'download' | 'share'): Promise<void> => {
      if (session.records.length === 0) {
        onNotify('warn', 'There is nothing to export yet', 'Record at least one student first.');
        return;
      }
      if (invalid) {
        onNotify('warn', 'The file name is not usable', 'Use letters, digits, or dashes.');
        return;
      }

      setBusy(mode);
      try {
        const bytes = await build();

        // Defence in depth: the unit tests assert this, and the guard catches a
        // regression before a file leaves the device.
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        const leaked = FORBIDDEN_EXPORT_TOKENS.find((token) => decoded.includes(token));
        if (leaked !== undefined) {
          onNotify(
            'danger',
            'The export was blocked',
            'Internal detection fields must never appear in the workbook.',
          );
          return;
        }

        if (mode === 'share') {
          const { createWorkbookBlob } = await import('../../services/export/deliver');
          const result = await shareOrDownload(
            createWorkbookBlob(bytes),
            cleanName,
            `Attendance ${session.sectionName}`,
          );
          if (!result.ok) {
            onNotify(
              'warn',
              result.reason === 'cancelled' ? 'Sharing was cancelled' : 'Sharing was not available',
              result.reason === 'cancelled' ? undefined : 'The file was downloaded instead.',
            );
            return;
          }
          onNotify(
            'ok',
            result.method === 'share' ? 'Workbook shared' : 'Sharing unavailable — file downloaded',
            result.method === 'share' ? undefined : 'This device cannot share files directly.',
          );
          return;
        }

        const result = downloadWorkbook(bytes, cleanName);
        if (!result.ok) {
          onNotify('danger', 'The Excel file could not be saved', result.reason);
          return;
        }
        onNotify(
          'ok',
          'Excel file saved',
          `${session.records.length} student${session.records.length === 1 ? '' : 's'} written to ${cleanName}`,
        );
      } catch {
        onNotify(
          'danger',
          'The Excel file could not be generated',
          'Your attendance session is still saved locally.',
        );
      } finally {
        setBusy(null);
      }
    },
    [build, cleanName, invalid, onNotify, session.records.length, session.sectionName],
  );

  return (
    <div className="aq-export">
      <Field
        label="File name · اسم الملف"
        error={invalid ? 'This name is empty once the characters your system forbids are removed.' : undefined}
        hint="Saved exactly as written, minus characters Windows and macOS reject."
      >
        {({ id, describedBy, invalid: fieldInvalid }) => (
          <input
            id={id}
            className="aq-input aq-filename-input"
            type="text"
            value={effectiveName}
            onChange={(event) => {
              setTouched(true);
              setFileName(event.target.value);
            }}
            aria-describedby={describedBy}
            aria-invalid={fieldInvalid}
            spellCheck={false}
            dir="ltr"
          />
        )}
      </Field>

      <div>
        <p className="aq-label">Worksheet columns</p>
        <div className="aq-columns">
          {EXPORT_COLUMNS.map((column) => (
            <span className="aq-column" key={column}>
              {column}
            </span>
          ))}
        </div>
        <p className="aq-text-xs aq-text-muted" style={{ marginTop: 'var(--s-2)' }}>
          The Device ID and the duplicate flag are used inside the app only. They are never written to
          the file.
        </p>
      </div>

      <div className="aq-row" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="aq-btn aq-btn--primary"
          onClick={() => void run('download')}
          disabled={busy !== null}
          style={{ flex: '1 1 12rem' }}
        >
          {busy === 'download' ? <span className="aq-btn__spinner" aria-hidden="true" /> : null}
          <Icon name="download" size={17} />
          Download Excel
        </button>
        <button
          type="button"
          className="aq-btn"
          onClick={() => void run('share')}
          disabled={busy !== null}
          style={{ flex: '1 1 12rem' }}
        >
          {busy === 'share' ? <span className="aq-btn__spinner" aria-hidden="true" /> : null}
          <Icon name="share" size={17} />
          Share Excel
        </button>
      </div>

      <p className="aq-text-xs aq-text-muted">
        If this device cannot share files, <strong>Share</strong> saves the file instead — the app
        detects that automatically.
      </p>
    </div>
  );
}
