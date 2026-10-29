// ============================================================================
// tools/race-settings-test.js —— 赛车「训练设置」页的读写契约
// ----------------------------------------------------------------------------
// 为什么单独测这一页：
//   设置页并不拥有自己的存储，它直接改**引擎**的 nrr_therapist_params_v1。
//   这个耦合有两条极易静默失效的路径：
//     1. 只写参数、没写种子标记 race_motion_seed_v2
//        → 下次进游戏，race.js 的 seedMotionParams() 认为"没种子"，
//          把 MOTION_TUNE 整套盖回去 → 治疗师改了参数却"没生效"
//     2. brakeOn 是本页的虚拟开关（引擎只认 brakeAngle，999 = 永不刹车）
//        → 写错方向就变成"想开刹车却关了"或"想关却还在刹"
//   两条都不会报错、不会白屏，只表现为"设置没用"，正是最难发现的那类 bug。
//
// 最后一节直接 new GameEngine 读 engine.motion.params —— 断言的是
// "设置页写下的东西，引擎真的读到了"，而不是"存储里有个看着对的 JSON"。
//
// 用法：node tools/race-settings-test.js
// ============================================================================

/* eslint-disable no-console */

const path = require('path')

let pass = 0
let fail = 0
function ok(cond, msg, extra) {
  if (cond) {
    pass += 1
    console.log('  ✓ ' + msg)
  } else {
    fail += 1
    console.log('  ✗ ' + msg + (extra === undefined ? '' : '  → ' + extra))
  }
}

// ============================================================== wx 桩
// 必须在 require 页面/引擎之前装好：两者都会在模块顶层探测 wx
const store = {}
const modals = []

global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2, platform: 'devtools' }),
  getWindowInfo: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 }),
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wxtestsetpage', envVersion: 'develop' } }),
  showToast: () => {},
  // 弹窗一律"确认"：这三个动作（切档位/恢复默认/套康复值）都要走确认分支
  showModal: (o) => {
    modals.push(o)
    if (o && typeof o.success === 'function') o.success({ confirm: true, cancel: false })
  },
  request: (o) => {
    if (o && typeof o.fail === 'function') setTimeout(() => o.fail({ errMsg: 'mock: no network' }), 0)
  },
  login: (o) => {
    if (o && typeof o.success === 'function') setTimeout(() => o.success({ code: 'mock-code' }), 0)
  }
}

// ============================================================== 页面实例
const ENGINE_KEY = 'nrr_therapist_params_v1'
const SEED_KEY = 'race_motion_seed_v2'

const PAGE_PATH = path.resolve(__dirname, '..', 'pkgRace', 'pages', 'race-settings', 'race-settings.js')
const ENGINE_PATH = path.resolve(__dirname, '..', 'pkgRace', 'race', 'engine.js')

let pageDef = null
global.Page = (def) => { pageDef = def }
require(PAGE_PATH)
ok(!!pageDef, '设置页注册了 Page()')

/** setData 的路径补丁：[a.b[0].c] = v，测试里没有渲染层，得自己实现 */
function applyPatch(target, patch) {
  Object.keys(patch).forEach((key) => {
    const segs = key.replace(/\[(\d+)\]/g, '.$1').split('.').filter((s) => s !== '')
    let cur = target
    for (let i = 0; i < segs.length - 1; i++) {
      const k = /^\d+$/.test(segs[i]) ? Number(segs[i]) : segs[i]
      if (cur[k] === undefined || cur[k] === null) cur[k] = /^\d+$/.test(segs[i + 1]) ? [] : {}
      cur = cur[k]
    }
    const last = segs[segs.length - 1]
    cur[/^\d+$/.test(last) ? Number(last) : last] = patch[key]
  })
}

function makePage() {
  const page = {}
  Object.keys(pageDef).forEach((k) => {
    if (k !== 'data') page[k] = pageDef[k]
  })
  page.data = JSON.parse(JSON.stringify(pageDef.data))
  page.setData = function (patch) { applyPatch(this.data, patch) }
  return page
}

function stored() {
  const raw = store[ENGINE_KEY]
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (e) { return null }
  }
  return raw || null
}

function findItem(page, key) {
  for (const g of page.data.groups) {
    for (const it of g.items) if (it.key === key) return it
  }
  return null
}

/** 模拟拖动滑块：bindchanging 给值，bindchange 落盘 */
function slide(page, key, value) {
  page.onSlide({ currentTarget: { dataset: { key: key } }, detail: { value: value } })
  page.onSlideEnd({})
}

function toggle(page, key, value) {
  page.onToggle({ currentTarget: { dataset: { key: key } }, detail: { value: value } })
}

// ============================================================== 1. 首次打开
console.log('== 1. 从未设置过时的初始态 ==')
{
  delete store[ENGINE_KEY]
  delete store[SEED_KEY]
  const page = makePage()
  page.onLoad()

  ok(page.data.difficulty === 2, '默认档位是 2', page.data.difficulty)
  ok(page.data.groups.length === 3, '参数分成 3 组', page.data.groups.length)
  const brake = findItem(page, 'brakeOn')
  ok(!!brake && brake.value === true,
    '默认刹车是开着的（引擎默认 brakeAngle=8）', brake && brake.value)
  const angle = findItem(page, 'brakeAngle')
  ok(!!angle && angle.value === 8, '默认刹车触发角 8°', angle && angle.value)
  const maxA = findItem(page, 'maxAngle')
  ok(!!maxA && maxA.display === '20°', '打满方向角度显示 20°', maxA && maxA.display)
  ok(page.data.difficultyLabel.indexOf('L2') === 0, '档位名称取 L2', page.data.difficultyLabel)
  ok(page.data.levelRows.length === 5, '五档对比表 5 行', page.data.levelRows.length)
  ok(!stored(), '只打开页面不写存储（不产生脏数据）')
}

// ============================================================== 2. 刹车的虚拟开关
console.log('== 2. brakeOn 虚拟开关 ==')
{
  delete store[ENGINE_KEY]
  delete store[SEED_KEY]
  const page = makePage()
  page.onLoad()

  toggle(page, 'brakeOn', false)
  let s = stored()
  ok(!!s, '关刹车后有落盘')
  ok(s && s.brakeAngle === 999, '关刹车 → brakeAngle 写成 999（引擎语义：永不刹车）', s && s.brakeAngle)
  ok(s && s.brakeOn === undefined, '存储里不留 brakeOn 这个非引擎字段', s && Object.keys(s).join(','))
  ok(store[SEED_KEY] === 1, '同时写了种子标记（否则进游戏被 race.js 覆盖）', store[SEED_KEY])
  ok(!findItem(page, 'brakeAngle'), '刹车角度滑块随开关隐藏')

  toggle(page, 'brakeOn', true)
  s = stored()
  ok(s && s.brakeAngle === 8, '再开刹车 → 回到 8°（不是把 999 留着）', s && s.brakeAngle)
}

// ============================================================== 3. 数值落盘与对齐
console.log('== 3. 拖动滑块的落盘、夹取与步长对齐 ==')
{
  const page = makePage()
  page.onLoad()

  slide(page, 'smoothing', 0.18)
  ok(stored().smoothing === 0.18, 'smoothing 0.18 落盘', stored().smoothing)
  ok(findItem(page, 'smoothing').display === '0.18', '显示两位小数', findItem(page, 'smoothing').display)

  // step 0.05：0.031 应当被对齐到 0.05，而不是留下 0.031 这种值
  slide(page, 'smoothing', 0.031)
  ok(stored().smoothing === 0.05, 'step 0.05 对齐（0.031 → 0.05）', stored().smoothing)

  // 越界：滑块本身不会越界，但写入路径要自己挡（Storage 可能被别处改过）
  slide(page, 'maxAngle', 999)
  ok(stored().maxAngle === 40, 'maxAngle 上限夹到 40°', stored().maxAngle)
  slide(page, 'maxAngle', -99)
  ok(stored().maxAngle === 5, 'maxAngle 下限夹到 5°', stored().maxAngle)

  slide(page, 'sessionSeconds', 180)
  ok(findItem(page, 'sessionSeconds').display === '3 分 0 秒', '时长显示成分秒', findItem(page, 'sessionSeconds').display)
  ok(store[SEED_KEY] === 1, '每次落盘都带种子标记')
}

// ============================================================== 4. 三个动作
console.log('== 4. 套康复值 / 恢复默认 / 切档位 ==')
{
  delete store[ENGINE_KEY]
  delete store[SEED_KEY]
  const page = makePage()
  page.onLoad()

  page.onApplyRehab({})
  let s = stored()
  ok(s && s.maxAngle === 10, '康复值：侧屈 10° 打满', s && s.maxAngle)
  ok(s && s.deadZone === 1.5, '康复值：死区 1.5°', s && s.deadZone)
  ok(s && s.smoothing === 0.18, '康复值：滤波 0.18', s && s.smoothing)
  ok(s && s.assist === 0, '康复值：关闭回正辅助', s && s.assist)
  ok(s && s.brakeAngle === 999, '康复值：不设刹车', s && s.brakeAngle)
  ok(s && s.invertRoll === true, '康复值：转向反向开启', s && s.invertRoll)

  page.onReset({})
  s = stored()
  ok(s && s.maxAngle === 20, '恢复默认：侧屈 20°', s && s.maxAngle)
  ok(s && s.smoothing === 0.35, '恢复默认：滤波 0.35', s && s.smoothing)
  ok(s && s.brakeAngle === 8,
    '恢复默认：brakeAngle=8 而不是 999（引擎默认是开着刹车的）', s && s.brakeAngle)
  ok(!!findItem(page, 'brakeAngle'), '恢复默认后刹车角度滑块重新出现')

  page.onLevelTap({ currentTarget: { dataset: { lv: 4 } } })
  s = stored()
  ok(s && s.difficulty === 4, '切到 L4', s && s.difficulty)
  ok(s && s.sessionSeconds === 180, 'L4 同时套用 180 秒单局时长', s && s.sessionSeconds)
  ok(page.data.difficultyLabel.indexOf('L4') === 0, '界面档位名同步为 L4', page.data.difficultyLabel)
  const row = page.data.levelRows[3]
  ok(row && row.active === true, '对比表第 4 行高亮', row && row.active)

  // 非法档位不能把 difficulty 写成 NaN（这是赛车引擎踩过的坑）
  page.onLevelTap({ currentTarget: { dataset: { lv: 9 } } })
  ok(stored().difficulty === 4, '越界档位被忽略，不污染存储', stored().difficulty)
}

// ============================================================== 5. 引擎真的读到了
console.log('== 5. 引擎侧闭环：设置页写入 → GameEngine.motion.params ==')
{
  // 极简 canvas：构造引擎不绘制，只要有 2d 上下文即可
  function noopCtx(canvas) {
    const target = { canvas: canvas }
    return new Proxy(target, {
      get(t, k) {
        if (k in t) return t[k]
        if (typeof k === 'symbol') return undefined
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
          return () => ({ addColorStop() {} })
        }
        return () => undefined
      },
      set(t, k, v) { t[k] = v; return true }
    })
  }
  function makeCanvas(w, h) {
    let ctx = null
    const c = {
      width: w,
      height: h,
      getContext(type) { if (type !== '2d') return null; if (!ctx) ctx = noopCtx(c); return ctx },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      toDataURL: () => ''
    }
    return c
  }

  const { GameEngine } = require(ENGINE_PATH)

  // 1) 康复推荐值
  delete store[ENGINE_KEY]
  delete store[SEED_KEY]
  const page = makePage()
  page.onLoad()
  page.onApplyRehab({})

  const e1 = new GameEngine(makeCanvas(1688, 780))
  e1.audio.musicEnabled = false
  e1.audio.enabled = false
  const p1 = e1.motion.params
  ok(p1.maxAngle === 10, '引擎读到 maxAngle=10（设置页真的生效了）', p1.maxAngle)
  ok(p1.deadZone === 1.5, '引擎读到 deadZone=1.5', p1.deadZone)
  ok(p1.smoothing === 0.18, '引擎读到 smoothing=0.18', p1.smoothing)
  ok(p1.brakeAngle === 999, '引擎读到 brakeAngle=999（不刹车）', p1.brakeAngle)
  ok(e1.diff.level === 2, '引擎档位默认 2 档', e1.diff.level)

  // 2) 再改一项，重新造引擎（引擎只在构造时读一次参数，这是"下一局生效"的由来）
  slide(page, 'maxAngle', 12)
  const e2 = new GameEngine(makeCanvas(1688, 780))
  e2.audio.musicEnabled = false
  e2.audio.enabled = false
  ok(e2.motion.params.maxAngle === 12, '改完再开一局，引擎读到 12', e2.motion.params.maxAngle)

  // 3) 切档位后引擎的档位表要跟着变
  page.onLevelTap({ currentTarget: { dataset: { lv: 5 } } })
  const e3 = new GameEngine(makeCanvas(1688, 780))
  e3.audio.musicEnabled = false
  e3.audio.enabled = false
  ok(e3.diff.level === 5, '切到 L5 后引擎读到的档位是 5', e3.diff.level)

  // 4) 存档必须能被引擎的读取函数（JSON.parse 字符串）解析
  ok(typeof store[ENGINE_KEY] === 'string', '存的是 JSON 字符串（和引擎自己 N() 的写法一致）', typeof store[ENGINE_KEY])

  // 5) 五档表防漂移：设置页复制了一份引擎的 U 表，引擎改了页面不改就会对外报错数
  let drift = []
  for (let lv = 1; lv <= 5; lv++) {
    page.onLevelTap({ currentTarget: { dataset: { lv: lv } } })
    const e = new GameEngine(makeCanvas(1688, 780))
    e.audio.musicEnabled = false
    e.audio.enabled = false
    const row = page.data.levelRows[lv - 1]
    const d = e.diff
    if (d.level !== lv) drift.push('L' + lv + ' 档位号 ' + d.level)
    if (d.name !== row.name) drift.push('L' + lv + ' 名称「' + row.name + '」≠ 引擎「' + d.name + '」')
    if (Math.round(d.density * 100) + '%' !== row.density) {
      drift.push('L' + lv + ' 密度 ' + row.density + ' ≠ ' + Math.round(d.density * 100) + '%')
    }
    if (Math.round(d.maxSpeed / 42) + ' km/h' !== row.speed) {
      drift.push('L' + lv + ' 速度 ' + row.speed + ' ≠ ' + Math.round(d.maxSpeed / 42) + ' km/h')
    }
    if (d.sessionSeconds + ' 秒' !== row.session) {
      drift.push('L' + lv + ' 时长 ' + row.session + ' ≠ ' + d.sessionSeconds + ' 秒')
    }
  }
  ok(drift.length === 0, '五档对比表与引擎 U 表逐项一致（防复制漂移）', drift.join(' | '))
}

// ============================================================== 6. 种子标记
console.log('== 6. 种子标记 race_motion_seed_v2 ==')
{
  // race.js 的 seedMotionParams()：没有种子就把 MOTION_TUNE 盖上去。
  // 设置页每次落盘都必须带种子，否则治疗师的修改会在下一局被抹掉。
  delete store[ENGINE_KEY]
  delete store[SEED_KEY]
  const page = makePage()
  page.onLoad()
  ok(!store[SEED_KEY], '未做任何修改时不写种子（保持"首次进游戏才播种"的语义）')

  slide(page, 'deadZone', 2)
  ok(store[SEED_KEY] === 1, '任意一次落盘都写种子', store[SEED_KEY])
  ok(stored().deadZone === 2, '参数与种子同时到位', stored().deadZone)

  // 模拟 race.js 的播种逻辑：有种子就跳过，不能覆盖设置页的改动
  const seeded = (function seed() {
    if (wx.getStorageSync(SEED_KEY)) return true
    return false
  })()
  ok(seeded === true, 'race.js 看到种子会跳过播种（设置页的改动保住）', seeded)
  ok(stored().deadZone === 2, '参数没有被 MOTION_TUNE 覆盖', stored().deadZone)
}

// ============================================================== 收尾
console.log('\n' + '-'.repeat(48))
if (fail) {
  console.log('未通过：' + fail + ' 项失败，' + pass + ' 项通过')
  process.exitCode = 1
} else {
  console.log('全部通过：' + pass + ' 项')
}
