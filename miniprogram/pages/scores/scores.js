// 成绩页面 - 按学期分组
const api = require('../../utils/api');

Page({
  data: {
    semesters: [],
    expanded: {},
    totalGpa: 0,
    totalCredits: 0,
    connected: true,
    hasCache: false
  },

  onLoad() {
    const app = getApp();
    this.setData({ connected: app.globalData.connected });
    this.loadScores();
  },

  onShow() {
    const app = getApp();
    this.setData({ connected: app.globalData.connected });
  },

  toggleSemester(e) {
    const semester = e.currentTarget.dataset.semester;
    const key = 'expanded.' + semester;
    this.setData({ [key]: !this.data.expanded[semester] });
  },

  async loadScores() {

    // 先读缓存
    try {
      const cached = wx.getStorageSync('njust_cache_scores');
      if (cached && cached.data) {
        this._renderScores(cached.data);
        this.setData({ hasCache: true });
      }
    } catch (e) { /* ignore */ }

    // 网络更新
    try {
      const data = await api.getScores();
      this._renderScores(data);
      this.setData({ hasCache: true });
    } catch (e) {
      // 网络不通——不标记离线，缓存已在上面预加载
      if (!this.data.hasCache) {
        console.error('加载成绩失败:', e);
      }
    }
  },

  _renderScores(data) {
    const allScores = data.scores || [];

    // 按学期分组
    const groups = {};
    for (const s of allScores) {
      const sem = s.semester || '未知学期';
      if (!groups[sem]) groups[sem] = [];
      groups[sem].push(s);
    }

    // 百分制 → 4.0 绩点
    function toGpaPoint(score) {
      const val = parseFloat(score);
      if (isNaN(val) || val < 60) return 0;
      const g = (val - 50) / 10;
      return Math.min(g, 4.0);
    }

    // 计算每个学期的 GPA 和学分
    const semesters = Object.entries(groups).map(([sem, scores]) => {
      const numeric = scores.filter(s => !isNaN(parseFloat(s.score)));
      const totalGpaPoints = numeric.reduce((sum, s) => sum + toGpaPoint(s.score) * s.credit, 0);
      const totalCredits = numeric.reduce((sum, s) => sum + s.credit, 0);
      const gpa = totalCredits > 0 ? (totalGpaPoints / totalCredits) : 0;
      return {
        semester: sem,
        scores,
        count: scores.length,
        gpa: gpa.toFixed(2),
        totalCredits
      };
    }).sort((a, b) => b.semester.localeCompare(a.semester)); // 最新学期在前

    // 总 GPA（4.0 制加权）
    const allNumeric = allScores.filter(s => !isNaN(parseFloat(s.score)));
    const totalGP = allNumeric.reduce((sum, s) => sum + toGpaPoint(s.score) * s.credit, 0);
    const totalC = allNumeric.reduce((sum, s) => sum + s.credit, 0);
    const totalGpa = totalC > 0 ? (totalGP / totalC) : 0;

    // 默认展开第一个（最新）学期
    const expanded = {};
    if (semesters.length > 0) expanded[semesters[0].semester] = true;

    this.setData({
      semesters,
      expanded,
      totalGpa: totalGpa.toFixed(2),
      totalCredits: totalC
    });
  }
});
