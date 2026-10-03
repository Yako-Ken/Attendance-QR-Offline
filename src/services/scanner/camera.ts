/**
 * Camera access.
 *
 * `getUserMedia` is only exposed in a Secure Context: HTTPS, or `localhost`.
 * An `file://` page is *not* a secure context, so a double-clicked HTML file
 * genuinely cannot open a camera. Rather than pretending otherwise, the scanner
 * reports the exact reason and what to do about it.
 */

export type CameraBlocker = 'insecure-context' | 'unsupported' | 'no-camera';

export type CameraStartResult =
  | { readonly ok: true; readonly stream: MediaStream }
  | { readonly ok: false; readonly blocker: CameraBlocker; readonly message: string };

export interface CameraSupport {
  readonly supported: boolean;
  readonly secure: boolean;
  readonly blocker: CameraBlocker | null;
  readonly message: string | null;
}

const MESSAGES: Record<CameraBlocker, string> = {
  'insecure-context':
    'Camera access needs a secure connection. Open the app from localhost or over HTTPS.',
  unsupported: 'This browser does not provide camera access through the web page.',
  'no-camera': 'No usable camera was detected on this device.',
};

const FAILURE_MESSAGES = {
  denied: 'Camera access was blocked. Allow the camera for this site in your browser settings.',
  missing: 'No camera was found on this device.',
  insecure: 'The camera stream could not be opened because the connection is not secure.',
  failed: 'The camera could not be started. Close any other app using it and try again.',
  unsupportedRequest: 'The camera did not accept the requested settings.',
  busy: 'The camera is already in use by another application.',
} as const;

export function checkCameraSupport(): CameraSupport {
  const hasApi =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  if (!hasApi) {
    const insecure = !globalThis.isSecureContext;
    const blocker: CameraBlocker = insecure ? 'insecure-context' : 'unsupported';
    return { supported: false, secure: !insecure, blocker, message: MESSAGES[blocker] };
  }

  return { supported: true, secure: globalThis.isSecureContext, blocker: null, message: null };
}

function classify(error: unknown): { blocker: CameraBlocker; message: string } {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { blocker: 'unsupported', message: FAILURE_MESSAGES.denied };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { blocker: 'no-camera', message: FAILURE_MESSAGES.missing };
    case 'NotReadableError':
    case 'TrackStartError':
      return { blocker: 'no-camera', message: FAILURE_MESSAGES.busy };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return { blocker: 'no-camera', message: FAILURE_MESSAGES.unsupportedRequest };
    case 'InsecureContext':
      return { blocker: 'insecure-context', message: FAILURE_MESSAGES.insecure };
    default:
      return { blocker: 'no-camera', message: FAILURE_MESSAGES.failed };
  }
}

export interface CameraOptions {
  readonly facingMode: 'environment' | 'user';
}

export async function startCamera(options: CameraOptions): Promise<CameraStartResult> {
  const support = checkCameraSupport();
  if (!support.supported && support.blocker !== null) {
    return { ok: false, blocker: support.blocker, message: support.message ?? MESSAGES.unsupported };
  }

  if (!globalThis.isSecureContext) {
    return { ok: false, blocker: 'insecure-context', message: MESSAGES['insecure-context'] };
  }

  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: options.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: { facingMode: options.facingMode },
    },
    // Last resort: let the browser choose any camera at all.
    { audio: false, video: true },
  ];

  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { ok: true, stream };
    } catch (error) {
      lastError = error;
      if (error instanceof DOMException && error.name === 'NotAllowedError') break;
    }
  }

  const { blocker, message } = classify(lastError);
  return { ok: false, blocker, message };
}

export function stopStream(stream: MediaStream | null): void {
  if (stream === null) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* Stopping an already-ended track is not an error worth surfacing. */
    }
  }
}

export function attachStream(video: HTMLVideoElement, stream: MediaStream): void {
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  void video.play().catch(() => {
    /* Autoplay can be blocked; the controls still show the preview. */
  });
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  } catch {
    return [];
  }
}

export async function setTorch(stream: MediaStream, enabled: boolean): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (track === undefined) return false;
  try {
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
      torch?: boolean;
    };
    if (capabilities.torch !== true) return false;
    await track.applyConstraints({ advanced: [{ torch: enabled }] } as unknown as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

/** Keep the screen awake while scanning, where the browser supports it. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
  };
  if (typeof nav.wakeLock?.request !== 'function') return null;
  try {
    return await nav.wakeLock.request('screen');
  } catch {
    return null;
  }
}