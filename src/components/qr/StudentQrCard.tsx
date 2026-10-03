/**
 * The student QR pass.
 *
 * The symbol is rendered to a canvas at an integer module size with a
 * four-module quiet zone, which is what makes it read reliably from another
 * phone at lecture distance. It re-renders whenever the profile, the available
 * space, or the pixel ratio changes, and never touches the network.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { StudentProfile } from '../../types/student'
import { buildAttendanceQr, serialiseAttendanceQr } from '../../lib/validation/qr'
import { encodeQrCached } from '../../services/qr/encode'
import { renderQrToCanvas } from '../../services/qr/render'
import { Icon } from '../ui/Icon'

export interface StudentQrCardProps {
  readonly profile: StudentProfile;
  readonly deviceId: string;
  readonly onEdit: () => void;
}

const MIN_EDGE = 208;
const MAX_EDGE = 420;

export function StudentQrCard({ profile, deviceId, onEdit }: StudentQrCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState(280);

  const payloadText = useMemo(() => {
    try {
      return serialiseAttendanceQr(
        buildAttendanceQr({
          name: profile.fullName,
          studentId: profile.studentId,
          academicYear: profile.academicYear,
          deviceId,
        }),
      );
    } catch {
      return '';
    }
  }, [profile.academicYear, profile.fullName, profile.studentId, deviceId]);

  // Encoding is a pure function of the payload, so it is derived during render
  // rather than pushed into state from an effect.
  const symbol = useMemo(() => {
    if (payloadText === '') return { matrix: null, version: 0 };
    try {
      const matrix = encodeQrCached(payloadText);
      return { matrix, version: matrix.version };
    } catch {
      return { matrix: null, version: 0 };
    }
  }, [payloadText]);

  // Painting the canvas is a genuine side effect and belongs in a layout
  // effect, so it lands in the same frame as the layout it depends on.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || symbol.matrix === null) return;
    try {
      renderQrToCanvas(canvas, symbol.matrix, { targetCssSize: edge });
    } catch {
      /* A missing 2D context leaves the previous symbol in place. */
    }
  }, [edge, symbol.matrix]);

  // The symbol must fit the viewport in portrait and use the available width in
  // landscape or on a tablet, so the drawn edge is measured, not assumed.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;

    const measure = (): void => {
      const styles = getComputedStyle(frame);
      const horizontal =
        frame.clientWidth -
        parseFloat(styles.paddingLeft || '0') -
        parseFloat(styles.paddingRight || '0');
      const vertical =
        frame.clientHeight -
        parseFloat(styles.paddingTop || '0') -
        parseFloat(styles.paddingBottom || '0');
      const available = Math.min(horizontal, vertical);
      if (available <= 0) return;
      setEdge(Math.round(Math.min(MAX_EDGE, Math.max(MIN_EDGE, available))));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const failed = payloadText !== '' && symbol.matrix === null;

  return (
    <div className="aq-pass">
      <div className="aq-pass__frame aq-crop" ref={frameRef}>
        <div className="aq-pass__quiet" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          className="aq-pass__canvas"
          role="img"
          aria-label={`QR attendance code for ${profile.fullName}, student ${profile.studentId}, year ${profile.academicYear}. Showing this on your screen lets a teaching assistant record your attendance.`}
        />
        <span className="aq-pass__version aq-mono" aria-hidden="true">
          v{symbol.version}
        </span>
      </div>

      <div className="aq-pass__meta">
        <div className="aq-kv">
          <span className="aq-kv__k">Full name · الاسم</span>
          <span className="aq-kv__v aq-pass__name">{profile.fullName}</span>
        </div>
        <div className="aq-pass__ids">
          <div className="aq-kv">
            <span className="aq-kv__k">Student ID · الرقم</span>
            <span className="aq-kv__v aq-mono">{profile.studentId}</span>
          </div>
          <div className="aq-kv">
            <span className="aq-kv__k">Year · الفرقة</span>
            <span className="aq-kv__v aq-num">{profile.academicYear}</span>
          </div>
        </div>
      </div>

      {failed ? (
        <p className="aq-field__err" role="alert">
          <Icon name="alertCircle" size={14} />
          <span>The QR code could not be generated. Try editing your details and saving again.</span>
        </p>
      ) : null}

      <p className="aq-pass__hint">
        <Icon name="info" size={14} />
        <span>
          Turn your screen brightness up and hold the phone steady about 20–30&nbsp;cm from the
          scanner.
        </span>
      </p>

      <button type="button" className="aq-btn aq-btn--quiet aq-btn--block" onClick={onEdit}>
        <Icon name="edit" size={16} />
        Edit my details
      </button>
    </div>
  )
}
