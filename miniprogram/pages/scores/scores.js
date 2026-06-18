// 成绩页面
const api = require('../../utils/api');

Page({
  data: {
    scores: [],
    gpa: 0
  },

  onLoad() {
    this.loadScores();
  },

  async loadScores() {
    try {
      const data = await api.getScores();
      const scores = data.scores || [];
      // 只计算数字成绩的绩点
      const numericScores = scores.filter(s => typeof s.score === 'number' || !isNaN(parseFloat(s.score)));
      const totalPoints = numericScores.reduce((sum, s) => sum + parseFloat(s.score) * s.credit, 0);
      const totalCredits = numericScores.reduce((sum, s) => sum + s.credit, 0);
      // 5.0 绩点制: GPA = 加权平均分 / 20
      const gpa = totalCredits > 0 ? (totalPoints / totalCredits / 20) : 0;
      this.setData({
        scores,
        gpa: gpa.toFixed(2)
      });
    } catch (e) {
      console.error('加载成绩失败:', e);
    }
  }
});
