import { platformCounts, type InstallationTrendRow } from './dashboard-trend';

export function buildDailyActiveTrend(options: { start: Date; days: number; rows: InstallationTrendRow[] }) {
  const rowsByDate = new Map<string, InstallationTrendRow[]>();
  for (const row of options.rows) {
    const rows = rowsByDate.get(row.date) ?? [];
    rows.push(row);
    rowsByDate.set(row.date, rows);
  }
  return Array.from({ length: options.days }, (_, index) => {
    const day = new Date(options.start);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    const platforms = platformCounts((rowsByDate.get(date) ?? []).map((row) => ({
      name: row.platform, count: row.count,
    })));
    return { date, total: platforms.reduce((sum, platform) => sum + platform.value, 0), platforms };
  });
}
