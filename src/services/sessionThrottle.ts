// Pacing for the authenticated media-info fetches that run as the user's own Meta
// account. Instagram's "we suspect automated behavior" enforcement keys on request
// shape *and* cadence: bursts of identical API calls with no page activity between
// them look like a script. A person tapping through posts leaves gaps of seconds,
// so every fetch waits its turn behind a minimum, jittered gap — and once Instagram
// answers with a rate-limit or checkpoint signal, the platform goes quiet for a
// while instead of hammering an account that is already being watched.
//
// Pure module state, no timers of its own; the resolver awaits `waitForSlot`.

import type { SessionPlatform } from './mediaSession';

/** A reason Meta refused to serve a request that was not a login wall. */
export type BlockReason = 'rate_limited' | 'checkpoint' | 'feedback';

/** Minimum gap between two media-info calls on one platform, before jitter. */
export const MIN_GAP_MS = 2500;
/** Extra random delay added to every gap so the cadence never looks metronomic. */
export const JITTER_MS = 1500;

/** How long a platform stays quiet after each kind of refusal. */
export const COOLDOWN_MS: Record<BlockReason, number> = {
  // 429 / "please wait a few minutes": Instagram's own text says minutes.
  rate_limited: 5 * 60 * 1000,
  // feedback_required is the automation flag itself — back off longer.
  feedback: 15 * 60 * 1000,
  // A checkpoint needs the user to verify in the real app; nothing we retry helps.
  checkpoint: 30 * 60 * 1000,
};

interface PlatformState {
  /** Earliest time the next request may start. */
  nextAllowedAt: number;
  /** Set while a cooldown is active. */
  cooldownUntil: number;
  cooldownReason: BlockReason | null;
}

const state = new Map<SessionPlatform, PlatformState>();

function stateFor(platform: SessionPlatform): PlatformState {
  let current = state.get(platform);
  if (!current) {
    current = { nextAllowedAt: 0, cooldownUntil: 0, cooldownReason: null };
    state.set(platform, current);
  }
  return current;
}

export interface ThrottleDeps {
  now: () => number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: ThrottleDeps = {
  now: () => Date.now(),
  random: Math.random,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Reserves the next request slot for `platform` and waits until it arrives. Slots are
 * claimed synchronously so two concurrent callers can't both think they're next.
 */
export async function waitForSlot(
  platform: SessionPlatform,
  deps: ThrottleDeps = defaultDeps
): Promise<void> {
  const current = stateFor(platform);
  const now = deps.now();
  const start = Math.max(now, current.nextAllowedAt);
  current.nextAllowedAt = start + MIN_GAP_MS + Math.floor(deps.random() * JITTER_MS);
  if (start > now) await deps.sleep(start - now);
}

/** Records a refusal so subsequent requests on that platform wait out the cooldown. */
export function noteBlocked(
  platform: SessionPlatform,
  reason: BlockReason,
  now: number = Date.now()
): void {
  const current = stateFor(platform);
  const until = now + COOLDOWN_MS[reason];
  if (until > current.cooldownUntil) {
    current.cooldownUntil = until;
    current.cooldownReason = reason;
  }
}

/** Remaining cooldown, or null when the platform may be called. */
export function activeCooldown(
  platform: SessionPlatform,
  now: number = Date.now()
): { reason: BlockReason; remainingMs: number } | null {
  const current = state.get(platform);
  if (!current || !current.cooldownReason || current.cooldownUntil <= now) return null;
  return { reason: current.cooldownReason, remainingMs: current.cooldownUntil - now };
}

/** A successful authed answer proves the account is fine again; drop any cooldown. */
export function noteSuccess(platform: SessionPlatform): void {
  const current = state.get(platform);
  if (!current) return;
  current.cooldownUntil = 0;
  current.cooldownReason = null;
}

/** Test-only. */
export function resetSessionThrottleForTests(): void {
  state.clear();
}

/** User-facing copy for a refusal, shared by both platforms' extractors. */
export function describeBlock(label: string, reason: BlockReason, remainingMs?: number): string {
  const minutes = remainingMs ? Math.max(1, Math.ceil(remainingMs / 60000)) : null;
  const wait = minutes ? ` SaveSama will pause ${label} requests for ${minutes} min.` : '';
  switch (reason) {
    case 'checkpoint':
      return `${label} wants you to verify it's you. Open the ${label} app, complete the check, then try again.${wait}`;
    case 'feedback':
      return `${label} flagged this account for unusual activity. Use the ${label} app normally for a while before saving more.${wait}`;
    case 'rate_limited':
      return `${label} is asking for a pause — too many requests in a short time.${wait}`;
  }
}
