// ============================================================================
// utils/config-store.js —— 治疗师参数的通用存储工厂
// ----------------------------------------------------------------------------
// 接水果 / 走钢丝 / 节奏训练三个游戏的配置模块原本各写了一份几乎一样的
// 「SCHEMA + 校验 + get/patch/set/load/save/reset/subscribe」类（每个约 400 行）。
// 这里抽成工厂，各游戏只保留自己的 SCHEMA / 预设 / 校验规则。
//
// 行为约定（与原来逐字保持一致）：
//   · patch 只接受 SCHEMA 里有的键，值先 coerce（类型 → 范围 → 步长）再比较；
//   · 变更后 260ms 合并落盘一次，避免拖滑块时狂写 storage；
//   · reset() 回到 SCHEMA 默认值并立即保存；
//   · subscribe 返回 off 函数；监听器抛错只打日志，不影响其它监听器。
// ============================================================================

const SAVE_DELAY = 260

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function num(v, def) {
  const n = Number(v)
  return isFinite(n) ? n : def
}

/** 把 value 规整成 schema 允许的值；不符合就回落默认值 */
function coerceWith(schema, key, value) {
  const meta = schema[key]
  if (!meta) return undefined
  if (meta.type === 'bool') {
    if (typeof value === 'boolean') return value
    if (value === 1 || value === '1' || value === 'true') return true
    if (value === 0 || value === '0' || value === 'false') return false
    return meta.def
  }
  if (meta.type === 'enum') {
    const opts = meta.options || []
    if (opts.indexOf(value) >= 0) return value
    const asNum = Number(value)
    if (opts.indexOf(asNum) >= 0) return asNum
    return meta.def
  }
  let v = num(value, meta.def)
  if (meta.step) v = Math.round(v / meta.step) * meta.step
  v = clamp(v, meta.min, meta.max)
  // 步长是小数时 Math.round 会带出 0.30000000000000004 这类尾巴
  return Math.round(v * 1000) / 1000
}

/**
 * @param {object} opts
 *   key        storage 键
 *   schema     字段定义（见各游戏 config）
 *   presets    { 1..5: { label, ...参数 } }
 *   validate   (state) => { ok, errors, warnings }
 *   saveDelay  合并落盘延迟（默认 260ms）
 *   logTag     监听器报错时的前缀
 */
function createConfigStore(opts) {
  const o = opts || {}
  const SCHEMA = o.schema || {}
  const PRESETS = o.presets || {}
  const validateFn = o.validate || (() => ({ ok: true, errors: [], warnings: [] }))
  const SAVE_DELAY_MS = num(o.saveDelay, SAVE_DELAY)
  const LOG_TAG = o.logTag || 'config'
  const DEFAULT_LV = num(o.defaultDifficulty, 3)

  const defaults = () => {
    const d = {}
    Object.keys(SCHEMA).forEach((k) => { d[k] = SCHEMA[k].def })
    return d
  }
  const DEFAULT_CONFIG = defaults()
  const coerce = (key, value) => coerceWith(SCHEMA, key, value)

  class ConfigStore {
    constructor(storeOpts) {
      const so = storeOpts || {}
      this.key = so.storageKey || o.key
      this.persistEnabled = so.persist !== false
      this.state = defaults()
      this.listeners = []
      this.timer = null
      if (this.persistEnabled) this.load()
    }

    get(key) {
      if (key === undefined) return this.all()
      const v = this.state[key]
      return v === undefined ? (SCHEMA[key] ? SCHEMA[key].def : undefined) : v
    }

    all() {
      return Object.assign({}, this.state)
    }

    patch(partial, source) {
      if (!partial) return []
      const changed = []
      Object.keys(partial).forEach((k) => {
        if (!SCHEMA[k]) return
        const next = coerce(k, partial[k])
        if (next === undefined || next === this.state[k]) return
        this.state[k] = next
        changed.push(k)
      })
      if (!changed.length) return changed
      this.scheduleSave()
      this.emit(changed, source || 'patch')
      return changed
    }

    set(key, value, source) {
      const p = {}
      p[key] = value
      this.patch(p, source || ('set:' + key))
      return this.get(key)
    }

    applyDifficulty(level, applyPreset) {
      const lv = clamp(Math.round(num(level, DEFAULT_LV)), 1, 5)
      const preset = PRESETS[lv]
      if (!preset) return []
      const p = { difficulty: lv }
      if (applyPreset !== false) {
        Object.keys(preset).forEach((k) => {
          if (k === 'label') return
          if (SCHEMA[k]) p[k] = preset[k]
        })
      }
      return this.patch(p, 'difficulty:' + lv)
    }

    difficultyLabel(level) {
      const p = PRESETS[clamp(Math.round(num(level, DEFAULT_LV)), 1, 5)]
      return p ? p.label : ''
    }

    validate() {
      return validateFn(this.state)
    }

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {}
      this.listeners.push(fn)
      const that = this
      return function off() {
        const i = that.listeners.indexOf(fn)
        if (i >= 0) that.listeners.splice(i, 1)
      }
    }

    emit(changed, source) {
      const payload = { config: this.all(), changed, source }
      this.listeners.slice().forEach((fn) => {
        try { fn(payload) } catch (e) { console.error('[' + LOG_TAG + '] listener', e) }
      })
    }

    load() {
      let saved = null
      try { saved = wx.getStorageSync(this.key) } catch (e) { /* 忽略 */ }
      if (saved && typeof saved === 'object') {
        Object.keys(SCHEMA).forEach((k) => {
          if (saved[k] !== undefined) this.state[k] = coerce(k, saved[k])
        })
      }
      return this.state
    }

    scheduleSave() {
      if (!this.persistEnabled || this.timer) return
      const that = this
      this.timer = setTimeout(function () {
        that.timer = null
        that.save()
      }, SAVE_DELAY_MS)
    }

    save() {
      if (!this.persistEnabled) return
      try { wx.setStorageSync(this.key, this.state) } catch (e) { /* 忽略 */ }
    }

    reset() {
      const changed = []
      Object.keys(DEFAULT_CONFIG).forEach((k) => {
        if (this.state[k] !== DEFAULT_CONFIG[k]) {
          this.state[k] = DEFAULT_CONFIG[k]
          changed.push(k)
        }
      })
      this.save()
      if (changed.length) this.emit(changed, 'reset')
      return changed
    }
  }

  let shared = null
  function getStore(storeOpts) {
    if (storeOpts && storeOpts.fresh) return new ConfigStore(storeOpts)
    if (!shared) shared = new ConfigStore(storeOpts)
    return shared
  }

  return { ConfigStore, getStore, defaults, coerce, DEFAULT_CONFIG }
}

module.exports = { createConfigStore, coerceWith, clamp, num, SAVE_DELAY }
