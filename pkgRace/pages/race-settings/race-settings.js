// race-settings.js —— 赛车：治疗师训练参数设置
// ----------------------------------------------------------------------------
// 赛车引擎把治疗参数存在自己的键 nrr_therapist_params_v1 里（引擎启动时读一次，
// 治疗师在游戏内长按右上角面板调的也是这个键）。本页直接读写同一个键，
// 这样「设置页」和「游戏内面板」是同一份数据，不会打架。
//
// ★ 必须同时写 race_motion_seed_v2 种子标记：
//   比赛页面 onLoad 里 seedMotionParams() 会在**没有种子标记**时把 MOTION_TUNE
//   整套写进去。如果设置页只改参数不落种子，下次进游戏就被页面覆盖回去，
//   表现为「设置改了没生效」。
//
// ★ 参数只在**下一局生效**：引擎在构造函数里读参数并缓存到 motion.params，
//   对局中途改不会热更新。页面上必须明说，否则治疗师会以为改坏了。
// ----------------------------------------------------------------------------

const records = require('../../utils/race-record.js')
const api = require('../../../utils/api.js')

const ENGINE_KEY = 'nrr_therapist_params_v1'
const SEED_KEY = 'race_motion_seed_v2'

// 引擎内置默认值（engine.src.js 的 we 对象）。用它作为"未设置过"时的基线。
// brakeOn 不在引擎里，是本页的虚拟开关（引擎只认 brakeAngle，999 = 永不刹车）。
// 引擎默认 brakeAngle=8 意味着默认是**开着刹车**的，所以要写 true；
// 漏掉它会让「恢复引擎默认」变成 999，等于把刹车关了，和引擎默认不一致。
const ENGINE_DEFAULTS = {
  rollSensitivity: 1,
  pitchSensitivity: 1,
  deadZone: 3.5,
  maxAngle: 20,
  brakeAngle: 8,
  brakeOn: true,
  smoothing: 0.35,
  assist: 0.18,
  invertRoll: false,
  invertPitch: false,
  difficulty: 2,
  sessionSeconds: 150,
  patientWeight: 60,
  vibration: true
}

// 五档赛道（engine.src.js 的 U 表）。会话时长跟档位对齐，
// 这样菜单上显示的「150s」和实际跑的时间不会对不上。
const LEVELS = [
  { lv: 1, name: 'L1 卧榻起步', density: 16, speed: 6200, session: 120 },
  { lv: 2, name: 'L2 坐姿巡航', density: 24, speed: 7800, session: 150 },
  { lv: 3, name: 'L3 站立平衡', density: 32, speed: 9400, session: 180 },
  { lv: 4, name: 'L4 动态抗扰', density: 40, speed: 10800, session: 180 },
  { lv: 5, name: 'L5 极限协调', density: 50, speed: 12000, session: 210 }
]

const SCHEMA = {
  maxAngle: {
    group: '操控手感',
    label: '打满方向所需侧屈',
    type: 'number',
    min: 5,
    max: 40,
    step: 1,
    unit: '°',
    tip: '侧屈到这个角度方向盘就打满。脑卒中患者活动范围小，建议 8~12°。'
  },
  deadZone: {
    group: '操控手感',
    label: '死区',
    type: 'number',
    min: 0,
    max: 10,
    step: 0.5,
    unit: '°',
    tip: '小于这个角度的动作不响应，用来吃掉呼吸和抖动。太小会乱晃，太大打不动方向。'
  },
  smoothing: {
    group: '操控手感',
    label: '滤波强度',
    type: 'number',
    min: 0.05,
    max: 0.9,
    // 步长必须细到 0.01：康复推荐值是 0.18，用 0.05 的步长会被对齐成 0.2，
    // 等于把实测调过的跟手性悄悄改钝（跟手延迟 117ms → 150ms 以上）。
    step: 0.01,
    unit: '',
    tip: '越小越跟手、越大越稳。0.18 约 120ms 响应；调到 0.35 会到 200ms 以上，患者会觉得失控。'
  },
  rollSensitivity: {
    group: '操控手感',
    label: '转向灵敏度',
    type: 'number',
    min: 0.3,
    max: 2,
    step: 0.1,
    unit: '',
    tip: '死区之外的角度再乘这个系数。1.1 表示略放大。'
  },
  pitchSensitivity: {
    group: '操控手感',
    label: '油门灵敏度',
    type: 'number',
    min: 0.3,
    max: 2,
    step: 0.1,
    unit: '',
    tip: '前倾产生的加速力度。'
  },
  assist: {
    group: '操控手感',
    label: '回正辅助',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.05,
    unit: '',
    tip: '会把小幅动作往中间拉。康复期建议 0，否则削弱有效输入、打不满方向。'
  },
  invertRoll: {
    group: '轴向与反馈',
    label: '转向反向',
    type: 'bool',
    tip: '实机「往左倾车往右拐」时打开。'
  },
  invertPitch: {
    group: '轴向与反馈',
    label: '油门反向',
    type: 'bool',
    tip: '实机「前倾反而减速」时打开。'
  },
  brakeOn: {
    group: '轴向与反馈',
    label: '启用刹车',
    type: 'bool',
    tip: '康复期建议关闭：后倾只收回油门，车仍保留巡航速度，不会停在路中间。'
  },
  brakeAngle: {
    group: '轴向与反馈',
    label: '刹车触发角度',
    type: 'number',
    min: 4,
    max: 40,
    step: 1,
    unit: '°',
    onlyWhen: 'brakeOn',
    tip: '后倾超过这个角度才开始刹车。'
  },
  vibration: {
    group: '轴向与反馈',
    label: '振动提醒',
    type: 'bool',
    tip: '碰撞和完美闪避时给一次短振动。'
  },
  sessionSeconds: {
    group: '训练量',
    label: '单局时长',
    type: 'number',
    min: 60,
    max: 600,
    step: 30,
    unit: '秒',
    tip: '倒计时总长。菜单上显示的秒数以这里为准。'
  },
  patientWeight: {
    group: '训练量',
    label: '患者体重',
    type: 'number',
    min: 20,
    max: 120,
    step: 1,
    unit: 'kg',
    tip: '仅用于卡路里估算，不影响操控。'
  }
}

const GROUPS = ['操控手感', '轴向与反馈', '训练量']

function readParams() {
  let cur = null
  try {
    cur = wx.getStorageSync(ENGINE_KEY)
  } catch (e) {
    cur = null
  }
  if (typeof cur === 'string') {
    try {
      cur = JSON.parse(cur)
    } catch (e) {
      cur = null
    }
  }
  if (!cur || typeof cur !== 'object') cur = {}
  return Object.assign({}, ENGINE_DEFAULTS, cur)
}

/** 写回引擎存储。必须同时落种子标记，否则进游戏被页面覆盖。 */
function writeParams(params) {
  // 先按 schema 夹一遍，避免 NaN / 字符串混进去（引擎也会夹，但别让它收到垃圾）
  const out = Object.assign({}, params)
  Object.keys(SCHEMA).forEach((k) => {
    const meta = SCHEMA[k]
    if (meta.type === 'bool') {
      out[k] = !!out[k]
      return
    }
    if (meta.type !== 'number') return
    let v = Number(out[k])
    if (!isFinite(v)) v = ENGINE_DEFAULTS[k]
    v = Math.min(meta.max, Math.max(meta.min, v))
    // 对齐步长：网格必须从 min 起算。从 0 起算会飘 ——
    // smoothing 的 min 是 0.05、step 0.01，从 0 起算的话 0.18 会落到 0.185。
    if (meta.step) v = meta.min + Math.round((v - meta.min) / meta.step) * meta.step
    out[k] = Math.round(v * 1000) / 1000
  })
  // brakeOn 是虚拟开关：关掉就写 brakeAngle=999（引擎里 999 = 永不刹车）
  if (!out.brakeOn) out.brakeAngle = 999
  else if (!(out.brakeAngle > 0) || out.brakeAngle >= 900) out.brakeAngle = ENGINE_DEFAULTS.brakeAngle
  delete out.brakeOn

  try {
    wx.setStorageSync(ENGINE_KEY, JSON.stringify(out))
    wx.setStorageSync(SEED_KEY, 1)
  } catch (e) {
    return false
  }
  return true
}

function fmt(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return String(value)
  if (meta.type === 'bool') return value ? '开' : '关'
  if (key === 'smoothing') return Number(value).toFixed(2)
  if (key === 'sessionSeconds') {
    const s = Math.round(Number(value) || 0)
    return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒'
  }
  const num = typeof value === 'number' ? Math.round(value * 100) / 100 : value
  return num + (meta.unit || '')
}

Page({
  data: {
    groups: [],
    difficulty: 2,
    difficultyLabel: '',
    levelRows: [],
    uploadReady: false,
    uploadState: '未配置',
    endpoint: '',
    savedAt: ''
  },

  onLoad() {
    this.params = readParams()
    this.syncAll()
  },

  onShow() {
    // 从别处改了参数（比如游戏内面板）回来要重新读
    this.params = readParams()
    this.syncAll()
  },

  syncAll() {
    const p = this.params
    const brakeOn = !(p.brakeAngle >= 900) && p.brakeAngle > 0
    // brakeOn 是虚拟项，值不在存储里，单独塞进去
    p.brakeOn = brakeOn

    const groups = GROUPS.map((g) => {
      const keys = Object.keys(SCHEMA).filter((k) => SCHEMA[k].group === g)
      const items = keys
        .filter((k) => {
          const only = SCHEMA[k].onlyWhen
          return !only || !!p[only]
        })
        .map((k) => {
          const meta = SCHEMA[k]
          const value = meta.type === 'bool' ? !!p[k] : Number(p[k])
          return {
            key: k,
            label: meta.label,
            tip: meta.tip || '',
            type: meta.type,
            value: value,
            display: fmt(k, value),
            min: meta.min,
            max: meta.max,
            step: meta.step,
            unit: meta.unit
          }
        })
      return { name: g, items: items }
    }).filter((g) => g.items.length > 0)

    const lv = Number(p.difficulty) || 2
    const info = LEVELS[lv - 1] || LEVELS[1]
    const upload = records.getUploadConfig()

    this.setData({
      groups: groups,
      difficulty: lv,
      difficultyLabel: info.name,
      levelRows: LEVELS.map((L) => ({
        lv: L.lv,
        name: L.name,
        // 候选按钮和表格里已经有独立的一列档位号，名称里再带「L2 」会挤成两行
        short: L.name.replace(/^L\d\s*/, ''),
        active: L.lv === lv,
        density: L.density + '%',
        speed: Math.round(L.speed / 42) + ' km/h',
        session: L.session + ' 秒'
      })),
      uploadReady: !!upload.url && upload.enabled,
      // enabled = 有网络 && 已登录。没说清楚就会出现「地址明明填了却不上报」的困惑。
      uploadState: upload.url
        ? (upload.enabled ? '已就绪' : '待登录或离线')
        : '仅本机保存',
      endpoint: api.getBase() || ''
    })
  },

  // ---------------------------------------------------------------- 参数
  onSlide(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const value = Number(e.detail.value)
    this.params[key] = value
    this.patchDisplay(key, value)
  },

  /** 拖动中只更新显示与内存值，整表重建会让滑块跳动 */
  patchDisplay(key, value) {
    const groups = this.data.groups
    for (let gi = 0; gi < groups.length; gi++) {
      const items = groups[gi].items
      for (let i = 0; i < items.length; i++) {
        if (items[i].key === key) {
          this.setData({
            ['groups[' + gi + '].items[' + i + '].value']: value,
            ['groups[' + gi + '].items[' + i + '].display']: fmt(key, Number(value))
          })
          return
        }
      }
    }
  },

  onSlideEnd() {
    // 松手才落盘：拖动过程中每帧写 storage 会卡
    this.commit()
    // 落盘时做过步长对齐与范围夹取，界面要显示「真正存下来的值」而不是手指停下的位置
    this.syncAll()
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const on = !!e.detail.value

    if (key === 'brakeOn') {
      this.params.brakeOn = on
      this.params.brakeAngle = on ? ENGINE_DEFAULTS.brakeAngle : 999
      this.commit()
      this.syncAll()
      return
    }
    this.params[key] = on
    this.commit()
    this.syncAll()
  },

  commit() {
    const ok = writeParams(this.params)
    if (!ok) {
      wx.showModal({
        title: '保存失败',
        content: '本机存储不可用，参数没有写入。请检查小程序存储权限。',
        showCancel: false
      })
      return
    }
    // 重新读回，让界面显示的是「真正落盘的值」而不是内存里的
    this.params = readParams()
    this.setData({ savedAt: records.formatTime(Date.now()) })
  },

  // ---------------------------------------------------------------- 档位
  onLevelTap(e) {
    const lv = Number(e.currentTarget.dataset.lv)
    if (!lv || lv < 1 || lv > 5) return
    const info = LEVELS[lv - 1]
    wx.showModal({
      title: '切换到 ' + info.name + '？',
      content:
        '会同时把关卡密度、速度上限和单局时长设为该档推荐值（' +
        info.session +
        ' 秒）。操控手感参数（侧屈角度、死区、滤波）保持不变。',
      confirmText: '套用',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.params.difficulty = lv
        this.params.sessionSeconds = info.session
        this.commit()
        this.syncAll()
        wx.showToast({ title: '已套用 ' + info.name, icon: 'none' })
      }
    })
  },

  // ---------------------------------------------------------------- 其它
  onReset() {
    wx.showModal({
      title: '恢复引擎默认参数',
      content:
        '所有操控参数将回到引擎出厂默认（侧屈 20° 打满、死区 3.5°、滤波 0.35）。' +
        '注意：这套默认值对脑卒中患者偏「迟钝」，恢复后通常还要再调回来。历史记录不受影响。',
      confirmText: '恢复',
      confirmColor: '#DF5540',
      success: (res) => {
        if (!res.confirm) return
        this.params = Object.assign({}, ENGINE_DEFAULTS)
        this.commit()
        this.syncAll()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      }
    })
  },

  /** 康复推荐值：一键回到 race.js 里那套 MOTION_TUNE */
  onApplyRehab() {
    wx.showModal({
      title: '套用康复推荐参数',
      content: '侧屈 10° 打满、死区 1.5°、滤波 0.18、关闭回正辅助、转向反向开启。适用于活动范围小、需要小幅度就有响应的患者。',
      confirmText: '套用',
      success: (res) => {
        if (!res.confirm) return
        Object.assign(this.params, {
          maxAngle: 10,
          deadZone: 1.5,
          smoothing: 0.18,
          assist: 0,
          rollSensitivity: 1.1,
          pitchSensitivity: 1.1,
          invertRoll: true,
          brakeAngle: 999,
          brakeOn: false
        })
        this.commit()
        this.syncAll()
        wx.showToast({ title: '已套用康复参数', icon: 'success' })
      }
    })
  },

  onGoRecords() {
    wx.navigateTo({ url: '/pkgRace/pages/race-records/race-records' })
  }
})
