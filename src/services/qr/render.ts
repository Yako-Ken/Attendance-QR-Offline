/**
 * QR canvas renderer.
 *
 * Scannability rules that are easy to get wrong and are enforced here:
 *   - pure black modules on a pure white quiet zone (maximum contrast),
 *   - a quiet zone of 4 modules, the ISO minimum,
 *   - an integer module size, so module edges never land on a half pixel,
 *   - device-pixel-ratio awareness, so the symbol is not resampled and blurred.
 */

import type { QrMatrix } from './matrix';

/** ISO/IEC 18004 requires at least four modules of quiet zone. */
export const QUIET_ZONE_MODULES = 4;

export interface RenderOptions {
  /** Target width in CSS pixels; the height follows the square aspect ratio. */
  readonly targetCssSize: number;
  /** Override the device pixel ratio used for the backing store. */
  readonly devicePixelRatio?: number;
  /** Emit a light quiet zone instead of white (for printing on tinted stock). */
  readonly quietColor?: string;
  readonly moduleColor?: string;
}

export interface RenderResult {
  /** Backing store size actually used, in device pixels. */
  readonly pixelSize: number;
  /** Module size actually used, in device pixels. */
  readonly modulePixels: number;
}

export function computeModuleSize(matrix: QrMatrix, targetDevicePixels: number): number {
  const totalModules = matrix.size + QUIET_ZONE_MODULES * 2;
  return Math.max(1, Math.floor(targetDevicePixels / totalModules));
}

export function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  options: RenderOptions,
): RenderResult {
  const ratio = Math.max(1, Math.min(3, options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1));
  const targetDevicePixels = Math.round(options.targetCssSize * ratio);
  const modulePixels = computeModuleSize(matrix, targetDevicePixels);
  const totalModules = matrix.size + QUIET_ZONE_MODULES * 2;
  const pixelSize = modulePixels * totalModules;

  canvas.width = pixelSize;
  canvas.height = pixelSize;
  canvas.style.width = `${pixelSize / ratio}px`;
  canvas.style.height = `${pixelSize / ratio}px`;

  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) {
    throw new Error('This browser cannot provide a 2D canvas context.');
  }

  const quiet = QUIET_ZONE_MODULES * modulePixels;
  context.fillStyle = options.quietColor ?? '#ffffff';
  context.fillRect(0, 0, pixelSize, pixelSize);
  context.fillStyle = options.moduleColor ?? '#000000';

  for (let row = 0; row < matrix.size; row += 1) {
    const line = matrix.modules[row];
    if (line === undefined) continue;
    for (let column = 0; column < matrix.size; column += 1) {
      if (line[column] !== true) continue;
      context.fillRect(
        quiet + column * modulePixels,
        quiet + row * modulePixels,
        modulePixels,
        modulePixels,
      );
    }
  }

  return { pixelSize, modulePixels };
}

/**
 * Serialised form used by the accessibility layer and by the round-trip tests.
 * `1` = dark module, `0` = light module.
 */
export function matrixToAscii(matrix: QrMatrix): string {
  const border = '##'.repeat(matrix.size + QUIET_ZONE_MODULES * 2);
  const rows: string[] = [border];
  for (let row = 0; row < matrix.size; row += 1) {
    const line = matrix.modules[row] ?? [];
    let text = '##'.repeat(QUIET_ZONE_MODULES);
    for (let column = 0; column < matrix.size; column += 1) {
      text += line[column] === true ? '##' : '..';
    }
    rows.push(`${text}${'##'.repeat(QUIET_ZONE_MODULES)}`);
  }
  rows.push(border);
  return rows.join('\n');
}

/** Rehydrate a matrix from `matrixToAscii` output (tests and diagnostics). */
export function asciiToMatrix(ascii: string): QrMatrix {
  const rows = ascii.trim().split('\n');
  const size = (rows[0]?.length ?? 0) / 2 - QUIET_ZONE_MODULES * 2;
  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line = rows[row + 1] ?? '';
    const cells: boolean[] = [];
    for (let column = 0; column < size; column += 1) {
      const start = (column + QUIET_ZONE_MODULES) * 2;
      cells.push(line.slice(start, start + 2) === '##');
    }
    modules.push(cells);
  }
  const version = (size - 17) / 4;
  return { version, size, modules };
}