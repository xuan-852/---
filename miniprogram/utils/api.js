const app = getApp();

function request(path, options = {}) {
  const url = app.globalData.serverUrl + path;
  const token = app.globalData.token;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.status === 'ok') {
          resolve(res.data.data);
        } else {
          reject(new Error(res.data.message || '请求失败'));
        }
      },
      fail: reject
    });
  });
}

module.exports = {
  // 课表
  getSchedule: (week) => request('/schedule', { data: { week } }),

  // 成绩
  getScores: () => request('/scores'),

  // 考试安排
  getExams: () => request('/exams'),

  // 桌面便签
  getReminders: () => request('/reminders'),

  // 手动推送（测试用）
  pushMessage: (type, title, body) => request('/push', {
    method: 'POST',
    data: { type, title, body }
  })
};
