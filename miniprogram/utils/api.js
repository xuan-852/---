const app = getApp();

// ─── 连接状态管理（防抖动） ───
let _failCount = 0;               // 连续失败次数
const _FAIL_THRESHOLD = 2;        // 连续 N 次才标记离线
let _heartbeatTimer = null;       // 定时器
const _HEARTBEAT_MS = 25000;      // 25s 一次心跳

function _startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(_doPing, _HEARTBEAT_MS);
}

function _doPing() {
  wx.request({
    url: app.globalData.serverUrl + '/api/ping',
    method: 'GET',
    timeout: 5000,
    success: () => {
      _failCount = 0;
      app.globalData.connected = true;
    },
    fail: () => {
      _failCount++;
      if (_failCount >= _FAIL_THRESHOLD) {
        app.globalData.connected = false;
      }
    }
  });
}

/** 任意请求成功时重置失败计数 */
function _resetFailCount() {
  _failCount = 0;
}

// 缓存 key 前缀
const CACHE_PREFIX = 'njust_cache_';
const CACHE_KEYS = {
  SCHEDULE: CACHE_PREFIX + 'schedule',
  SCORES: CACHE_PREFIX + 'scores',
  EXAMS: CACHE_PREFIX + 'exams',
  REMINDERS: CACHE_PREFIX + 'reminders',
  STATUS: CACHE_PREFIX + 'status'
};

/**
 * 带缓存回退的网络请求核心函数
 * 1. 优先网络请求（带超时）
 * 2. 成功 → 写缓存 + 标记 connected
 * 3. 失败 → 读缓存（有则静默返回，无则 reject）
 *
 * 注意：请求超时不代表服务器离线（可能是刷新等耗时操作），
 * 因此 fail 时不设置 connected=false，由专门的健康检查判定。
 */
function request(path, options = {}) {
  const url = app.globalData.serverUrl + path;
  const token = app.globalData.token;
  const cacheKey = options.cacheKey;
  const timeout = options.timeout || 15000; // 默认 15s，覆盖式传入

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      timeout,
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.status === 'ok') {
          app.globalData.connected = true;
          _resetFailCount();
          // 写缓存
          if (cacheKey) {
            try {
              wx.setStorageSync(cacheKey, {
                data: res.data.data,
                time: Date.now()
              });
            } catch (e) { /* 存储满忽略 */ }
          }
          resolve(res.data.data);
        } else {
          // 服务器返回错误（非网络问题）
          const msg = (res.data && res.data.message) || '请求失败';
          reject(new Error(msg));
        }
      },
      fail: (err) => {
        // 只读缓存，不修改 connected 状态（避免刷新超时误判离线）
        if (cacheKey) {
          try {
            const cached = wx.getStorageSync(cacheKey);
            if (cached && cached.data) {
              console.log('[缓存] 命中:', cacheKey);
              resolve(cached.data);
              return;
            }
          } catch (e) { /* 缓存不可用 */ }
        }
        const errMsg = (err && err.errMsg) || '请求失败';
        reject(new Error(errMsg));
      }
    });
  });
}

/**
 * 快速健康检查 — 仅用于设置页诊断
 * 成功时重置失败计数 + 启动后台心跳
 * 单次失败不标记离线（由心跳 + 失败阈值判定）
 */
function checkConnection() {
  // 确保心跳已启动
  _startHeartbeat();
  return new Promise((resolve) => {
    const url = app.globalData.serverUrl + '/api/ping';
    wx.request({
      url,
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        const ok = res.data && res.data.status === 'ok';
        if (ok) {
          _failCount = 0;
          app.globalData.connected = true;
        }
        resolve(ok);
      },
      fail: () => {
        resolve(false);
      }
    });
  });
}

module.exports = {
  // ─── 用户 ───
  getUserStatus: () => request('/api/user/status', { cacheKey: CACHE_KEYS.STATUS }),

  bindAccount: (username, password) => request('/api/user/bind', {
    method: 'POST',
    data: { username, password }
  }),

  refreshData: () => request('/api/refresh', { method: 'POST', timeout: 120000 }),

  // ─── 课表（按周） ───
  getSchedule: (week) => request('/api/schedule', {
    data: { week },
    cacheKey: CACHE_KEYS.SCHEDULE + '_' + week
  }),

  // ─── 成绩 ───
  getScores: () => request('/api/scores', { cacheKey: CACHE_KEYS.SCORES }),

  // ─── 考试安排 ───
  getExams: () => request('/api/exams', { cacheKey: CACHE_KEYS.EXAMS }),

  // ─── 桌面便签 ───
  getReminders: () => request('/api/reminders', { cacheKey: CACHE_KEYS.REMINDERS }),

  // ─── 手动推送（测试用） ───
  pushMessage: (type, title, body) => request('/api/push', {
    method: 'POST',
    data: { type, title, body }
  }),

  // ─── 工具：获取连接状态 ───
  getConnectionStatus: () => app.globalData.connected,

  // ─── 工具：主动检测连接（健康检查） ───
  checkConnection,

  // ─── 工具：获取最后更新时间 ───
  getCachedTime: (cacheKey) => {
    try {
      const cached = wx.getStorageSync(cacheKey);
      return cached ? cached.time : null;
    } catch (e) { return null; }
  }
};

// 模块加载时自动启用心跳
_startHeartbeat();
