App({
  globalData: {
    serverUrl: 'https://cross-churn-distance.ngrok-free.dev', // 引导用，onLaunch 中从 /api/config 覆盖
    token: 'mini_secret_token_here',  // 与 .env 保持一致
    userInfo: null,
    connected: true  // true=在线, false=离线(用缓存)
  },

  onLaunch() {
    // 自动判断运行环境：开发者工具直连 localhost
    try {
      const platform = wx.getSystemInfoSync().platform;
      // 非移动端（devtools/windows/mac）直连 localhost
      if (platform !== 'ios' && platform !== 'android') {
        this.globalData.serverUrl = 'http://localhost:3000';
      }
    } catch (e) { /* 忽略 */ }

    // 从服务端获取动态配置（如更换 ngrok 域名后无需发版）
    this._fetchConfig();
  },

  /** 拉取 /api/config，用服务端下发的 serverUrl 覆盖本地硬编码 */
  _fetchConfig() {
    // 开发者工具直连 localhost，不覆盖（否则会换成 ngrok 公网地址导致断连）
    if (this.globalData.serverUrl.includes('localhost')) return;

    const bootstrapUrl = this.globalData.serverUrl;
    wx.request({
      url: bootstrapUrl + '/api/config',
      method: 'GET',
      timeout: 5000,
      header: { 'ngrok-skip-browser-warning': 'true' },
      success: (res) => {
        if (res.data && res.data.status === 'ok' && res.data.data) {
          const cfg = res.data.data;
          if (cfg.serverUrl) {
            this.globalData.serverUrl = cfg.serverUrl;
          }
        }
      },
      fail: () => {
        // 配置拉取失败不影响使用，保持当前 serverUrl
      }
    });
  }
});
