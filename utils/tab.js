// utils/tab.js —— 底部导航选中态同步 + 统一页面跳转
// 自定义 tabBar 在 Skyline 下通过回调获取实例，在 WebView 下直接返回实例，这里两种都兼容

const KEY_NICKNAME = 'mine_nickname'

// 底部 tab 页路径：这些页面不能用 navigateTo，必须走 switchTab
const TAB_PAGES = [
  '/pages/index/index',
  '/pages/games/games',
  '/pages/mine/mine'
]

// 同步当前页面对应的 tab 选中态
function selectTab(page, index) {
  if (!page || typeof page.getTabBar !== 'function') return
  const instance = page.getTabBar((tabBar) => {
    if (tabBar) tabBar.setData({ selected: index })
  })
  if (instance && typeof instance.setData === 'function') {
    instance.setData({ selected: index })
  }
}

// 连点保护：中老年用户很容易连点两下。wx.navigateTo 不会合并两次点击，
// 会真的叠两层同一个页面 —— 返回时要按两次才回到上一页，看起来像"卡住了"。
// 500ms 足够吃掉连点，又不影响正常的连续操作。
const NAV_LOCK_MS = 500
let navLockAt = 0

// 统一跳转：tab 页自动使用 switchTab，其余走 navigateTo
function openPage(url) {
  if (!url) return
  const now = Date.now()
  if (now - navLockAt < NAV_LOCK_MS) return
  navLockAt = now

  const fail = (err) => {
    console.error('openPage fail:', url, err)
    // 最常见的原因是页面栈已满 10 层（游戏 → 设置 → 记录 反复进出）。
    // 原来只 console.error，用户点了一下什么都没发生，不知道该怎么办。
    wx.showToast({ title: '页面打开失败，返回上一页再试', icon: 'none' })
  }

  if (TAB_PAGES.indexOf(url) >= 0) {
    wx.switchTab({ url, fail })
  } else {
    wx.navigateTo({ url, fail })
  }
}

function getNickname() {
  try {
    return wx.getStorageSync(KEY_NICKNAME) || '体验用户'
  } catch (e) {
    return '体验用户'
  }
}

function setNickname(name) {
  try {
    wx.setStorageSync(KEY_NICKNAME, name)
  } catch (e) { /* 忽略 */ }
}

module.exports = {
  selectTab,
  openPage,
  getNickname,
  setNickname,
  KEY_NICKNAME
}
