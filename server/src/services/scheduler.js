const { getDB } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3456';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const MINI_TOKEN = process.env.MINI_TOKEN || '';

/**
 * 定时任务管理器
 * - 每 60 分钟检查桥接服务新成绩
 * - 每天早上 6:00 推送当天课表
 */

function startScheduler() {
  console.log('[Scheduler] 定时任务启动');

  // 每小时检查新成绩 + 考试安排
  scheduleScoreCheck();

  // 每天早上 6:00 推送当天课表
  scheduleDailyCheck();

  // 每 2 小时检查一次即将到来的考试（推送提醒）
  scheduleExamCheck();
}

/** 每 60 分钟从桥接服务刷新成绩 */
function scheduleScoreCheck() {
  const check = async () => {
    if (!BRIDGE_TOKEN || !MINI_TOKEN) {
      console.log('[Scheduler] 桥接服务未配置，跳过自动刷新');
      return;
    }
    try {
      // 先刷新桥接缓存
      await axios.post(`${BRIDGE_URL}/refresh`, {}, {
        headers: { 'x-bridge-token': BRIDGE_TOKEN },
        timeout: 30000,
      });
      // 再拉取成绩写入 DB
      const scoresRes = await axios.get(`${BRIDGE_URL}/scores`, {
        headers: { 'x-bridge-token': BRIDGE_TOKEN },
        timeout: 10000,
      });
      if (scoresRes.data?.ok && Array.isArray(scoresRes.data.data)) {
        const db = getDB();
        let count = 0;
        for (const s of scoresRes.data.data) {
          try {
            db.run(
              `INSERT OR REPLACE INTO scores (semester, course_code, course_name, score, credit, hours, exam_type, attribute, nature)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [s.semester || '', s.courseCode || '', s.courseName || '',
               String(s.score || ''), s.credit || 0, s.hours || 0,
               s.examType || '', s.attribute || '', s.nature || '']
            );
            count++;
          } catch (e) { /* ignore duplicate */ }
        }
        if (count > 0) {
          console.log(`[Scheduler] 🔄 自动刷新: ${count} 条成绩`);
          // 写入推送消息通知桌面端
          const id = uuidv4();
          db.run(
            `INSERT INTO push_messages (id, type, title, body) VALUES (?, 'score_update', '📊 成绩已更新', ?)`,
            [id, `共 ${count} 条成绩已刷新`]
          );
        }
      }

      // 同步考试安排到数据库
      try {
        const examsRes = await axios.get(`${BRIDGE_URL}/exams`, {
          headers: { 'x-bridge-token': BRIDGE_TOKEN },
          timeout: 10000,
        });
        if (examsRes.data?.ok && Array.isArray(examsRes.data.data)) {
          const db = getDB();
          // 清空旧考试安排，全量更新
          db.run('DELETE FROM exams');
          let examCount = 0;
          for (const e of examsRes.data.data) {
            try {
              db.run(
                `INSERT INTO exams (course_name, exam_date, start_time, end_time, location, seat_no)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [e.courseName || '', e.examDate || '', e.startTime || '',
                 e.endTime || '', e.location || '', e.seatNo || '']
              );
              examCount++;
            } catch (ex) { /* ignore */ }
          }
          if (examCount > 0) {
            console.log(`[Scheduler] 📝 已同步 ${examCount} 门考试安排`);
          }
        }
      } catch (ex) {
        // 桥接未就绪时不报错
      }
    } catch (e) {
      // 桥接服务不可用是正常的（比如未登录），不打印错误日志
    }
  };

  // 首次 5 分钟后执行，之后每 60 分钟
  setTimeout(() => { check(); }, 5 * 60 * 1000);
  setInterval(check, 60 * 60 * 1000);
  console.log('[Scheduler] 成绩自动刷新已启动（每 60 分钟）');
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

/** 每 2 小时检查一次未来 3 天内的考试，推送到桌面端 */
function scheduleExamCheck() {
  const check = () => {
    try {
      const db = getDB();
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
      // 未来 3 天的日期
      const threeDaysLater = new Date(now);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const until = threeDaysLater.toISOString().slice(0, 10);

      const exams = db.prepare(
        `SELECT * FROM exams WHERE exam_date >= ? AND exam_date <= ? ORDER BY exam_date, start_time`
      ).all(today, until);

      if (exams.length === 0) return;

      for (const exam of exams) {
        // 先检查这个考试是否已经推送过通知
        const examKey = `exam_${exam.course_name}_${exam.exam_date}`;
        const alreadyPushed = db.prepare(
          `SELECT id FROM push_messages WHERE type = 'exam_reminder' AND payload LIKE ?`
        ).all(`%"examKey":"${examKey}"%`);

        if (alreadyPushed.length > 0) continue; // 已推送过，跳过

        const examDateTime = new Date(`${exam.exam_date}T${exam.start_time}`);
        const diffHours = (examDateTime - now) / (1000 * 60 * 60);
        const diffDays = Math.ceil(diffHours / 24);

        let title, body;
        if (diffDays <= 0) {
          // 今天考试
          title = `📝 今天考试！${exam.course_name}`;
          body = `${exam.course_name}\n⏰ ${exam.start_time}-${exam.end_time}\n📍 ${exam.location || '待定'}${exam.seat_no ? '\n💺 座位号: ' + exam.seat_no : ''}\n⏳ 快复习！`;
        } else if (diffDays === 1) {
          title = `📝 明天考试！${exam.course_name}`;
          body = `${exam.course_name}\n📅 明天 ${exam.start_time}-${exam.end_time}\n📍 ${exam.location || '待定'}${exam.seat_no ? '\n💺 座位号: ' + exam.seat_no : ''}\n⏳ 抓紧复习！`;
        } else {
          title = `📝 ${diffDays}天后考试：${exam.course_name}`;
          body = `${exam.course_name}\n📅 ${exam.exam_date} ${exam.start_time}-${exam.end_time}\n📍 ${exam.location || '待定'}${exam.seat_no ? '\n💺 座位号: ' + exam.seat_no : ''}`;
        }

        const id = uuidv4();
        db.run(
          `INSERT INTO push_messages (id, type, title, body, payload) VALUES (?, 'exam_reminder', ?, ?, ?)`,
          [id, title, body, JSON.stringify({
            examKey,
            courseName: exam.course_name,
            examDate: exam.exam_date,
            startTime: exam.start_time,
            endTime: exam.end_time,
            location: exam.location,
            seatNo: exam.seat_no
          })]
        );

        // 如果是今明两天的考试，额外生成一条复习提醒推送到桌面端的待办
        if (diffDays <= 1) {
          const remindId = uuidv4();
          // 提醒时间为考试前 2 小时（如果现在距离考试超过 2 小时）
          const remindAt = new Date(examDateTime.getTime() - 2 * 60 * 60 * 1000);
          if (remindAt > now) {
            db.run(
              `INSERT INTO push_messages (id, type, title, body, payload) VALUES (?, 'exam_reminder', ?, ?, ?)`,
              [remindId, '📚 复习提醒', `离 ${exam.course_name} 考试还有不到 2 小时，快做最后的冲刺！`, JSON.stringify({ examKey: examKey + '_review', courseName: exam.course_name })]
            );
          }
        }

        console.log(`[Scheduler] 📝 已推送考试提醒: ${exam.course_name} (${exam.exam_date})`);
      }
    } catch (e) {
      console.error('[Scheduler] 考试提醒推送失败:', e.message);
    }
  };

  // 首次 5 分钟后检查，之后每 2 小时
  setTimeout(() => { check(); }, 5 * 60 * 1000);
  setInterval(check, 2 * 60 * 60 * 1000);
  console.log('[Scheduler] 考试提醒已启动（每 2 小时）');
}

module.exports = { startScheduler };
