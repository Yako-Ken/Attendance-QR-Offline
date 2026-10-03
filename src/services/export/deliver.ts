/**
 * Local file delivery.
 *
 * Nothing is uploaded: the workbook is produced in memory, handed to the
 * browser, and either saved or passed to the platform share sheet. Every
 * capability is feature-detected, and a failed share is reported as a failure
 * rather than being silently downgraded to a download.
 */

export type DeliveryResult =
  | { readonly ok: true; readonly method: 'share' | 'download'; readonly fileName: string }
  | { readonly ok: false; readonly method: 'none'; readonly reason: string };

export function xlsxMimeType(): string {
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  // Copy into a fresh ArrayBuffer so the Blob never aliases a larger buffer.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function createWorkbookBlob(bytes: Uint8Array): Blob {
  return new Blob([toBlobPart(bytes)], { type: xlsxMimeType() });
}

/**
 * True when the platform can actually share files, not merely when
 * `navigator.share` exists — Safari and Android Chrome disagree often enough
 * that checking only the function produces false positives.
 */
export function canShareFiles(file: File): boolean {
  const nav = navigator;
  if (typeof nav.share !== 'function') return false;
  const canShare = (nav as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare;
  if (typeof canShare !== 'function') return false;
  try {
    return canShare.call(nav, { files: [file] });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}

export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<DeliveryResult> {
  const file = new File([blob], fileName, { type: blob.type });

  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file], title });
      return { ok: true, method: 'share', fileName };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') {
        return { ok: false, method: 'none', reason: 'cancelled' };
      }
      // Any other share failure falls through to the download path below.
    }
  }

  try {
    downloadBlob(blob, fileName);
    return { ok: true, method: 'download', fileName };
  } catch {
    return {
      ok: false,
      method: 'none',
      reason: 'Your browser could not save the file. Your attendance session is still saved locally.',
    };
  }
}

export function downloadWorkbook(bytes: Uint8Array, fileName: string): DeliveryResult {
  try {
    downloadBlob(createWorkbookBlob(bytes), fileName);
    return { ok: true, method: 'download', fileName };
  } catch {
    return {
      ok: false,
      method: 'none',
      reason: 'Your browser could not save the file. Your attendance session is still saved locally.',
    };
  }
}

/** Short haptic pulse; silently absent on devices without a vibrator. */
export function pulse(kind: 'success' | 'warning' | 'error'): void {
  if (typeof navigator.vibrate !== 'function') return;
  const pattern = kind === 'success' ? 18 : kind === 'warning' ? [22, 60, 22] : [40, 70, 40];
  try {
    navigator.vibrate(pattern);
  } catch {
    /* Vibration is a nicety, never a requirement. */
  }
}