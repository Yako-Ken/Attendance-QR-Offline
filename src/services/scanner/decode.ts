/**
 * Frame sampling and QR decoding.
 *
 * Decoding happens entirely on the device: video frames are drawn to an
 * off-screen canvas, downscaled, and read back. No frame is ever stored or
 * transmitted.
 *
 * Performance notes, which matter on a mid-range phone held at arm's length for
 * a whole lecture:
 *   - the sampling canvas is capped to ~480px on the long edge, which is ample
 *     for a QR that already fills a third of the frame and keeps the per-frame
 *     cost roughly an order of magnitude below full resolution;
 *   - `getImageData` is the dominant cost, so it is called at a fixed cadence
 *     rather than once per animation frame;
 *   - the decoder itself is code-split and only fetched when scanning starts,
 *     so opening the app never downloads it.
 */

const MAX_SAMPLE_EDGE = 480;
const SAMPLE_INTERVAL_MS = 90;

export interface DecodedFrame {
  readonly text: string;
  readonly at: number;
}

type Decoder = (data: Uint8ClampedArray, width: number, height: number) => string | null;

let decoderPromise: Promise<Decoder> | null = null;

/** Lazily import the decoder so it stays out of the initial bundle. */
export function loadDecoder(): Promise<Decoder> {
  decoderPromise ??= import('jsqr').then((module) => {
    const decode = module.default;
    return (data, width, height) => {
      const result = decode(data, width, height);
      return result === null ? null : result.data;
    };
  });
  return decoderPromise;
}

export function preloadDecoder(): void {
  void loadDecoder().catch(() => {
    decoderPromise = null;
  });
}

export class FrameSampler {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private lastSampleAt = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (context === null) {
      throw new Error('This browser cannot provide a 2D canvas context for decoding.');
    }
    this.context = context;
  }

  private resize(video: HTMLVideoElement): boolean {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (sourceWidth === 0 || sourceHeight === 0) return false;

    const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (width === this.width && height === this.height) return true;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  /** Returns decoded text when a new symbol is present in the current frame. */
  sample(video: HTMLVideoElement, decoder: Decoder, now: number): string | null {
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return null;
    this.lastSampleAt = now;
    if (!this.resize(video)) return null;

    try {
      this.context.drawImage(video, 0, 0, this.width, this.height);
      const pixels = this.context.getImageData(0, 0, this.width, this.height);
      return decoder(pixels.data, this.width, this.height);
    } catch {
      // A dropped frame during a resize or tab switch is not an error worth
      // stopping the session for.
      return null;
    }
  }

  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

/**
 * A QR held in front of the lens is decoded on every sample. Without a
 * cooldown the same code would be re-submitted dozens of times per second, so a
 * payload is suppressed briefly after it is accepted.
 *
 * A rejection is muted separately, and only for the offending payload: a stale
 * screenshot left in front of the lens must not also block the next real student.
 */
export class ScanCooldown {
  private lastText: string | null = null;
  private lastAt = 0;
  private mutedText: string | null = null;
  private mutedUntil = 0;

  private readonly windowMs: number;

  constructor(windowMs = 2500) {
    this.windowMs = windowMs;
  }

  /** True when this text should be ignored as a repeat of the last read one. */
  shouldIgnore(text: string, now: number): boolean {
    if (text === this.mutedText && now < this.mutedUntil) return true;
    if (text === this.lastText && now - this.lastAt < this.windowMs) return true;
    this.lastText = text;
    this.lastAt = now;
    return false;
  }

  /**
   * Silence one specific payload for longer than the normal window.
   *
   * A rejected symbol stays in front of the lens, so without this it would be
   * re-read and re-rejected every couple of seconds, burying the assistant in
   * repeated warnings. Only this payload is muted; a different code is judged
   * on its own merits the moment it is seen.
   */
  ignoreFor(text: string, ms: number, now: number = Date.now()): void {
    this.mutedText = text;
    this.mutedUntil = now + ms;
  }

  reset(): void {
    this.lastText = null;
    this.lastAt = 0;
    this.mutedText = null;
    this.mutedUntil = 0;
  }
}