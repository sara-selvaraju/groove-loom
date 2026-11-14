import { describe, expect, it } from 'vitest';
import { Limiter } from './limiter.js';

const clock = (start = Date.UTC(2026, 10, 14, 12, 0, 0)) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('Limiter', () => {
  it('allows a burst up to the per-minute limit, then refuses until the minute passes', () => {
    const c = clock();
    const l = new Limiter({ perMinute: 3, perDay: 100, globalPerDay: 1000 }, c.now);
    expect([l.take('a'), l.take('a'), l.take('a')].every((r) => r.ok)).toBe(true);
    const refused = l.take('a');
    expect(refused).toEqual({ ok: false, scope: 'minute', retryAfterSeconds: 60 });
    c.advance(30_000);
    expect(l.take('a')).toMatchObject({ ok: false, retryAfterSeconds: 30 });
    c.advance(30_001);
    expect(l.take('a').ok).toBe(true);
  });

  it('counts each visitor separately', () => {
    const l = new Limiter({ perMinute: 1, perDay: 100, globalPerDay: 1000 }, clock().now);
    expect(l.take('a').ok).toBe(true);
    expect(l.take('a').ok).toBe(false);
    expect(l.take('b').ok).toBe(true);
  });

  it('applies a daily limit per visitor that resets at midnight UTC', () => {
    const c = clock(Date.UTC(2026, 10, 14, 23, 0, 0));
    const l = new Limiter({ perMinute: 100, perDay: 2, globalPerDay: 1000 }, c.now);
    l.take('a');
    l.take('a');
    expect(l.take('a')).toEqual({ ok: false, scope: 'day', retryAfterSeconds: 3600 });
    c.advance(3600_000);
    expect(l.take('a').ok).toBe(true);
  });

  it('applies a daily backstop across all visitors', () => {
    const l = new Limiter({ perMinute: 100, perDay: 100, globalPerDay: 3 }, clock().now);
    expect(['a', 'b', 'c'].map((v) => l.take(v).ok)).toEqual([true, true, true]);
    expect(l.take('d')).toMatchObject({ ok: false, scope: 'global' });
  });

  it('does not count refused requests', () => {
    const c = clock();
    const l = new Limiter({ perMinute: 1, perDay: 2, globalPerDay: 1000 }, c.now);
    l.take('a');
    for (let i = 0; i < 5; i++) l.take('a'); // refused by the minute limit
    c.advance(61_000);
    expect(l.take('a').ok).toBe(true); // second of two allowed today
  });
});
