import {
  COOLDOWN_MS,
  JITTER_MS,
  MIN_GAP_MS,
  activeCooldown,
  describeBlock,
  noteBlocked,
  noteSuccess,
  resetSessionThrottleForTests,
  waitForSlot,
} from '../sessionThrottle';

describe('waitForSlot', () => {
  beforeEach(resetSessionThrottleForTests);

  it('lets the first request through immediately and spaces the next one', async () => {
    let now = 1_000_000;
    const sleeps: number[] = [];
    const deps = {
      now: () => now,
      random: () => 0.5,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        now += ms;
      },
    };

    await waitForSlot('instagram', deps);
    expect(sleeps).toEqual([]);

    await waitForSlot('instagram', deps);
    expect(sleeps).toEqual([MIN_GAP_MS + JITTER_MS / 2]);
  });

  it('claims slots synchronously so concurrent callers queue behind each other', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const deps = {
      now: () => now,
      random: () => 0,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    };
    await Promise.all([
      waitForSlot('threads', deps),
      waitForSlot('threads', deps),
      waitForSlot('threads', deps),
    ]);
    expect(sleeps).toEqual([MIN_GAP_MS, 2 * MIN_GAP_MS]);
  });

  it('keeps platforms independent', async () => {
    const sleeps: number[] = [];
    const deps = { now: () => 0, random: () => 0, sleep: async (ms: number) => void sleeps.push(ms) };
    await waitForSlot('instagram', deps);
    await waitForSlot('threads', deps);
    expect(sleeps).toEqual([]);
  });
});

describe('cooldowns', () => {
  beforeEach(resetSessionThrottleForTests);

  it('starts a cooldown on a block and clears it on success', () => {
    noteBlocked('instagram', 'rate_limited', 1000);
    expect(activeCooldown('instagram', 1000)).toEqual({
      reason: 'rate_limited',
      remainingMs: COOLDOWN_MS.rate_limited,
    });
    expect(activeCooldown('instagram', 1000 + COOLDOWN_MS.rate_limited)).toBeNull();
    expect(activeCooldown('threads', 1000)).toBeNull();

    noteSuccess('instagram');
    expect(activeCooldown('instagram', 1000)).toBeNull();
  });

  it('never shortens a longer cooldown with a milder one', () => {
    noteBlocked('instagram', 'checkpoint', 0);
    noteBlocked('instagram', 'rate_limited', 0);
    expect(activeCooldown('instagram', 0)?.reason).toBe('checkpoint');
  });

  it('describes each block in plain language with the wait', () => {
    expect(describeBlock('Instagram', 'checkpoint', 60_000)).toMatch(/verify.*1 min/s);
    expect(describeBlock('Threads', 'feedback')).toMatch(/flagged/);
    expect(describeBlock('Instagram', 'rate_limited', 5 * 60_000)).toMatch(/5 min/);
  });
});
