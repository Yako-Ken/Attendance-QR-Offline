import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { AttendanceQrPayload } from '../types/qr'
import { validateScannedQr } from '../lib/validation/qr'
import type { FrameSampler, ScanCooldown } from '../services/scanner/decode'

export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopped'
  | { readonly error: string };

export type ScannerOutcome =
  | { readonly kind: 'accepted'; readonly payload: AttendanceQrPayload }
  | { readonly kind: 'rejected'; readonly message: string };

const REJECT_SILENCE_MS = 9000;

export interface ScannerController {
  readonly status: ScannerStatus;
  readonly facingMode: 'environment' | 'user';
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly start: () => void;
  readonly stop: () => void;
  readonly toggleFacing: () => void;
  readonly torchSupported: boolean;
  readonly torchOn: boolean;
  readonly toggleTorch: () => void;
  /** Suspend decoding without releasing the camera, so a dialog can be shown. */
  readonly paused: boolean;
  readonly setPaused: (value: boolean) => void;
}

/**
 * Owns the camera lifecycle and the decode loop.
 *
 * Everything is cleaned up on unmount and whenever the component is hidden, so
 * the camera indicator light is never left on and the stream is never leaked
 * across a mode switch.
 */
export function useScanner(
  active: boolean,
  keepAwake: boolean,
  onOutcome: (outcome: ScannerOutcome) => void,
): ScannerController {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const samplerRef = useRef<FrameSampler | null>(null);
  const cooldownRef = useRef<ScanCooldown | null>(null);
  const decoderRef = useRef<((data: Uint8ClampedArray, width: number, height: number) => string | null) | null>(null);
  const outcomeRef = useRef(onOutcome);
  outcomeRef.current = onOutcome;

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const teardown = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream !== null) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video !== null) video.srcObject = null;
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    samplerRef.current?.dispose();
    samplerRef.current = null;
    setTorchOn(false);
  }, []);

  useEffect(() => teardown, [teardown]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const sampler = samplerRef.current;
    const decoder = decoderRef.current;
    const cooldown = cooldownRef.current;
    if (video === null || sampler === null || decoder === null || cooldown === null) return;

    const tick = (now: number): void => {
      if (videoRef.current !== video || streamRef.current === null) return;
      if (pausedRef.current) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const text = sampler.sample(video, decoder, now);
      if (text !== null && !cooldown.shouldIgnore(text, now)) {
        /**
         * Freshness is judged against the wall clock, not the animation-frame
         * timestamp: `now` counts from page load, while `issuedAt` is Unix time,
         * so mixing them would make every genuine code look impossibly far in the
         * future. The monotonic `now` stays in use for cadence and cooldowns,
         * where only elapsed time matters.
         */
        const parsed = validateScannedQr(text, Date.now());
        if (!parsed.ok) {
          // Keep re-reading the same rejected code silent for a while.
          cooldown.ignoreFor(text, REJECT_SILENCE_MS);
        }
        outcomeRef.current(
          parsed.ok
            ? { kind: 'accepted', payload: parsed.payload }
            : { kind: 'rejected', message: parsed.message },
        );
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    const run = async (): Promise<void> => {
      if (streamRef.current !== null) return;
      setStatus('starting');

      const [{ startCamera, attachStream, setTorch, requestWakeLock }, decodeModule] =
        await Promise.all([
          import('../services/scanner/camera'),
          import('../services/scanner/decode'),
        ]);

      const result = await startCamera({ facingMode });
      if (!result.ok) {
        setStatus({ error: result.message });
        return;
      }

      streamRef.current = result.stream;
      const video = videoRef.current;
      if (video === null) {
        for (const track of result.stream.getTracks()) track.stop();
        streamRef.current = null;
        setStatus({ error: 'The scanner view is not available.' });
        return;
      }

      attachStream(video, result.stream);
      setTorchSupported(await setTorch(result.stream, false));
      setTorchOn(false);
      cooldownRef.current = new decodeModule.ScanCooldown();
      decodeModule.preloadDecoder();

      if (keepAwake) {
        wakeLockRef.current = await requestWakeLock();
      }

      try {
        decoderRef.current = await decodeModule.loadDecoder();
      } catch {
        for (const track of result.stream.getTracks()) track.stop();
        streamRef.current = null;
        setStatus({ error: 'The QR reader could not be loaded.' });
        return;
      }

      if (samplerRef.current === null) {
        try {
          samplerRef.current = new decodeModule.FrameSampler();
        } catch {
          for (const track of result.stream.getTracks()) track.stop();
          streamRef.current = null;
          setStatus({ error: 'This browser cannot read camera frames for decoding.' });
          return;
        }
      }

      setStatus('running');
      loop();
    };

    run().catch(() => {
      teardown();
      setStatus({ error: 'The scanner could not be started.' });
    });
  }, [facingMode, keepAwake, loop, teardown]);

  const stop = useCallback(() => {
    teardown();
    setStatus('stopped');
  }, [teardown]);

  const toggleFacing = useCallback(() => {
    setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'));
  }, []);

  const toggleTorch = useCallback(() => {
    const stream = streamRef.current;
    if (stream === null) return;
    const next = !torchOn;
    import('../services/scanner/camera')
      .then(({ setTorch: applyTorch }) => applyTorch(stream, next))
      .then((applied) => {
        if (applied) setTorchOn(next);
      })
      .catch(() => undefined);
  }, [torchOn]);

  /*
   * Restart only when the *requested camera* changes.
   *
   * This must not depend on `status`: the effect tears the stream down, so
   * including the scanner's own state in the dependency list makes it fire the
   * instant the scanner reaches `running` and switch the camera straight back
   * off. A ref records which camera is currently loaded, and the previous status
   * is read through a ref rather than tracked, so neither can retrigger this.
   */
  const loadedFacing = useRef(facingMode);
  const statusRef = useRef(status);
  statusRef.current = status;
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!active) return;
    if (loadedFacing.current === facingMode) return;

    const wasRunning = statusRef.current === 'running';
    loadedFacing.current = facingMode;
    teardown();
    setStatus('idle');
    if (wasRunning) startRef.current();
  }, [active, facingMode, teardown]);

  return {
    status,
    facingMode,
    videoRef,
    start,
    stop,
    toggleFacing,
    torchSupported,
    torchOn,
    toggleTorch,
    paused,
    setPaused,
  };
}

export type { ScanFeedback } from './useAttendanceSession';