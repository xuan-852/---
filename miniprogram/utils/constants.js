// 学期配置 - 每学期更新此文件即可
const SEMESTERS = [
  // 格式: { start: 'MM-DD', weeks: 总周数, label: '2024-2025-1' }
  { start: '2025-09-01', weeks: 20, label: '2025-2026-1' }, // 秋季
  { start: '2026-02-23', weeks: 20, label: '2025-2026-2' }, // 春季(当前)
  { start: '2026-09-07', weeks: 20, label: '2026-2027-1' }  // 秋季(预备)
];

/**
 * 根据当前日期自动计算学期和当前周
 * @returns {{ week: number, maxWeek: number, semester: string }}
 */
function getCurrentWeekInfo() {
  const now = new Date();
  const currentYear = now.getFullYear();

  for (const s of SEMESTERS) {
    const start = new Date(s.start);
    const end = new Date(start);
    end.setDate(end.getDate() + s.weeks * 7);

    if (now >= start && now < end) {
      const diff = now - start;
      const week = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
      return { week: Math.max(1, week), maxWeek: s.weeks, semester: s.label };
    }
  }

  // 不在学期内 → 找最近的学期
  let nearest = SEMESTERS[1] || SEMESTERS[0];
  for (const s of SEMESTERS) {
    const start = new Date(s.start);
    if (Math.abs(now - start) < Math.abs(now - new Date(nearest.start))) {
      nearest = s;
    }
  }
  const start = new Date(nearest.start);
  const diff = now - start;
  const week = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
  return { week: Math.max(1, week), maxWeek: nearest.weeks, semester: nearest.label };
}

module.exports = { getCurrentWeekInfo, SEMESTERS };
