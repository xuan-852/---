// 周课表
const api = require('../../utils/api');

Page({
  data: {
    currentWeek: 1,
    days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    scheduleData: {}
  },

  onLoad() {
    this.loadSchedule();
  },

  async loadSchedule() {
    try {
      const data = await api.getSchedule(this.data.currentWeek);
      const scheduleData = {};
      for (const course of data.courses) {
        const day = course.day;
        if (!scheduleData[day]) scheduleData[day] = [];
        scheduleData[day].push(course);
      }
      this.setData({ scheduleData });
    } catch (e) {
      console.error('加载课表失败:', e);
    }
  },

  prevWeek() {
    if (this.data.currentWeek > 1) {
      this.setData({ currentWeek: this.data.currentWeek - 1 });
      this.loadSchedule();
    }
  },

  nextWeek() {
    this.setData({ currentWeek: this.data.currentWeek + 1 });
    this.loadSchedule();
  }
});
