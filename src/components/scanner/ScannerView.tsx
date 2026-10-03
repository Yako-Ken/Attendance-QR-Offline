/**
 * Live scanner.
 *
 * One camera, one decode loop, no page navigation: the teaching assistant can
 * walk down a row of students without ever leaving this screen.
 */

import type { ScannerController, ScannerStatus } from '../../state/useScanner'
import { Icon } from '../ui/Icon'
import { Notice } from '../ui/primitives'

export interface ScannerViewProps {
  readonly controller: ScannerController;
  readonly hint: string;
  readonly hitToken: number;
  readonly tall?: boolean;
}

export function ScannerView({ controller, hint, hitToken, tall = false }: ScannerViewProps) {
  const { status, videoRef, start, stop, toggleFacing, torchSupported, torchOn, toggleTorch } =
    controller;

  const running = status === 'running';
  const error =
    typeof status === 'object' && status !== null && 'error' in status ? status.error : null;
  const starting = status === 'starting';

  return (
    <div className="aq-stack">
      <div
        className={`aq-scanner${tall ? ' aq-scanner--tall' : ''}${hitToken > 0 ? ' aq-scanner--hit' : ''}`}
      >
        <video
          ref={videoRef}
          className="aq-scanner__video"
          playsInline
          muted
          aria-label="Live camera preview of the student QR code"
        />

        {/*
          Keying on `hitToken` remounts the frame, which restarts the one-shot
          success animation without any timer or state synchronisation.
        */}
        <div className="aq-scanner__frame" key={hitToken} aria-hidden="true">
          <span className="aq-scanner__corner aq-scanner__corner--tl" />
          <span className="aq-scanner__corner aq-scanner__corner--tr" />
          <span className="aq-scanner__corner aq-scanner__corner--bl" />
          <span className="aq-scanner__corner aq-scanner__corner--br" />
          {running ? <span className="aq-scanner__sweep" /> : null}
        </div>

        {running ? (
          <p className="aq-scanner__badge">
            <span className="aq-scanner__dot" aria-hidden="true" />
            Scanning
          </p>
        ) : null}

        {!running ? (
          <div className="aq-scanner__placeholder">
            <Icon name={running ? 'camera' : 'scan'} size={30} />
            <h3>{starting ? 'Starting the camera…' : 'Scanner is off'}</h3>
            <p>{hint}</p>
            {error === null ? (
              <button
                type="button"
                className="aq-btn aq-btn--primary"
                onClick={start}
                disabled={starting}
              >
                <Icon name="camera" size={18} />
                Start scanner
              </button>
            ) : null}
          </div>
        ) : null}

        {running ? (
          <div className="aq-scanner__controls">
            <button
              type="button"
              className="aq-iconbtn"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Turn the torch off' : 'Turn the torch on'}
              title={torchSupported ? 'Torch' : 'Torch not available on this camera'}
              disabled={!torchSupported}
            >
              <Icon name="sun" size={18} />
            </button>
            <button
              type="button"
              className="aq-iconbtn"
              onClick={toggleFacing}
              aria-label="Switch between the rear and front camera"
            >
              <Icon name="refresh" size={18} />
            </button>
            <button
              type="button"
              className="aq-iconbtn"
              onClick={stop}
              aria-label="Stop the scanner"
            >
              <Icon name="stop" size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {error !== null ? (
        <Notice tone="danger" icon="cameraOff" title="The camera could not be started">
          <p>{error}</p>
          <p className="aq-text-xs aq-text-muted">
            Everything else — editing, reviewing, and exporting — keeps working without the camera.
          </p>
        </Notice>
      ) : null}

      <p className="aq-sr" aria-live="polite">
        {running ? 'Scanner running. Point it at a student QR code.' : 'Scanner stopped.'}
      </p>
    </div>
  )
}

export type { ScannerStatus }