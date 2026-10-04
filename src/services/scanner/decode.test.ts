/**
 * Scan cooldown.
 *
 * The camera decodes the same symbol many times a second, so the cooldown is
 * what stands between a held-up phone and fifty attendance records. It also has
 * to stay narrow: a code it mutes must never silence a different one.
 */

import { describe, expect, it } from 'vitest'
import { ScanCooldown } from './decode'

const T0 = 1_000_000

describe('ScanCooldown', () => {
  it('passes the first code it sees', () => {
    expect(new ScanCooldown().shouldIgnore('A', T0)).toBe(false);
  });

  it('suppresses an immediate repeat of the same code', () => {
    const cooldown = new ScanCooldown();

    cooldown.shouldIgnore('A', T0);

    expect(cooldown.shouldIgnore('A', T0 + 500)).toBe(true);
  });

  it('accepts the same code again once the window has passed', () => {
    const cooldown = new ScanCooldown(2500);

    cooldown.shouldIgnore('A', T0);

    expect(cooldown.shouldIgnore('A', T0 + 2500)).toBe(false);
  });

  it('lets a different code through immediately', () => {
    const cooldown = new ScanCooldown();

    cooldown.shouldIgnore('A', T0);

    expect(cooldown.shouldIgnore('B', T0 + 100)).toBe(false);
  });

  it('mutes a rejected payload for longer than the normal window', () => {
    const cooldown = new ScanCooldown(2500);

    cooldown.ignoreFor('stale', 9000, T0);

    expect(cooldown.shouldIgnore('stale', T0 + 5000)).toBe(true);
  });

  it('keeps reading other codes while a rejection is muted', () => {
    const cooldown = new ScanCooldown();

    cooldown.ignoreFor('stale', 9000, T0);

    expect(cooldown.shouldIgnore('fresh-student', T0 + 500)).toBe(false);
  });

  it('reports the muted code again once its silence expires', () => {
    const cooldown = new ScanCooldown();

    cooldown.ignoreFor('stale', 9000, T0);

    expect(cooldown.shouldIgnore('stale', T0 + 9000)).toBe(false);
  });

  it('forgets everything on reset', () => {
    const cooldown = new ScanCooldown();

    cooldown.shouldIgnore('A', T0);
    cooldown.ignoreFor('B', 9000, T0);
    cooldown.reset();

    expect(cooldown.shouldIgnore('A', T0 + 100)).toBe(false);
  });
});