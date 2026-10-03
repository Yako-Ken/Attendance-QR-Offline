/**
 * End-to-end QA in a real browser.
 *
 * Covers the two workflows, the offline requirement, and the visual pass across
 * five viewport sizes. The camera path is exercised through Chromium's fake
 * video capture device, so getUserMedia, the MediaStream, the video element, the
 * frame sampler, and the decoder all run exactly as they would in the field —
 * only the sensor is synthetic.
 *
 * Uses the Edge already installed on the machine, so no browser download is
 * required.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const artifacts = join(root, 'qa', 'artifacts')
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

const DEVICES = {
  student1: {
    name: 'Ahmed Mohamed Ali',
    id: '001234',
    year: '3',
    deviceId: 'aaaaaaaa-1111-4111-8111-111111111111',
  },
  student2: {
    name: 'Sara Ibrahim Hassan',
    id: '000042',
    year: '1',
    deviceId: 'bbbbbbbb-2222-4222-8222-222222222222',
  },
  student3SameDevice: {
    name: 'Omar Nabil Fouad',
    id: '000777',
    year: '3',
    deviceId: 'aaaaaaaa-1111-4111-8111-111111111111',
  },
};

const VIEWPORTS = [
  { name: 'phone-small', width: 320, height: 568 },
  { name: 'phone-large', width: 414, height: 896 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

const results = [];
let failures = 0;

function check(label, condition, detail = '') {
  const ok = condition === true;
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : ` — ${detail}`}`);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  return ok;
}

function makeCamera(student, file) {
  execFileSync(
    'python',
    [
      join(root, 'qa', 'make_fake_camera.py'),
      file,
      student.name,
      student.id,
      student.year,
      student.deviceId,
    ],
    { stdio: 'pipe' },
  );
  return file;
}

function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    shell: true,
    stdio: 'pipe',
  });
  return child;
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Preview server did not start at ${url}`);
}

/** Fraction of non-white pixels in a canvas, to prove the QR actually rendered. */
async function canvasCoverage(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.aq-pass__canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    const context = canvas.getContext('2d');
    if (context === null) return -1;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128) dark += 1;
    }
    return dark / (data.length / 4);
  });
}

async function shot(page, name) {
  await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: false });
}

async function fillStudent(page, student) {
  await page.getByLabel(/Full name/i).fill(student.name);
  await page.getByLabel(/Student ID/i).fill(student.id);
  await page.selectOption('select', student.year);
  await page.getByRole('button', { name: /Save and show my QR/i }).click();
  await page.waitForSelector('canvas.aq-pass__canvas', { timeout: 10000 });
}

async function main() {
  mkdirSync(artifacts, { recursive: true });
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    throw new Error('dist/ is missing. Run `npm run build` first.');
  }

  const cameraFile = makeCamera(DEVICES.student1, join(artifacts, 'camera-student1.y4m'));

  const preview = startPreview();
  let server = null;
  let browser = null;

  try {
    await waitForServer(`${BASE}/index.html`);

    browser = await chromium.launch({
      channel: 'msedge',
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${cameraFile}`,
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 414, height: 896 },
      permissions: ['camera'],
      baseURL: BASE,
      acceptDownloads: true,
      locale: 'en-GB',
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    /* ---------------- Student workflow ---------------- */
    await page.goto('/index.html');
    await page.waitForSelector('.aq-app');
    check('app shell renders', (await page.locator('.aq-app').count()) === 1);

    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (link === null) return null;
      const response = await fetch(link.getAttribute('href'));
      return response.json();
    });
    check('web app manifest is served', manifest !== null, manifest?.name ?? '');
    check('manifest declares an icon set', (manifest?.icons ?? []).length >= 4);
    check(
      'service worker registers',
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration !== undefined;
      }),
    );

    await shot(page, '01-student-form-phone');
    await fillStudent(page, DEVICES.student1);

    const coverage = await canvasCoverage(page);
    check('QR code renders on the canvas', coverage > 0.15 && coverage < 0.7, `${(coverage * 100).toFixed(1)}% dark`);

    const shownId = await page.locator('.aq-pass__ids .aq-mono').first().textContent();
    check('student ID keeps leading zeros on screen', shownId?.trim() === '001234', shownId ?? '');
    await shot(page, '02-student-pass-phone');

    const deviceIdBefore = await page.locator('.aq-kv__v.aq-mono').first().textContent();

    await page.reload();
    await page.waitForSelector('canvas.aq-pass__canvas', { timeout: 10000 });
    const afterReload = await page.locator('.aq-pass__ids .aq-mono').first().textContent();
    check('student profile survives a reload', afterReload?.trim() === '001234', afterReload ?? '');

    const deviceIdAfter = await page.locator('.aq-kv__v.aq-mono').first().textContent();
    check('Device ID is stable across a reload', deviceIdBefore === deviceIdAfter, `${deviceIdBefore} / ${deviceIdAfter}`);

    /* ---------------- Attendance workflow ---------------- */
    await page.getByRole('tab', { name: /Attendance/i }).click();
    await page.waitForSelector('.aq-section-form');
    await shot(page, '03-section-setup-phone');

    await page.getByLabel(/Section name/i).fill('CS-3-A');
    await page.getByRole('button', { name: /Start attendance/i }).click();
    await page.waitForSelector('.aq-scanner', { timeout: 10000 });
    check('session starts on the live screen', (await page.locator('.aq-scanner').count()) === 1);

    await page.getByRole('button', { name: /Start scanner/i }).click();
    await page.waitForSelector('.aq-scanner__badge', { timeout: 20000 });
    check('camera starts from the real getUserMedia path', true);

    // The fake camera shows student 1's QR; it should be decoded and recorded.
    await page.waitForFunction(
      () => document.querySelectorAll('.aq-ledger__item').length > 0,
      undefined,
      { timeout: 25000 },
    );
    check('a scanned QR is decoded and recorded', true);

    const firstName = await page.locator('.aq-ledger__name').first().textContent();
    check('decoded name matches the QR payload', firstName?.trim() === DEVICES.student1.name, firstName ?? '');
    const firstId = await page.locator('.aq-ledger__item .aq-mono').first().textContent();
    check('decoded student ID keeps leading zeros', firstId?.trim() === '001234', firstId ?? '');

    await shot(page, '04-live-scanning-phone');

    // Scanning the same code again must be rejected as a duplicate.
    await page.waitForSelector('.aq-lastscan--warn', { timeout: 25000 });
    const duplicateText = await page.locator('.aq-lastscan__title').textContent();
    check('a repeated scan is reported as already recorded', /Attention/i.test(duplicateText ?? ''), duplicateText ?? '');
    const totalAfterDuplicate = await page.locator('.aq-metric__v').first().textContent();
    check('a duplicate does not add a record', totalAfterDuplicate?.trim() === '1', `total=${totalAfterDuplicate}`);

    /* ---------------- Review + export ---------------- */
    await page.getByRole('button', { name: /Review/i }).first().click();
    await page.waitForSelector('.aq-card__title:has-text("Export")', { timeout: 10000 });
    await shot(page, '05-review-phone');

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: /Download Excel/i }).click();
    const download = await downloadPromise;
    const savedPath = join(artifacts, 'export.xlsx');
    await download.saveAs(savedPath);
    check('Excel export downloads a file', existsSync(savedPath));
    check(
      'export filename matches the documented pattern',
      /^attendance_CS-3-A_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/.test(download.suggestedFilename()),
      download.suggestedFilename(),
    );

    /* ---------------- Offline ---------------- */
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.aq-app', { timeout: 20000 });
    check('app shell loads with the network disabled', true);

    const offlineBanner = await page.locator('.aq-ribbon').first().textContent();
    check('offline state is reported to the user', /offline/i.test(offlineBanner ?? ''), (offlineBanner ?? '').trim());

    const recovered = await page.locator('.aq-pass__ids .aq-mono').first().textContent();
    check('student profile is available offline', recovered?.trim() === '001234', recovered ?? '');

    await page.getByRole('tab', { name: /Attendance/i }).click();
    await page.waitForSelector('.aq-scanner, .aq-section-form', { timeout: 10000 });
    const offlineTotal = await page.locator('.aq-metric__v').first().textContent();
    check('attendance session is available offline', offlineTotal?.trim() === '1', `total=${offlineTotal}`);
    await shot(page, '06-offline-phone');
    await context.setOffline(false);

    /* ---------------- Visual pass across viewports ---------------- */
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(250);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      check(
        `${viewport.name} (${viewport.width}x${viewport.height}) has no horizontal overflow`,
        overflow <= 1,
        `overflow=${overflow}px`,
      );

      const railVisible = await page.locator('.aq-rail').isVisible();
      const expectedRail = viewport.width >= 1024;
      check(
        `${viewport.name} shows ${expectedRail ? 'the desktop rail' : 'the mobile top bar'}`,
        railVisible === expectedRail,
      );

      await shot(page, `10-student-${viewport.name}`);

      await page.getByRole('tab', { name: /Attendance/i }).click();
      await page.waitForTimeout(250);
      const qrEdge = await page.evaluate(() => {
        const canvas = document.querySelector('canvas.aq-pass__canvas');
        return canvas === null ? 0 : canvas.getBoundingClientRect().width;
      });
      void qrEdge;

      await shot(page, `11-attendance-${viewport.name}`);
      await page.getByRole('tab', { name: /Student/i }).click();
      await page.waitForTimeout(150);
    }

    check('no console errors during the run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    await context.close();
  } finally {
    if (browser !== null) await browser.close().catch(() => undefined);
    if (server !== null) server.kill('SIGTERM');
    preview.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
  }

  const summary = [
    '',
    '================ QA SUMMARY ================',
    ...results,
    '',
    `${results.length - failures}/${results.length} checks passed`,
    failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`,
    '===========================================',
  ].join('\n');

  console.log(summary);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('QA run failed:', error);
  process.exitCode = 1;
});