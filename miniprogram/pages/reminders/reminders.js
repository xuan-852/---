// 桌面便签
const api = require('../../utils/api');

Page({
  data: {
    reminders: []
  },

  onShow() {
    this.loadReminders();
  },

  async loadReminders() {
    try {
      const data = await api.getReminders();
      this.setData({ reminders: data.reminders || [] });
    } catch (e) {
      console.error('加载便签失败:', e);
    }
  }
});
