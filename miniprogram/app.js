App({
  globalData: {
    serverUrl: 'https://cross-churn-distance.ngrok-free.dev', // 默认 ngrok，onLaunch 中覆盖
    token: 'mini_secret_token_here',  // 与 .env 保持一致
    userInfo: null,
    connected: true  // true=在线, false=离线(用缓存)
  },

  onLaunch() {
    // 自动判断运行环境：开发者工具直连 localhost，真机走 ngrok
    try {
      const platform = wx.getSystemInfoSync().platform;
      if (platform === 'windows' || platform === 'mac') {
        this.globalData.serverUrl = 'http://localhost:3000';
      }
    } catch (e) { /* 忽略，保持默认 ngrok */ }
  }
});
