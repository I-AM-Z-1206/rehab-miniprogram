// games.js —— 游戏中心：5 款体感游戏入口
// 已实现：射击（FR-GAME-01）→ pages/shoot
const { selectTab } = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')

Page({
  data: {
    // 静态保持训练：保持身体姿态在目标范围内
    staticGames: [
      { id: 'shooting', icon: '/assets/icons/target-blue.png', title: '射击', desc: '保持身体在目标范围内瞄准得分', ready: true },
      { id: 'wire', icon: '/assets/icons/waves-blue.png', title: '走钢丝', desc: '动态平衡，保险绳容错' },
      { id: 'fruit', icon: '/assets/icons/apple-blue.png', title: '接水果', desc: '保持自身位置于有效范围内接取水果' }
    ],
    // 动态训练：通过主动位移完成挑战
    dynamicGames: [
      { id: 'racing', icon: '/assets/icons/car-orange.png', title: '赛车', desc: '通过前后左右位移控制车辆' },
      { id: 'rhythm', icon: '/assets/icons/music-orange.png', title: '节奏训练', desc: '随音乐节奏左右移动接取音符' }
    ]
  },

  onShow() {
    selectTab(this, 1)
  },

  onGameTap(e) {
    const { id, title } = e.currentTarget.dataset
    if (id === 'shooting') {
      wx.navigateTo({
        url: '/pages/shoot/shoot',
        fail: (err) => {
          console.error('navigateTo shoot fail:', err)
          wx.showToast({ title: '页面打开失败', icon: 'none' })
        }
      })
      return
    }
    console.log('[games] 入口点击：', id)
    speaker.speak(title + '，开发中，敬请期待')
    wx.showToast({ title: '「' + title + '」开发中，敬请期待', icon: 'none' })
  }
})
