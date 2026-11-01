// games.js —— 游戏中心：5 款体感游戏入口
// 已实现：射击（FR-GAME-01）→ pages/shoot
const { selectTab, openPage } = require('../../utils/tab.js')

// 五个入口的目标页。图标与文案在上面的 data 里，路由单独一张表 ——
// 加游戏时只要往这里补一行，不用改点击逻辑。
const ROUTES = {
  shooting: '/pkgShoot/pages/shoot/shoot',
  racing: '/pkgRace/pages/race/race',
  wire: '/pkgWire/pages/wire/wire',
  fruit: '/pkgFruit/pages/fruit/fruit',
  rhythm: '/pkgRhythm/pages/rhythm/rhythm'
}

Page({
  data: {
    // 静态保持训练：保持身体姿态在目标范围内
    staticGames: [
      { id: 'shooting', icon: '/assets/icons/target-blue.png', title: '射击', desc: '保持身体在目标范围内瞄准得分' },
      { id: 'wire', icon: '/assets/icons/waves-blue.png', title: '走钢丝', desc: '动态平衡，保险绳容错' }
    ],
    // 动态训练：通过主动位移完成挑战
    dynamicGames: [
      { id: 'racing', icon: '/assets/icons/car-orange.png', title: '赛车', desc: '前后左右位移驾驶赛车，霓虹赛道' },
      { id: 'rhythm', icon: '/assets/icons/music-orange.png', title: '节奏训练', desc: '随音乐节拍左右移动，接住落下的音符' },
      { id: 'fruit', icon: '/assets/icons/apple-blue.png', title: '接水果', desc: '左右倾身移动果篮，把水果接进篮子' }
    ]
  },

  onShow() {
    selectTab(this, 1)
  },

  // 走 openPage：它带连点保护（连点两下不会叠两层页面）和统一的失败提示
  onGameTap(e) {
    const id = e.currentTarget.dataset.id
    const url = ROUTES[id]
    if (!url) {
      // 理论上不会走到：data 里每个 id 都在 ROUTES 里有对应项
      console.warn('[games] 未配置路由：', id)
      wx.showToast({ title: '这个游戏还没做好', icon: 'none' })
      return
    }
    openPage(url)
  }
})
