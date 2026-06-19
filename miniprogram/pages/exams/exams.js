// 考试安排
const api = require('../../utils/api');

Page({
  data: {
    exams: [],
    connected: true,
    hasCache: false
  },

  onLoad() {
    const app = getApp();
    this.setData({ connected: app.globalData.connected });
    this.loadExams();
  },

  onShow() {
    const app = getApp();
    this.setData({ connected: app.globalData.connected });
  },

  async loadExams() {

    // 先读缓存
    try {
      const cached = wx.getStorageSync('njust_cache_exams');
      if (cached && cached.data) {
        this.setData({ exams: cached.data.exams || [], hasCache: true });
      }
    } catch (e) { /* ignore */ }

    // 网络更新
    try {
      const data = await api.getExams();
      this.setData({
        exams: data.exams || [],
        hasCache: true
      });
    } catch (e) {
      // 网络不通——不标记离线，缓存已在上面预加载
      if (!this.data.hasCache) {
        console.error('加载考试安排失败:', e);
      }
    }
  }
});
