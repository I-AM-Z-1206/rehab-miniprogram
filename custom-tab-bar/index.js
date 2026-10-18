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
      { pagePath: '/pages/index/index', text: '首页', icon: '/assets/icons/house-gray.png', iconOn: '/assets/icons/house-teal.png' },
      { pagePath: '/pages/games/games', text: '游戏', icon: '/assets/icons/gamepad-2-gray.png', iconOn: '/assets/icons/gamepad-2-teal.png' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: '/assets/icons/user-round-gray.png', iconOn: '/assets/icons/user-round-teal.png' }
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
