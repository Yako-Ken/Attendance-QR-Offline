/**
 * Attendance mode: section setup, live scanning, and review/export.
 *
 * The live screen is a single continuous surface — scanner on the left,
 * the running ledger on the right from 68rem, the last scan and the running
 * count always in view — so a teaching assistant never navigates away between
 * students.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AttendanceRecord } from '../../types/attendance'
import type { AttendanceQrPayload } from '../../types/qr'
import { useAttendanceSession } from '../../state/useAttendanceSession'
import { useScanner } from '../../state/useScanner'
import { ScannerView } from '../scanner/ScannerView'
import { DeviceConflictDialog } from './DeviceConflictDialog'
import { NoteDialog } from './NoteDialog'
import { EditRecordDialog } from './EditRecordDialog'
import { RecordCards, RecordLedger, RecordTable } from './RecordList'
import { ExportPanel } from '../export/ExportPanel'
import { Dialog, EmptyState, Field, Metric, Notice } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import { SECTION_MAX, validateSectionName } from '../../lib/validation/student'
import { formatClock, formatDateTime } from '../../lib/util/time'
import { pulse } from '../../services/export/deliver'
import { useMediaQuery } from '../../state/useMediaQuery'
import type { AppSettings, ToastTone } from '../../types/app'

export type AttendanceStage = 'setup' | 'live' | 'review';

export interface AttendanceModeProps {
  readonly settings: AppSettings;
  readonly haptics: boolean;
  readonly onNotify: (tone: ToastTone, title: string, text?: string) => void;
  readonly initialStage: AttendanceStage;
  readonly onStageChange: (stage: AttendanceStage) => void;
}

export function AttendanceMode({
  settings,
  haptics,
  onNotify,
  initialStage,
  onStageChange,
}: AttendanceModeProps) {
  const controller = useAttendanceSession();
  const { session } = controller;
  const notePromptOnScan = settings.notePromptOnScan;

  const [stage, setStage] = useState<AttendanceStage>(() =>
    session === null ? 'setup' : initialStage,
  );
  const [sectionName, setSectionName] = useState('');
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [hitToken, setHitToken] = useState(0);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [removing, setRemoving] = useState<AttendanceRecord | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [noteTarget, setNoteTarget] = useState<AttendanceRecord | null>(null);
  const [notePrompted, setNotePrompted] = useState(false);

  const isWide = useMediaQuery('(min-width: 68rem)');
  const scannerActive = stage === 'live';

  useEffect(() => {
    if (session !== null && stage === 'setup') {
      setStage(initialStage === 'setup' ? 'live' : initialStage);
    }
    // Only reacts when a session appears after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const notify = useCallback(
    (tone: ToastTone, title: string, text?: string) => {
      if (haptics) pulse(tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : 'error');
      onNotify(tone, title, text);
    },
    [haptics, onNotify],
  );

  /**
   * Queue the note dialog.
   *
   * `prompted` marks the post-scan entry point, which offers "Skip" rather than
   * "Cancel" because by that point the student is already recorded.
   */
  const openNote = useCallback((record: AttendanceRecord, prompted = false) => {
    setNoteTarget(record);
    setNotePrompted(prompted);
  }, []);

  const handleOutcome = useCallback(
    (outcome: { kind: 'accepted'; payload: AttendanceQrPayload } | { kind: 'rejected'; message: string }) => {
      if (outcome.kind === 'rejected') {
        setLastScan({ text: outcome.message, tone: 'warn' });
        notify('warn', 'Not a student QR code', outcome.message);
        return;
      }
      const feedback = controller.handleScan(outcome.payload);
      setHitToken((value) => value + 1);

      switch (feedback.kind) {
        case 'added':
          setLastScan({
            text: `${feedback.record.fullName} · ${feedback.record.studentId}`,
            tone: 'ok',
          });
          notify('ok', 'Recorded', `${feedback.record.fullName} — year ${feedback.record.academicYear}`);
          if (notePromptOnScan) openNote(feedback.record, true);
          break;
        case 'duplicate':
          setLastScan({
            text: `${feedback.record.fullName} · already recorded at ${formatClock(feedback.record.scannedAt)}`,
            tone: 'warn',
          });
          notify('warn', 'This student has already been recorded', `${feedback.record.fullName} · ${feedback.record.studentId}`);
          break;
        case 'device-conflict':
          setLastScan({ text: 'Same device as an earlier student — waiting for your decision', tone: 'warn' });
          break;
        case 'invalid':
          notify('danger', 'Scan not recorded', feedback.message);
          break;
      }
    },
    [controller, notePromptOnScan, notify, openNote],
  );

  const scanner = useScanner(scannerActive, settings.keepAwake, handleOutcome);

  /**
   * Decoding is suspended whenever a dialog is on screen, so a student cannot be
   * recorded behind an open decision. The camera preview stays live, which keeps
   * the assistant's context intact.
   */
  const blocked = noteTarget !== null || controller.pendingConflict !== null;
  useEffect(() => {
    scanner.setPaused(blocked);
  }, [blocked, scanner]);

  const stats = controller.stats;
  const metrics = useMemo(
    () => [
      { value: stats.total, label: 'Students' },
      { value: stats.deviceAlerts, label: 'Device alerts', alert: true },
      { value: stats.duplicateAttempts, label: 'Duplicate scans', alert: true },
      {
        value: session === null ? 0 : session.records.filter((r) => r.academicYear !== '').length,
        label: 'Years captured',
      },
    ],
    [session, stats],
  );

  const begin = (): void => {
    const error = validateSectionName(sectionName);
    setSectionError(error);
    if (error !== null) return;
    controller.start(sectionName);
    setStage('live');
    onStageChange('live');
  };

  const goReview = (): void => {
    setStage('review');
    onStageChange('review');
  };

  const backToLive = (): void => {
    setStage('live');
    onStageChange('live');
  };

  if (session === null || stage === 'setup') {
    return (
      <SectionSetup
        sectionName={sectionName}
        error={sectionError}
        hasStoredSession={session !== null}
        onChange={setSectionName}
        onSubmit={begin}
        onResume={
          session === null
            ? undefined
            : () => {
                setStage('live');
                onStageChange('live');
              }
        }
        onDiscard={session === null ? undefined : () => setDiscarding(true)}
      />
    );
  }

  return (
    <div className="aq-stack aq-stack--lg">
      <SessionHeader
        sectionName={session.sectionName}
        createdAt={session.createdAt}
        count={stats.total}
        stage={stage}
        onBack={stage === 'review' ? backToLive : undefined}
        onReview={goReview}
        onNewSession={() => setDiscarding(true)}
      />

      <div className="aq-metrics">
        {metrics.map((metric) => (
          <Metric
            key={metric.label}
            value={metric.value}
            label={metric.label}
            alert={metric.alert === true}
          />
        ))}
      </div>

      {stats.deviceAlerts > 0 ? (
        <Notice tone="warn" icon="shield" title="Device alerts">
          {stats.deviceAlerts} device{stats.deviceAlerts === 1 ? '' : 's'} appear{stats.deviceAlerts === 1 ? 's' : ''} on more than one
          record in this session. Review the highlighted rows before exporting.
        </Notice>
      ) : null}

      {stage === 'live' ? (
        <div className="aq-split">
          <div className="aq-split__main">
            <ScannerView
              controller={scanner}
              hint="Hold the student's phone so its QR code sits inside the frame."
              hitToken={hitToken}
              tall={!isWide}
            />

            {lastScan !== null ? (
              <div
                className={`aq-lastscan${lastScan.tone === 'warn' ? ' aq-lastscan--warn' : ''}`}
                role="status"
              >
                <Icon
                  name={lastScan.tone === 'ok' ? 'checkCircle' : 'alert'}
                  size={20}
                  className="aq-lastscan__icon"
                />
                <div className="aq-lastscan__body">
                  <p className="aq-lastscan__title">
                    {lastScan.tone === 'ok' ? 'Recorded' : 'Attention'}
                  </p>
                  <p className="aq-lastscan__text">{lastScan.text}</p>
                </div>
              </div>
            ) : null}

            <div className="aq-row aq-row--wrap">
              <button
                type="button"
                className="aq-btn aq-btn--quiet"
                onClick={goReview}
                style={{ flex: '1 1 auto' }}
              >
                <Icon name="search" size={16} />
                Review {stats.total} record{stats.total === 1 ? '' : 's'}
              </button>
              {scanner.status === 'running' ? (
                <button type="button" className="aq-btn" onClick={scanner.stop}>
                  <Icon name="stop" size={16} />
                  Stop scanner
                </button>
              ) : null}
            </div>
          </div>

          <aside className="aq-split__side">
            <div className="aq-card">
              <div className="aq-card__head">
                <span className="aq-card__title">Recent scans</span>
                <span className="aq-chip aq-num">{stats.total}</span>
              </div>
              <div className="aq-card__body aq-card__body--tight">
                {stats.total === 0 ? (
                  <EmptyState icon="users" title="No students yet">
                    Start the scanner and point it at a student's QR pass.
                  </EmptyState>
                ) : (
                  <RecordLedger
                    records={stats.total > 12 ? session.records.slice(-12).reverse() : session.records}
                    sharedDevices={controller.sharedDevices}
                    onEdit={setEditing}
                    onRemove={setRemoving}
                    onNote={(record) => openNote(record, false)}
                  />
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <ReviewPanel
          controller={controller}
          onBack={backToLive}
          onEdit={setEditing}
          onRemove={setRemoving}
          onNote={(record) => openNote(record, false)}
          onNotify={notify}
          wide={isWide}
        />
      )}

      <DeviceConflictDialog
        pending={controller.pendingConflict}
        onAccept={() => {
          const pending = controller.pendingConflict;
          controller.acceptPendingConflict();
          if (pending !== null) {
            notify(
              'warn',
              'Both records kept',
              `${pending.record.fullName} shares a Device ID with an earlier record.`,
            );
            setLastScan({ text: `${pending.record.fullName} · recorded with a device alert`, tone: 'warn' });
          }
        }}
        onRemove={() => {
          const pending = controller.pendingConflict;
          controller.dismissPendingConflict();
          if (pending !== null) {
            notify('warn', 'Scan discarded', `${pending.record.fullName} was not recorded.`);
            setLastScan({ text: 'Same-device scan discarded — attendance unchanged', tone: 'warn' });
          }
        }}
        onCancel={() => {
          controller.dismissPendingConflict();
          notify('info', 'Nothing was changed', 'Existing attendance is untouched.');
        }}
      />

      <EditRecordDialog
        record={editing}
        onSubmit={controller.updateRecord}
        onClose={() => setEditing(null)}
      />

      <NoteDialog
        record={noteTarget}
        prompted={notePrompted}
        onSave={(recordId, note) => {
          controller.setNote(recordId, note);
          setNoteTarget(null);
        }}
        onClose={() => setNoteTarget(null)}
      />

      <Dialog
        open={removing !== null}
        title="Remove this attendance record?"
        description={removing === null ? undefined : `${removing.fullName} · ${removing.studentId}`}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <button
              type="button"
              className="aq-btn aq-btn--danger"
              onClick={() => {
                if (removing !== null) {
                  controller.removeRecord(removing.id);
                  setRemoving(null);
                  notify('warn', 'Record removed', 'The session has been updated.');
                }
              }}
            >
              <Icon name="trash" size={16} />
              Remove
            </button>
            <button type="button" className="aq-btn aq-btn--ghost" onClick={() => setRemoving(null)}>
              Keep
            </button>
          </>
        }
      >
        <p className="aq-text-sm aq-text-muted">
          This only affects the current session on this device. The exported file is not affected
          until you export again.
        </p>
      </Dialog>

      <Dialog
        open={discarding}
        title="Finish this session and start a new one?"
        description={session === null ? undefined : session.sectionName}
        onClose={() => setDiscarding(false)}
        footer={
          <>
            <button
              type="button"
              className="aq-btn aq-btn--danger"
              onClick={() => {
                controller.discardSession();
                setDiscarding(false);
                setStage('setup');
                onStageChange('setup');
                setSectionName('');
                notify('info', 'Session discarded', 'Export it first if you still need it.');
              }}
            >
              Discard session
            </button>
            <button type="button" className="aq-btn aq-btn--ghost" onClick={() => setDiscarding(false)}>
              Keep it open
            </button>
          </>
        }
      >
        <Notice tone="warn" icon="alert">
          Discarding deletes this session from the device. Export the workbook first if you need to
          keep the record.
        </Notice>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section setup                                                              */
/* -------------------------------------------------------------------------- */

interface SectionSetupProps {
  sectionName: string;
  error: string | null;
  hasStoredSession: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onResume?: () => void;
  onDiscard?: () => void;
}

function SectionSetup({
  sectionName,
  error,
  hasStoredSession,
  onChange,
  onSubmit,
  onResume,
  onDiscard,
}: SectionSetupProps) {
  return (
    <div className="aq-stack aq-stack--lg aq-section-form">
      <header className="aq-pagehead">
        <h1 className="aq-pagehead__title">Attendance session · جلسة الحضور</h1>
        <p className="aq-pagehead__lead">
          Name the section, then start the camera. Students are recorded one after another without
          leaving this screen.
        </p>
      </header>

      {hasStoredSession && onResume !== undefined ? (
        <Notice tone="accent" icon="refresh" title="An unfinished session was recovered">
          <div className="aq-row aq-row--wrap" style={{ marginTop: 'var(--s-2)' }}>
            <button type="button" className="aq-btn aq-btn--sm aq-btn--primary" onClick={onResume}>
              Resume it
            </button>
            {onDiscard !== undefined ? (
              <button type="button" className="aq-btn aq-btn--sm" onClick={onDiscard}>
                Discard and start over
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <div className="aq-card">
        <div className="aq-card__body">
          <Field
            label="Section name · اسم الفرقة"
            error={error ?? undefined}
            hint={`Up to ${SECTION_MAX} characters, for example CS-3-A or VC-2-B.`}
            required
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="aq-input aq-input--lg aq-input--mono"
                type="text"
                value={sectionName}
                onChange={(event) => onChange(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                placeholder="CS-3-A"
                enterKeyHint="done"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                dir="ltr"
              />
            )}
          </Field>
        </div>
        <div className="aq-card__foot">
          <button type="button" className="aq-btn aq-btn--primary aq-btn--lg aq-btn--block" onClick={onSubmit}>
            <Icon name="scan" size={18} />
            Start attendance
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Session header                                                             */
/* -------------------------------------------------------------------------- */

interface SessionHeaderProps {
  sectionName: string;
  createdAt: string;
  count: number;
  stage: 'live' | 'review';
  onBack?: () => void;
  onReview: () => void;
  onNewSession: () => void;
}

function SessionHeader({
  sectionName,
  createdAt,
  count,
  stage,
  onBack,
  onReview,
  onNewSession,
}: SessionHeaderProps) {
  return (
    <header className="aq-pagehead">
      <div className="aq-pagehead__row">
        <div className="aq-stack aq-stack--sm">
          <span className="aq-stamp">{sectionName}</span>
          <p className="aq-text-xs aq-text-muted">{formatDateTime(createdAt)}</p>
        </div>
        <div className="aq-row aq-row--wrap">
          {onBack !== undefined ? (
            <button type="button" className="aq-btn aq-btn--sm" onClick={onBack}>
              <Icon name="arrowLeft" size={15} />
              Live scanning
            </button>
          ) : null}
          {stage === 'live' ? (
            <button type="button" className="aq-btn aq-btn--sm" onClick={onReview}>
              <Icon name="search" size={15} />
              Review
            </button>
          ) : null}
          <button type="button" className="aq-btn aq-btn--sm aq-btn--ghost" onClick={onNewSession}>
            <Icon name="plus" size={15} />
            New session
          </button>
        </div>
      </div>
      <p className="aq-pagehead__lead">
        {count} student{count === 1 ? '' : 's'} recorded. The section name appears on the exported
        worksheet.
      </p>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Review + export                                                            */
/* -------------------------------------------------------------------------- */

interface ReviewPanelProps {
  controller: ReturnType<typeof useAttendanceSession>;
  onBack: () => void;
  onEdit: (record: AttendanceRecord) => void;
  onRemove: (record: AttendanceRecord) => void;
  onNote: (record: AttendanceRecord) => void;
  onNotify: (tone: ToastTone, title: string, text?: string) => void;
  wide: boolean;
}

function ReviewPanel({
  controller,
  onBack,
  onEdit,
  onRemove,
  onNote,
  onNotify,
  wide,
}: ReviewPanelProps) {
  const session = controller.session;
  if (session === null) return null;
  const stats = controller.stats;

  return (
    <div className="aq-stack aq-stack--lg">
      <div className="aq-grid-2">
        <section className="aq-card">
          <div className="aq-card__head">
            <span className="aq-card__title">Attendance records</span>
            <span className="aq-chip aq-num">{stats.total}</span>
          </div>
          <div className="aq-card__body aq-card__body--tight">
            {stats.total === 0 ? (
              <EmptyState icon="users" title="Nothing recorded yet">
                Go back to live scanning and record at least one student.
              </EmptyState>
            ) : wide ? (
              <RecordTable
                records={session.records}
                sharedDevices={controller.sharedDevices}
                onEdit={onEdit}
                onRemove={onRemove}
                onNote={onNote}
              />
            ) : (
              <RecordCards
                records={session.records}
                sharedDevices={controller.sharedDevices}
                onEdit={onEdit}
                onRemove={onRemove}
                onNote={onNote}
              />
            )}
          </div>
          <div className="aq-card__foot">
            <button type="button" className="aq-btn aq-btn--quiet" onClick={onBack}>
              <Icon name="arrowLeft" size={16} />
              Back to scanning
            </button>
          </div>
        </section>

        <section className="aq-card">
          <div className="aq-card__head">
            <span className="aq-card__title">Export</span>
          </div>
          <div className="aq-card__body">
            <ExportPanel session={session} onNotify={onNotify} />
          </div>
        </section>
      </div>
    </div>
  )
}
