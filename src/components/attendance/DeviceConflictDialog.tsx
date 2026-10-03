/** Same-device conflict dialog: the teaching assistant decides, never the app. */

import { Dialog, Notice } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import type { AttendanceRecord } from '../../types/attendance'
import type { PendingConflict } from '../../state/useAttendanceSession'

export interface DeviceConflictDialogProps {
  readonly pending: PendingConflict | null;
  readonly onAccept: () => void;
  readonly onRemove: () => void;
  readonly onCancel: () => void;
}

function RecordLine({ record, tone }: { record: AttendanceRecord; tone: 'existing' | 'current' }) {
  return (
    <li className="aq-row aq-row--between aq-row--wrap aq-conflict__row">
      <span className="aq-row" style={{ gap: 'var(--s-3)' }}>
        <Icon
          name={tone === 'current' ? 'scan' : 'student'}
          size={16}
          style={{ color: tone === 'current' ? 'var(--warn)' : 'var(--ink-3)' }}
        />
        <span className="aq-stack aq-stack--sm" style={{ gap: 0 }}>
          <span style={{ fontWeight: 640, fontSize: 'var(--text-sm)' }}>{record.fullName}</span>
          <span className="aq-text-xs aq-text-muted aq-mono">{record.studentId}</span>
        </span>
      </span>
      <span className="aq-chip aq-chip--warn">{tone === 'current' ? 'New scan' : 'Already recorded'}</span>
    </li>
  )
}

export function DeviceConflictDialog({
  pending,
  onAccept,
  onRemove,
  onCancel,
}: DeviceConflictDialogProps) {
  return (
    <Dialog
      open={pending !== null}
      tone="warn"
      title="Multiple students detected from the same device"
      description="These QR codes carry the same Device ID. Nothing has been changed yet — choose what to record."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="aq-btn aq-btn--primary" onClick={onAccept}>
            <Icon name="check" size={16} />
            Accept both
          </button>
          <button type="button" className="aq-btn aq-btn--danger" onClick={onRemove}>
            <Icon name="x" size={16} />
            Remove the new scan
          </button>
          <button type="button" className="aq-btn aq-btn--ghost" onClick={onCancel}>
            Cancel and keep scanning
          </button>
        </>
      }
    >
      {pending === null ? null : (
        <>
          <ul className="aq-conflict__list">
            {pending.conflicts.map((record) => (
              <RecordLine key={record.id} record={record} tone="existing" />
            ))}
            <RecordLine record={pending.record} tone="current" />
          </ul>
          <Notice
            tone="warn"
            icon="shield"
            title="What this check means"
          >
            The Device ID identifies this browser installation, not a physical handset. It is a
            duplicate signal to review, not proof of impersonation — shared or reset browsers can
            produce the same value.
          </Notice>
        </>
      )}
    </Dialog>
  )
}