/**
 * Export panel.
 *
 * The workbook is built in the browser on demand — the XLSX code is dynamically
 * imported so a student who only ever shows a QR never downloads it. The exact
 * column list is shown before export, because "what will the university see" is
 * the question a teaching assistant actually needs answered.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ToastTone } from '../../types/app'
import type { AttendanceSession } from '../../types/attendance'
import {
  EXPORT_COLUMNS,
  FORBIDDEN_EXPORT_TOKENS,
} from '../../services/export/attendanceWorkbook'
import { attendanceFileNameWithTime, attendanceFileName } from '../../lib/util/filename'
import { formatDateTime, localDateStamp } from '../../lib/util/time'
import { downloadWorkbook, shareOrDownload } from '../../services/export/deliver'
import { Icon } from '../ui/Icon'

export interface ExportPanelProps {
  readonly session: AttendanceSession;
  readonly onNotify: (tone: ToastTone, title: string, text?: string) => void;
}



export function ExportPanel({ session, onNotify }: ExportPanelProps) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  const fileName = useMemo(() => {
    const stamp = localDateStamp(new Date(session.createdAt));
    const time = new Date(session.createdAt).toTimeString().slice(0, 5).replace(':', '');
    return attendanceFileNameWithTime(session.sectionName, stamp, time || '0000');
  }, [session]);

  const fallbackName = useMemo(
    () => attendanceFileName(session.sectionName, localDateStamp(new Date(session.createdAt))),
    [session],
  );

  const build = useCallback(async (): Promise<Uint8Array> => {
    const { buildAttendanceWorkbook } = await import('../../services/export/attendanceWorkbook');
    return buildAttendanceWorkbook(session, formatDateTime).bytes;
  }, [session]);

  const run = useCallback(
    async (mode: 'download' | 'share'): Promise<void> => {
      if (session.records.length === 0) {
        onNotify('warn', 'There is nothing to export yet', 'Record at least one student first.');
        return;
      }
      setBusy(mode);
      try {
        const bytes = await build();
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        const leaked = FORBIDDEN_EXPORT_TOKENS.find((token) => text.includes(token));
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
            fileName === '' ? fallbackName : fileName,
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

        const result = downloadWorkbook(bytes, fileName === '' ? fallbackName : fileName);
        if (!result.ok) {
          onNotify('danger', 'The Excel file could not be saved', result.reason);
          return;
        }
        onNotify(
          'ok',
          'Excel file saved',
          `${session.records.length} student${session.records.length === 1 ? '' : 's'} written.`,
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
    [build, fallbackName, fileName, onNotify, session.records.length, session.sectionName],
  );

  return (
    <div className="aq-export">
      <div className="aq-filename">
        <Icon name="download" size={15} />
        <span className="aq-mono">{fileName === '' ? fallbackName : fileName}</span>
      </div>

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
  )
}