// custom-tab-bar —— 底部导航栏（自定义 tabBar）
// Skyline 模式下注意事项：
//  1. 根节点需 pointer-events: auto + position: absolute（见 index.wxss）
//  2. 页面/组件通过 getTabBar(callback) 异步获取本实例来更新选中态
Component({
  data: {
    selected: 0,
    color: '#8b8f9a',
    selectedColor: '#0f9c8c',
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
      { pagePath: '/pages/rehab/rehab', text: '康复', icon: '🏅' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: '👤' }
    ]
  },

  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const path = e.currentTarget.dataset.path
      if (!path) return
      // 立即高亮，避免 switchTab 过程中出现短暂错位
      this.setData({ selected: index })
      wx.switchTab({
        url: path,
        fail: (err) => console.error('switchTab fail:', err)
      })
    }
  }
})
