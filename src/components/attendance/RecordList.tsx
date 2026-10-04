/**
 * Attendance records: a compact ledger rail on small screens, a real table from
 * 64rem. Both carry the same fields and the same actions, so nothing is hidden
 * on a phone and nothing requires horizontal scrolling on a laptop.
 */

import type { AttendanceRecord } from '../../types/attendance'
import { formatClock, formatDateTime } from '../../lib/util/time'
import { Icon } from '../ui/Icon'

export interface RecordListProps {
  readonly records: readonly AttendanceRecord[];
  readonly sharedDevices: ReadonlySet<string>;
  readonly dense?: boolean;
  readonly onEdit: (record: AttendanceRecord) => void;
  readonly onRemove: (record: AttendanceRecord) => void;
  readonly onNote: (record: AttendanceRecord) => void;
}

function flagged(record: AttendanceRecord, shared: ReadonlySet<string>): boolean {
  return record.duplicateDeviceFlag || shared.has(record.deviceId.toLowerCase());
}

export function DeviceWarningChip() {
  return (
    <span className="aq-status aq-status--warn">
      <Icon name="alert" size={12} />
      Same device
    </span>
  );
}

export function NoteChip({ note }: { note: string }) {
  if (note === '') return null;
  return (
    <span className="aq-note-chip" title={note}>
      <Icon name="note" size={12} />
      <span className="aq-visually-nowrap">{note}</span>
    </span>
  );
}

interface ActionsProps {
  readonly record: AttendanceRecord;
  readonly onEdit: (record: AttendanceRecord) => void;
  readonly onRemove: (record: AttendanceRecord) => void;
  readonly onNote: (record: AttendanceRecord) => void;
}

function ActionButtons({ record, onEdit, onRemove, onNote }: ActionsProps) {
  return (
    <div className="aq-ledger__actions">
      <button
        type="button"
        className="aq-iconbtn"
        style={{ width: '2.25rem', height: '2.25rem' }}
        onClick={() => onNote(record)}
        aria-label={`Add a note for ${record.fullName}`}
        title={record.note === '' ? 'Add a note' : record.note}
      >
        <Icon name="note" size={15} />
      </button>
      <button
        type="button"
        className="aq-iconbtn"
        style={{ width: '2.25rem', height: '2.25rem' }}
        onClick={() => onEdit(record)}
        aria-label={`Edit ${record.fullName}`}
      >
        <Icon name="edit" size={15} />
      </button>
      <button
        type="button"
        className="aq-iconbtn aq-iconbtn--danger"
        style={{ width: '2.25rem', height: '2.25rem' }}
        onClick={() => onRemove(record)}
        aria-label={`Remove ${record.fullName} from this session`}
      >
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile ledger rail                                                         */
/* -------------------------------------------------------------------------- */

export function RecordLedger({
  records,
  sharedDevices,
  dense = false,
  onEdit,
  onRemove,
  onNote,
}: RecordListProps) {
  const visible = dense ? records.slice(0, 12) : records;
  return (
    <div className="aq-ledger">
      {visible.map((record, index) => (
        <div className="aq-ledger__item" key={record.id}>
          <span className="aq-ledger__num">{index + 1}</span>
          <div className="aq-ledger__body">
            <span className="aq-ledger__name">{record.fullName}</span>
            <span className="aq-ledger__meta">
              <span className="aq-mono">{record.studentId}</span>
              <span aria-hidden="true">·</span>
              <span>Year {record.academicYear}</span>
              <span aria-hidden="true">·</span>
              <span className="aq-num">{formatClock(record.scannedAt)}</span>
              {flagged(record, sharedDevices) ? <DeviceWarningChip /> : null}
            </span>
            <NoteChip note={record.note} />
          </div>
          <ActionButtons record={record} onEdit={onEdit} onRemove={onRemove} onNote={onNote} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile record cards                                                        */
/* -------------------------------------------------------------------------- */

export function RecordCards({
  records,
  sharedDevices,
  onEdit,
  onRemove,
  onNote,
}: RecordListProps) {
  return (
    <div className="aq-records">
      {records.map((record, index) => (
        <div className="aq-record" key={record.id}>
          <span className="aq-ledger__num">{index + 1}</span>
          <div className="aq-record__body">
            <span className="aq-record__name">{record.fullName}</span>
            <span className="aq-record__meta">
              <span className="aq-mono">{record.studentId}</span>
              <span aria-hidden="true">·</span>
              <span>Year {record.academicYear}</span>
              <span aria-hidden="true">·</span>
              <span className="aq-num">{formatClock(record.scannedAt)}</span>
              {flagged(record, sharedDevices) ? <DeviceWarningChip /> : null}
            </span>
            <NoteChip note={record.note} />
          </div>
          <ActionButtons record={record} onEdit={onEdit} onRemove={onRemove} onNote={onNote} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop table                                                              */
/* -------------------------------------------------------------------------- */

export function RecordTable({ records, sharedDevices, onEdit, onRemove, onNote }: RecordListProps) {
  return (
    <div className="aq-table-wrap">
      <table className="aq-table">
        <caption className="aq-sr">
          Attendance records for this session. Columns: number, full name, student ID, academic
          year, the time the scan was recorded, and any note.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="aq-table__index">
              #
            </th>
            <th scope="col">Full Name</th>
            <th scope="col">Student ID</th>
            <th scope="col">Academic Year</th>
            <th scope="col">Recorded At</th>
            <th scope="col">Note</th>
            <th scope="col" className="aq-table__actions">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id}>
              <td className="aq-table__index">{index + 1}</td>
              <td className="aq-table__name">
                <span className="aq-row" style={{ gap: 'var(--s-2)' }}>
                  <span>{record.fullName}</span>
                  {flagged(record, sharedDevices) ? <DeviceWarningChip /> : null}
                </span>
              </td>
              <td className="aq-table__id">{record.studentId}</td>
              <td className="aq-num">{record.academicYear}</td>
              <td className="aq-num">{formatDateTime(record.scannedAt)}</td>
              <td className="aq-table__note">{record.note === '' ? '—' : record.note}</td>
              <td className="aq-table__actions">
                <ActionButtons record={record} onEdit={onEdit} onRemove={onRemove} onNote={onNote} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}