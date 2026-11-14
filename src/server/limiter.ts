// In-memory request limits for /api/compose. Per visitor: a short burst
// limit and a daily limit. Per environment: a daily backstop on top of the
// spend limit set on the API key. Counts reset when the server restarts,
// which is acceptable for one small instance; the spend limit is the hard cap.

export interface Limits {
  perMinute: number;
  perDay: number;
  globalPerDay: number;
}

export const DEFAULT_LIMITS: Limits = { perMinute: 10, perDay: 100, globalPerDay: 1000 };

export type LimitResult = { ok: true } | { ok: false; scope: 'minute' | 'day' | 'global'; retryAfterSeconds: number };

const MINUTE = 60_000;

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function secondsUntilNextUtcDay(t: number): number {
  const d = new Date(t);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.ceil((next - t) / 1000);
}

export class Limiter {
  private recent = new Map<string, number[]>();
  private daily = new Map<string, number>();
  private day = '';
  private globalCount = 0;

  constructor(
    private readonly limits: Limits = DEFAULT_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts the request if it is within every limit. */
  take(client: string): LimitResult {
    const t = this.now();
    const today = utcDay(t);
    if (today !== this.day) {
      this.day = today;
      this.daily.clear();
      this.globalCount = 0;
    }
    if (this.globalCount >= this.limits.globalPerDay) {
      return { ok: false, scope: 'global', retryAfterSeconds: secondsUntilNextUtcDay(t) };
    }
    const used = this.daily.get(client) ?? 0;
    if (used >= this.limits.perDay) {
      return { ok: false, scope: 'day', retryAfterSeconds: secondsUntilNextUtcDay(t) };
    }
    const window = (this.recent.get(client) ?? []).filter((s) => t - s < MINUTE);
    if (window.length >= this.limits.perMinute) {
      this.recent.set(client, window);
      return { ok: false, scope: 'minute', retryAfterSeconds: Math.ceil((window[0]! + MINUTE - t) / 1000) };
    }
    window.push(t);
    this.recent.set(client, window);
    this.daily.set(client, used + 1);
    this.globalCount += 1;
    if (this.recent.size > 10_000) this.prune(t);
    return { ok: true };
  }

  private prune(t: number): void {
    for (const [k, v] of this.recent) if (!v.some((s) => t - s < MINUTE)) this.recent.delete(k);
  }
}
