import { describe, expect, it } from 'vitest';
import { buildDailyActiveTrend } from '@/modules/dashboard/daily-active-trend';

describe('daily active platform history', () => {
  it('fills missing days and platforms across a UTC year boundary', () => {
    const trend = buildDailyActiveTrend({
      start: new Date('2025-12-31T00:00:00Z'), days: 3,
      rows: [
        { date: '2025-12-31', platform: 'android', count: '2' },
        { date: '2025-12-31', platform: 'windows', count: '3' },
        { date: '2026-01-02', platform: 'ios', count: '1' },
      ],
    });
    expect(trend.map(({ date, total }) => ({ date, total }))).toEqual([
      { date: '2025-12-31', total: 5 }, { date: '2026-01-01', total: 0 }, { date: '2026-01-02', total: 1 },
    ]);
    expect(trend[0].platforms.find((item) => item.name === 'android')?.value).toBe(2);
    expect(trend[1].platforms).toHaveLength(5);
    expect(trend[1].platforms.every((item) => item.value === 0)).toBe(true);
  });

  it.each([7, 30, 90])('returns every day in an empty %i-day range', (days) => {
    const trend = buildDailyActiveTrend({ start: new Date('2026-01-01T00:00:00Z'), days, rows: [] });
    expect(trend).toHaveLength(days);
    expect(trend.every((day) => day.total === 0)).toBe(true);
  });
});
