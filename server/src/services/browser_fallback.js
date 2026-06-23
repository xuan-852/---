/**
 * Plan C: 临时浏览器直连方案
 *
 * ===== 作用 =====
 * 当 Bridge（Plan A）不可用时，启动一个一次性 headless 浏览器，
 * 走 eHall → IDS → bkjw 完整登录链抓取数据。
 * 抓取完毕即关闭，不持久化。
 *
 * ===== 使用场景 =====
 * - Bridge 进程挂了或未启动
 * - Bridge 自动重登失败（验证码卡住）
 * - 服务器刚重启，Bridge 尚未就绪
 *
 * ===== 特点 =====
 * - headless: false（Windows 最小窗口，避免被反爬检测）
 * - 每次用完关闭，不留 session
 * - 依赖本地已存储的凭据（从主服务器 API 获取）
 */

const { chromium } = require('playwright');
const axios = require('axios');
const log = require('../utils/logger');

const MAIN_SERVER = 'http://localhost:3000';
const EHALL_URL = 'http://ehall.njust.edu.cn';
const EHALL2_URL = 'https://ehall2.njust.edu.cn';
const BKJW_BASE = 'http://bkjw.njust.edu.cn/njlgdx';

/**
 * Plan C 入口：启动临时浏览器，走 eHall → IDS → bkjw 全链路抓取
 *
 * @param {string} username 教务学号
 * @param {string} password 教务密码
 * @returns {Promise<{scores: Array, schedule: Object, exams: Array}>}
 */
async function fetchWithTempBrowser(username, password) {
  log.info('[PlanC] 🚀 启动临时浏览器抓取（Plan C fallback）...');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: [
      '--start-minimized',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1024,768',
    ],
  });

  let context, page;
  try {
    context = await browser.newContext({
      locale: 'zh-CN',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    });
    page = await context.newPage();

    // ===== Step 1: 访问 eHall2，触发 IDS 重定向 =====
    log.info('[PlanC]   导航到 eHall2...');
    await page.goto(EHALL2_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    log.info(`[PlanC]   当前页: ${page.url()}`);

    // ===== Step 2: IDS 登录 =====
    const currentUrl = page.url();
    if (currentUrl.includes('ids.njust.edu.cn')) {
      log.info('[PlanC]   在 IDS 登录页，填写凭据...');
      await doIDSStep1_IDSLogin(page, username, password);
    } else {
      // 可能在 eHall 首页未登录
      log.info('[PlanC]   eHall 页面，点击登录...');
      await doIDSStep1_ClickLogin(page, username, password);
    }

    // ===== Step 3: 进 eHall2 后找教务入口 =====
    log.info('[PlanC]   查找教务系统入口...');
    const bkjwPage = await doIDSStep2_EnterBKJW(page, context);
    if (bkjwPage === false) {
      // 被重定向到 IDS，尝试重新登录
      if (page.url().includes('ids.njust.edu.cn')) {
        log.info('[PlanC]   ⚠️ 会话过期，重新登录 IDS...');
        await doIDSStep1_IDSLogin(page, username, password);
        // 重新尝试进入
        const retryPage = await doIDSStep2_EnterBKJW(page, context);
        if (!retryPage) throw new Error('重新登录后仍无法进入教务系统');
        page = retryPage;
      } else {
        throw new Error('无法找到教务系统入口');
      }
    } else {
      page = bkjwPage;  // 可能已切换到新标签页
    }
    log.info(`[PlanC]   📄 当前页: ${page.url()}`);

    // ===== Step 4: 抓取数据 =====
    log.info('[PlanC]   开始抓取数据...');
    const scores = await doIDSStep3_FetchScores(page);
    const schedule = await doIDSStep3_FetchSchedule(page);
    const exams = await doIDSStep3_FetchExams(page);

    log.info(`[PlanC]   ✅ 抓取完成: ${scores.length} 条成绩, ${Object.keys(schedule).length} 项课表, ${exams.length} 门考试`);

    return { scores, schedule, exams };
  } catch (e) {
    log.error(`[PlanC] ❌ 抓取失败: ${e.message}`);
    throw e;
  } finally {
    // 关闭浏览器
    if (browser) {
      try {
        await browser.close();
        log.info('[PlanC]   🧹 临时浏览器已关闭');
      } catch (e) { /* ignore */ }
    }
  }
}

// ===== IDS 登录 =====

/** 场景1: 页面已经在 IDS 登录页 */
async function doIDSStep1_IDSLogin(page, username, password) {
  await page.waitForSelector('#username, input[name="username"]', { timeout: 10000 });

  // 检查验证码
  const hasCaptcha = await page.evaluate(() => !!document.querySelector('#captcha, img[src*="captcha"]'));
  if (hasCaptcha) {
    log.warn('[PlanC]   ⚠️ IDS 需要验证码！尝试用无验证码表单提交...');
  }

  // 填用户名
  const nameInput = await page.$('#username, input[name="username"], input[type="text"]');
  if (!nameInput) throw new Error('找不到用户名输入框');
  await nameInput.fill('');
  await nameInput.fill(username);

  // 填密码
  const pwdInput = await page.$('#password, input[name="password"], input[type="password"]');
  if (!pwdInput) throw new Error('找不到密码输入框');
  await pwdInput.fill('');
  await pwdInput.fill(password);

  await page.waitForTimeout(500);

  // 提交
  const btn = await page.$('#submitBtn, button[type="submit"], .login-btn, input[type="submit"]');
  if (btn) await btn.click();
  else await page.keyboard.press('Enter');

  await page.waitForTimeout(5000);

  // 检查结果
  if (page.url().includes('ids.njust.edu.cn')) {
    const errText = await page.evaluate(() => {
      const el = document.querySelector('#showErrorTip, .error-tip, #msg');
      return el ? el.textContent.trim() : '';
    });
    if (errText) throw new Error(`IDS 登录失败: ${errText}`);
    throw new Error('IDS 登录后仍在登录页（可能需要验证码）');
  }
  log.info('[PlanC]   ✅ IDS 登录通过');
}

/** 场景2: 在 eHall 首页，点击登录 */
async function doIDSStep1_ClickLogin(page, username, password) {
  // 找登录按钮
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('a, button, .login-btn, .login');
    for (const btn of btns) {
      if ((btn.textContent || '').includes('登录')) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    // 可能已登录
    log.info('[PlanC]   未找到登录按钮，可能已登录');
    return;
  }

  await page.waitForTimeout(3000);

  if (page.url().includes('ids.njust.edu.cn')) {
    await doIDSStep1_IDSLogin(page, username, password);
  }
}

// ===== 进入教务系统（eHall2 SPA 路径） =====

/**
 * 在 eHall2 SPA 中找到教务系统入口并点击
 * 
 * 使用已验证的 eHall2 SPA 路径：
 *   1. 导航到 eHall2 SPA
 *   2. 关闭弹窗遮挡
 *   3. 导航到搜索页 #/searchPage
 *   4. 在 iframe 中找「教务系统（师生端）」并点击
 *   5. eHall2 会在新标签页打开 BKJW
 * 
 * @param {Page} page 当前页面
 * @param {BrowserContext} context 浏览器 context
 * @returns {Promise<Page|false>} BKJW 的 page 对象，失败返回 false
 */
async function doIDSStep2_EnterBKJW(page, context) {
  log.info('[PlanC]   使用 eHall2 SPA 路径进入教务系统...');

  // Step 1: 导航到 eHall2 SPA
  await page.goto(`${EHALL2_URL}/index.html`, {
    waitUntil: 'domcontentloaded', timeout: 20000
  });
  await page.waitForTimeout(3000);

  // Step 2: 关闭弹窗遮挡
  await page.evaluate(() => {
    document.querySelectorAll('.we-dialog__wrapper, .v-modal, .el-dialog__wrapper').forEach(d => d.remove());
  });

  // Step 3: 导航到搜索页
  await page.goto(`${EHALL2_URL}/index.html#/searchPage`, {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(3000);

  // Step 4: 在 iframe 中找「教务系统（师生端）」并点击
  const clicked = await page.evaluate(() => {
    // 再次关闭弹窗
    document.querySelectorAll('.we-dialog__wrapper, .v-modal, .el-dialog__wrapper').forEach(d => d.remove());

    const f = document.getElementById('template-container');
    if (!f) return 'no-iframe';
    try {
      const doc = f.contentDocument || f.contentWindow.document;
      if (!doc) return 'iframe-not-accessible';

      const all = doc.querySelectorAll('*');
      for (const el of all) {
        const text = (el.textContent || '').trim();
        if (text === '教务系统（师生端）' && el.offsetWidth > 0 && el.offsetHeight > 0) {
          el.click();
          return 'clicked';
        }
      }
      return 'not-found';
    } catch (e) {
      return 'error: ' + e.message;
    }
  });

  if (clicked === 'clicked') {
    log.info('[PlanC]   ✅ 已点击「教务系统（师生端）」');
  } else {
    log.warn(`[PlanC]   ⚠️ iframe 点击结果: ${clicked}，回退到旧方法`);
    // 回退：直接访问 BKJW
    await page.goto(`${BKJW_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  }

  // Step 5: 等待 BKJW 页面（可能在新标签页）
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const curUrl = page.url();
    if (curUrl.includes('bkjw.njust.edu.cn')) {
      log.info(`[PlanC]   ✅ 已到 BKJW: ${curUrl}`);
      return page;
    }
    // 检查是否被导航到其他需要登录的页面
    if (i === 0 && curUrl.includes('ids.njust.edu.cn')) {
      log.info('[PlanC]   ⚠️ 被重定向到 IDS，需要重新登录');
      return false;  // 让外层处理
    }
  }

  log.info('[PlanC]   ⏳ 检查是否在新标签页...');
  // 如果当前页面不在 BKJW，检查浏览器所有页面
  const allPages = context.pages();
  for (const p of allPages) {
    const url = p.url();
    if (url.includes('bkjw.njust.edu.cn') || url.includes('202.119.81')) {
      log.info(`[PlanC]   🎯 在新标签页找到 BKJW: ${url}`);
      return p;
    }
  }

  return false;
}

// ===== 数据抓取 =====

/** 抓取成绩 */
async function doIDSStep3_FetchScores(page) {
  log.info('[PlanC]   📊 抓取成绩...');
  await page.goto(`${BKJW_BASE}/kscj/cjcx_list`, {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let dt = null;
    for (const t of tables) {
      const r = t.querySelectorAll('tr');
      if (r.length > 3 && r[0]?.querySelectorAll('td,th').length >= 10) { dt = t; break; }
    }
    if (!dt) return [];
    const data = [];
    dt.querySelectorAll('tr').forEach((row, i) => {
      if (i === 0) return;
      const c = row.querySelectorAll('td');
      if (c.length >= 11) data.push({
        semester: c[1].innerText.trim(),
        courseCode: c[2].innerText.trim(),
        courseName: c[3].innerText.trim(),
        score: c[4].innerText.trim(),
        credit: parseFloat(c[6].innerText.trim()) || 0,
        hours: parseInt(c[7].innerText.trim()) || 0,
        examType: c[8].innerText.trim() || '',
        attribute: c[9].innerText.trim(),
        nature: c[10].innerText.trim(),
      });
    });
    return data;
  });
}

/** 抓取课表 */
async function doIDSStep3_FetchSchedule(page) {
  log.info('[PlanC]   📅 抓取课表...');
  await page.goto(`${BKJW_BASE}/xskb/xskb_list.do`, {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(1500);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let st = null;
    for (const t of tables) {
      if (t.innerText.includes('星期一') && t.innerText.includes('星期日')) { st = t; break; }
    }
    if (!st) return {};
    const rows = st.querySelectorAll('tr');
    const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const ps = ['第一大节', '第二大节', '第三大节', '第四大节'];
    const data = {};
    rows.forEach((row, ri) => {
      if (ri === 0) return;
      const cells = row.querySelectorAll('td');
      const p = ps[ri - 1] || `第${ri}大节`;
      cells.forEach((cell, ci) => {
        const d = days[ci]; if (!d) return;
        const t = cell.innerText.trim();
        if (!t || t === '----------------------') return;
        const parts = t.split('----------------------').map(s => s.trim()).filter(Boolean);
        const entries = parts.map(part => {
          const m = part.match(/^(.+?)\s+(\d+(?:[-,]\d+)*\(周\))$/);
          return m ? { course: m[1].trim(), weeks: m[2] } : { course: part, weeks: '' };
        });
        if (entries.length) data[`${p}-${d}`] = entries;
      });
    });
    return data;
  });
}

/** 抓取考试安排 */
async function doIDSStep3_FetchExams(page) {
  log.info('[PlanC]   📝 抓取考试安排...');

  // 访问考试查询页面
  await page.goto(`${BKJW_BASE}/xsks/xsksap_query?Ves632DSdyV=NEW_XSD_KSBM`, {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(2000);

  // 点查询按钮
  const hasBtn = await page.evaluate(() => {
    const btn = document.querySelector('#btn_query');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!hasBtn) {
    log.warn('[PlanC]   ⚠️ 无查询按钮，直接访问列表...');
    await page.goto(`${BKJW_BASE}/xsks/xsksap_list`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
  }
  await page.waitForTimeout(3000);

  return await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    let et = null;
    for (const t of tables) {
      const rows = t.querySelectorAll('tr');
      if (rows.length > 2 && rows[0]?.innerText.includes('课程') && rows[0]?.innerText.includes('考试')) {
        et = t; break;
      }
    }
    if (!et) return [];
    const data = [];
    et.querySelectorAll('tr').forEach((row, i) => {
      if (i === 0) return;
      const c = row.querySelectorAll('td');
      if (c.length >= 7) {
        const timeStr = c[4]?.innerText?.trim() || '';
        let examDate = '', startTime = '', endTime = '';
        const timeMatch = timeStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})~(\d{2}:\d{2})/);
        if (timeMatch) {
          examDate = timeMatch[1];
          startTime = timeMatch[2];
          endTime = timeMatch[3];
        } else {
          examDate = timeStr;
        }
        data.push({
          courseName: c[3]?.innerText?.trim() || '',
          examDate,
          startTime,
          endTime,
          location: c[5]?.innerText?.trim() || '',
          seatNo: c[6]?.innerText?.trim() || '',
          examType: c[1]?.innerText?.trim() || '',
          semester: '',
        });
      }
    });
    return data;
  });
}

module.exports = { fetchWithTempBrowser };
