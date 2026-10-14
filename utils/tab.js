// utils/tab.js —— 底部导航选中态同步 + 本地训练数据读取 + 统一页面跳转
// 自定义 tabBar 在 Skyline 下通过回调获取实例，在 WebView 下直接返回实例，这里两种都兼容

const KEY_REHAB_COINS = 'rehab_coins'
const KEY_REHAB_BEST = 'rehab_best'
const KEY_NICKNAME = 'mine_nickname'

// 底部 tab 页路径：这些页面不能用 navigateTo，必须走 switchTab
const TAB_PAGES = [
  '/pages/index/index',
  '/pages/rehab/rehab',
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

// 统一跳转：tab 页自动使用 switchTab，其余走 navigateTo
function openPage(url) {
  if (!url) return
  if (TAB_PAGES.indexOf(url) >= 0) {
    wx.switchTab({ url, fail: (err) => console.error('switchTab fail:', err) })
  } else {
    wx.navigateTo({ url, fail: (err) => console.error('navigateTo fail:', err) })
  }
}

// 读取康复模块落地的本地数据
function readOverview() {
  let rehabCoins = 0
  let best = 0
  try {
    rehabCoins = wx.getStorageSync(KEY_REHAB_COINS) || 0
    best = wx.getStorageSync(KEY_REHAB_BEST) || 0
  } catch (e) { /* 读取失败按默认值处理 */ }
  return { rehabCoins, best }
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
  readOverview,
  getNickname,
  setNickname,
  KEY_REHAB_COINS,
  KEY_REHAB_BEST,
  KEY_NICKNAME
}
