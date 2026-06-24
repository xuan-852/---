// 便签 — 与 AI 桌宠联动
const api = require('../../utils/api');

const CATEGORIES = [
  { key: 'default', label: '📋 通用', color: '#7c4dff' },
  { key: 'exam', label: '📝 考试', color: '#ff4d6d' },
  { key: 'study', label: '📚 学习', color: '#4dff88' },
  { key: 'life', label: '🎯 生活', color: '#ff884d' },
  { key: 'work', label: '💼 工作', color: '#4dd4ff' },
  { key: 'health', label: '❤️ 健康', color: '#ff6b9d' },
];

const PRIORITY_MAP = {
  0: { label: '普通', color: '#888' },
  1: { label: '重要', color: '#ff9800' },
  2: { label: '紧急', color: '#ff4444' },
};

Page({
  data: {
    reminders: [],
    categories: CATEGORIES,
    priorityMap: PRIORITY_MAP,
    activeCategory: '',           // '' = 全部
    connected: true,
    loading: true,

    // 新建便签表单
    showForm: false,
    formText: '',
    formPriority: 0,
    formCategory: 'default',
    formRemindAt: '',
    submitting: false,

    // 编辑模式
    editingId: null,
  },

  onShow() {
    this.setData({ connected: getApp().globalData.connected });
    this.loadReminders();
  },

  async loadReminders() {
    this.setData({ loading: true });
    try {
      const params = {};
      if (this.data.activeCategory) params.category = this.data.activeCategory;
      const data = await api.getReminders(params);
      this.setData({ reminders: data.reminders || [], loading: false });
    } catch (e) {
      // 尝试从缓存加载
      try {
        const cached = wx.getStorageSync('njust_cache_reminders');
        if (cached && cached.data) {
          this.setData({ reminders: cached.data.reminders || [], loading: false });
        } else {
          this.setData({ loading: false });
        }
      } catch (e2) {
        this.setData({ loading: false });
      }
      console.error('[便签] 加载失败:', e.message);
    }
  },

  // ─── 筛选 ───
  filterByCategory(e) {
    const cat = e.currentTarget.dataset.category;
    this.setData({ activeCategory: cat === this.data.activeCategory ? '' : cat }, () => {
      this.loadReminders();
    });
  },

  // ─── 新建/编辑 ───
  openNewForm() {
    this.setData({
      showForm: true,
      editingId: null,
      formText: '',
      formPriority: 0,
      formCategory: 'default',
      formRemindAt: '',
    });
  },

  openEditForm(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showForm: true,
      editingId: item.id,
      formText: item.text,
      formPriority: item.priority || 0,
      formCategory: item.category || 'default',
      formRemindAt: item.remind_at || '',
    });
  },

  closeForm() {
    this.setData({ showForm: false, editingId: null });
  },

  onTextInput(e) { this.setData({ formText: e.detail.value }); },
  onPriorityChange(e) { this.setData({ formPriority: parseInt(e.detail.value) }); },
  onCategoryChange(e) {
    const index = parseInt(e.detail.value);
    const key = CATEGORIES[index]?.key || 'default';
    this.setData({ formCategory: key });
  },
  onRemindAtInput(e) { this.setData({ formRemindAt: e.detail.value }); },
  noop() { /* 阻止冒泡 */ },

  async submitForm() {
    const { formText, formPriority, formCategory, formRemindAt, editingId } = this.data;
    if (!formText.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (editingId) {
        await api.updateReminder(editingId, {
          text: formText.trim(),
          priority: formPriority,
          category: formCategory,
          remind_at: formRemindAt || null,
        });
      } else {
        await api.createReminder({
          text: formText.trim(),
          priority: formPriority,
          category: formCategory,
          remind_at: formRemindAt || null,
        });
      }
      wx.showToast({ title: editingId ? '已更新' : '已创建', icon: 'success' });
      this.setData({ showForm: false, editingId: null });
      this.loadReminders();
    } catch (e) {
      wx.showToast({ title: '操作失败: ' + e.message, icon: 'none' });
    }
    this.setData({ submitting: false });
  },

  // ─── 完成/取消完成 ───
  async toggleDone(e) {
    const item = e.currentTarget.dataset.item;
    const newDone = !item.done;
    try {
      await api.toggleReminder(item.id, newDone);
      this.loadReminders();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ─── 删除 ───
  async deleteReminder(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '确认删除',
      content: `删除「${item.text}」?`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteReminder(item.id);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadReminders();
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ─── 刷新 ───
  onRefresh() {
    wx.showToast({ title: '同步中...', icon: 'loading' });
    this.loadReminders();
  },

  // ─── 统计 ───
  getPendingCount() {
    return this.data.reminders.filter(r => !r.done).length;
  },

  getCategoryLabel(key) {
    const c = CATEGORIES.find(x => x.key === key);
    return c ? c.label : '📋 通用';
  },
});
