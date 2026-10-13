import { dateGroup, formatDuration, formatEta, formatPercent, formatSize, formatSpeed, relativeTime } from '../format';

describe('format', () => {
  it('sizes', () => {
    expect(formatSize(820_000)).toBe('820 KB');
    expect(formatSize(13_800_000)).toBe('13.8 MB');
    expect(formatSize(214_000_000)).toBe('214 MB');
    expect(formatSize(1_240_000_000)).toBe('1.24 GB');
    expect(formatSpeed(3_100_000)).toBe('3.1 MB/s');
    expect(formatSize(null)).toBe('');
  });
  it('eta', () => {
    expect(formatEta(6)).toBe('6 s');
    expect(formatEta(120)).toBe('2 min');
    expect(formatEta(3840)).toBe('1 h 4 min');
    expect(formatEta(null)).toBe('');
  });
  it('percent never shows 100 before done', () => {
    expect(formatPercent(0.999)).toBe('99%');
    expect(formatPercent(1)).toBe('99%');
    expect(formatPercent(0.425)).toBe('42%');
  });
  it('duration', () => {
    expect(formatDuration(31.4)).toBe('0:31');
    expect(formatDuration(724)).toBe('12:04');
    expect(formatDuration(3753)).toBe('1:02:33');
  });
  it('relative time', () => {
    const now = new Date(2026, 9, 13, 12, 0).getTime();
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 18 * 60_000, now)).toBe('18 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(new Date(2026, 9, 12, 20).getTime(), now)).toBe('yesterday');
    expect(relativeTime(new Date(2026, 8, 2).getTime(), now)).toBe('2 Sep');
    expect(relativeTime(new Date(2025, 8, 2).getTime(), now)).toBe('2 Sep 2025');
  });
  it('date groups', () => {
    const now = new Date(2026, 9, 13, 12, 0).getTime();
    expect(dateGroup(now - 1000, now)).toBe('Today');
    expect(dateGroup(new Date(2026, 9, 12).getTime(), now)).toBe('Yesterday');
    expect(dateGroup(new Date(2026, 9, 9).getTime(), now)).toBe('This week');
    expect(dateGroup(new Date(2026, 9, 2).getTime(), now)).toBe('Earlier');
    expect(dateGroup(new Date(2026, 7, 2).getTime(), now)).toBe('August 2026');
  });
});
