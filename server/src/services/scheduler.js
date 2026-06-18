const { getDB } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

/**
 * 定时任务管理器
 * 目前预留接口，后续添加：
 * - 每天凌晨抓取新课表
 * - 每小时检查新成绩
 * - 考试前提醒
 */

function startScheduler() {
  console.log('[Scheduler] 定时任务启动');

  // 每天早上 6:00 检查当天课表 → 推送给桌面端
  scheduleDailyCheck();
}

function scheduleDailyCheck() {
  const now = new Date();
  const msUntil6am = getMsUntil(6, 0);

  setTimeout(() => {
    pushTodaySchedule();
    // 之后每 24 小时执行一次
    setInterval(pushTodaySchedule, 24 * 60 * 60 * 1000);
  }, msUntil6am);

  console.log(`[Scheduler] 下次课表推送: ${msUntil6am / 1000 / 60} 分钟后`);
}

function pushTodaySchedule() {
  try {
    const db = getDB();
    const now = new Date();
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=周一
    const week = getCurrentWeek(); // TODO: 根据学期起始计算

    const courses = db.prepare(
      'SELECT * FROM courses WHERE week = ? AND day = ? ORDER BY start_slot'
    ).all(week, day);

    if (courses.length === 0) return;

    const lines = courses.map(c =>
      `${c.start_time}-${c.end_time} ${c.name} @${c.location}`
    );

    const id = uuidv4();
    db.run(
      `INSERT INTO push_messages (id, type, title, body) VALUES (?, 'schedule_reminder', '📚 今日课表', ?)`,
      [id, lines.join('\n')]
    );

    console.log('[Scheduler] 已推送今日课表');
  } catch (e) {
    console.error('[Scheduler] 推送课表失败:', e.message);
  }
}

function getMsUntil(hour, min) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, min, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function getCurrentWeek() {
  // TODO: 根据学期起始日期计算
  // 暂时返回第 1 周
  return 1;
}

module.exports = { startScheduler };
