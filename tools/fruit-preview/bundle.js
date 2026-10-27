(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // utils/config-store.js
  var require_config_store = __commonJS({
    "utils/config-store.js"(exports, module) {
      var SAVE_DELAY = 260;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function num(v, def) {
        const n = Number(v);
        return isFinite(n) ? n : def;
      }
      function coerceWith(schema, key, value) {
        const meta = schema[key];
        if (!meta) return void 0;
        if (meta.type === "bool") {
          if (typeof value === "boolean") return value;
          if (value === 1 || value === "1" || value === "true") return true;
          if (value === 0 || value === "0" || value === "false") return false;
          return meta.def;
        }
        if (meta.type === "enum") {
          const opts = meta.options || [];
          if (opts.indexOf(value) >= 0) return value;
          const asNum = Number(value);
          if (opts.indexOf(asNum) >= 0) return asNum;
          return meta.def;
        }
        let v = num(value, meta.def);
        if (meta.step) v = Math.round(v / meta.step) * meta.step;
        v = clamp(v, meta.min, meta.max);
        return Math.round(v * 1e3) / 1e3;
      }
      function createConfigStore(opts) {
        const o = opts || {};
        const SCHEMA = o.schema || {};
        const PRESETS = o.presets || {};
        const validateFn = o.validate || (() => ({ ok: true, errors: [], warnings: [] }));
        const SAVE_DELAY_MS = num(o.saveDelay, SAVE_DELAY);
        const LOG_TAG = o.logTag || "config";
        const DEFAULT_LV = num(o.defaultDifficulty, 3);
        const defaults = () => {
          const d = {};
          Object.keys(SCHEMA).forEach((k) => {
            d[k] = SCHEMA[k].def;
          });
          return d;
        };
        const DEFAULT_CONFIG = defaults();
        const coerce = (key, value) => coerceWith(SCHEMA, key, value);
        class ConfigStore {
          constructor(storeOpts) {
            const so = storeOpts || {};
            this.key = so.storageKey || o.key;
            this.persistEnabled = so.persist !== false;
            this.state = defaults();
            this.listeners = [];
            this.timer = null;
            if (this.persistEnabled) this.load();
          }
          get(key) {
            if (key === void 0) return this.all();
            const v = this.state[key];
            return v === void 0 ? SCHEMA[key] ? SCHEMA[key].def : void 0 : v;
          }
          all() {
            return Object.assign({}, this.state);
          }
          patch(partial, source) {
            if (!partial) return [];
            const changed = [];
            Object.keys(partial).forEach((k) => {
              if (!SCHEMA[k]) return;
              const next = coerce(k, partial[k]);
              if (next === void 0 || next === this.state[k]) return;
              this.state[k] = next;
              changed.push(k);
            });
            if (!changed.length) return changed;
            this.scheduleSave();
            this.emit(changed, source || "patch");
            return changed;
          }
          set(key, value, source) {
            const p = {};
            p[key] = value;
            this.patch(p, source || "set:" + key);
            return this.get(key);
          }
          applyDifficulty(level, applyPreset) {
            const lv = clamp(Math.round(num(level, DEFAULT_LV)), 1, 5);
            const preset = PRESETS[lv];
            if (!preset) return [];
            const p = { difficulty: lv };
            if (applyPreset !== false) {
              Object.keys(preset).forEach((k) => {
                if (k === "label") return;
                if (SCHEMA[k]) p[k] = preset[k];
              });
            }
            return this.patch(p, "difficulty:" + lv);
          }
          difficultyLabel(level) {
            const p = PRESETS[clamp(Math.round(num(level, DEFAULT_LV)), 1, 5)];
            return p ? p.label : "";
          }
          validate() {
            return validateFn(this.state);
          }
          subscribe(fn) {
            if (typeof fn !== "function") return () => {
            };
            this.listeners.push(fn);
            const that = this;
            return function off() {
              const i = that.listeners.indexOf(fn);
              if (i >= 0) that.listeners.splice(i, 1);
            };
          }
          emit(changed, source) {
            const payload = { config: this.all(), changed, source };
            this.listeners.slice().forEach((fn) => {
              try {
                fn(payload);
              } catch (e) {
                console.error("[" + LOG_TAG + "] listener", e);
              }
            });
          }
          load() {
            let saved = null;
            try {
              saved = wx.getStorageSync(this.key);
            } catch (e) {
            }
            if (saved && typeof saved === "object") {
              Object.keys(SCHEMA).forEach((k) => {
                if (saved[k] !== void 0) this.state[k] = coerce(k, saved[k]);
              });
            }
            return this.state;
          }
          scheduleSave() {
            if (!this.persistEnabled || this.timer) return;
            const that = this;
            this.timer = setTimeout(function() {
              that.timer = null;
              that.save();
            }, SAVE_DELAY_MS);
          }
          save() {
            if (!this.persistEnabled) return;
            try {
              wx.setStorageSync(this.key, this.state);
            } catch (e) {
            }
          }
          reset() {
            const changed = [];
            Object.keys(DEFAULT_CONFIG).forEach((k) => {
              if (this.state[k] !== DEFAULT_CONFIG[k]) {
                this.state[k] = DEFAULT_CONFIG[k];
                changed.push(k);
              }
            });
            this.save();
            if (changed.length) this.emit(changed, "reset");
            return changed;
          }
        }
        let shared = null;
        function getStore2(storeOpts) {
          if (storeOpts && storeOpts.fresh) return new ConfigStore(storeOpts);
          if (!shared) shared = new ConfigStore(storeOpts);
          return shared;
        }
        return { ConfigStore, getStore: getStore2, defaults, coerce, DEFAULT_CONFIG };
      }
      module.exports = { createConfigStore, coerceWith, clamp, num, SAVE_DELAY };
    }
  });

  // utils/fruit-config.js
  var require_fruit_config = __commonJS({
    "utils/fruit-config.js"(exports, module) {
      var STORAGE_KEY = "fruit_cfg_v1";
      var SCHEMA = {
        // ---------------- 难度 ----------------
        difficulty: {
          group: "\u96BE\u5EA6",
          label: "\u96BE\u5EA6\u6863\u4F4D",
          type: "num",
          unit: "\u6863",
          min: 1,
          max: 5,
          step: 1,
          def: 2,
          tip: "\u7B2C 1 \u6863\u6C34\u679C\u5C11\u3001\u843D\u5F97\u6162\u3001\u7BEE\u5B50\u5BBD\uFF1B\u7B2C 5 \u6863\u8981\u6C42\u66F4\u5FEB\u7684\u8EAB\u4F53\u53CD\u5E94"
        },
        // ---------------- 训练目标 ----------------
        durationSec: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u8BAD\u7EC3\u65F6\u957F",
          type: "num",
          unit: "\u79D2",
          min: 20,
          max: 300,
          step: 5,
          def: 90,
          tip: "\u771F\u5B9E\u7ECF\u8FC7\u65F6\u95F4\uFF0C\u4E0D\u542B\u6682\u505C\u4E0E\u4F20\u611F\u5668\u4E2D\u65AD"
        },
        // ---------------- 体感输入 ----------------
        axisX: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u5DE6\u53F3\u8F74",
          type: "enum",
          def: "pitch",
          options: ["pitch", "roll"],
          tip: "\u80F8\u524D\u4F69\u6234\u3001\u80F8\u5E26\u8FC7\u814B\u4E0B\u6700\u9AD8\u70B9\u65F6\uFF0C\u5B9E\u6D4B\u5DE6\u53F3\u79FB\u52A8\u8BFB pitch\uFF1B\u6362\u4F69\u6234\u65B9\u5411\u65F6\u6539\u8FD9\u91CC"
        },
        axisY: { group: "\u4F53\u611F\u8F93\u5165", label: "\u524D\u540E\u8F74\uFF08\u672C\u6E38\u620F\u672A\u4F7F\u7528\uFF09", type: "enum", def: "roll", options: ["roll", "pitch"] },
        invertX: { group: "\u4F53\u611F\u8F93\u5165", label: "\u5DE6\u53F3\u53CD\u5411", type: "bool", def: true, tip: "\u8EAB\u4F53\u4E0E\u679C\u7BEE\u65B9\u5411\u76F8\u53CD\u65F6\u5207\u6362" },
        invertY: { group: "\u4F53\u611F\u8F93\u5165", label: "\u524D\u540E\u53CD\u5411", type: "bool", def: false },
        leftLimit: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u5411\u5DE6\u6EE1\u884C\u7A0B",
          type: "num",
          unit: "\xB0",
          min: 4,
          max: 30,
          step: 1,
          def: 12,
          tip: "\u8EAB\u4F53\u5411\u5DE6\u503E\u591A\u5C11\u5EA6\uFF0C\u679C\u7BEE\u79FB\u52A8\u5230\u6700\u5DE6\u8FB9\uFF1B\u8D8A\u5C0F\u8D8A\u7075\u654F"
        },
        rightLimit: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u5411\u53F3\u6EE1\u884C\u7A0B",
          type: "num",
          unit: "\xB0",
          min: 4,
          max: 30,
          step: 1,
          def: 12,
          tip: "\u8EAB\u4F53\u5411\u53F3\u503E\u591A\u5C11\u5EA6\uFF0C\u679C\u7BEE\u79FB\u52A8\u5230\u6700\u53F3\u8FB9\uFF1B\u8D8A\u5C0F\u8D8A\u7075\u654F"
        },
        deadzoneDeg: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u504F\u5DEE\u6B7B\u533A",
          type: "num",
          unit: "\xB0",
          min: 0,
          max: 6,
          step: 0.5,
          def: 1.5,
          tip: "\u5C0F\u4E8E\u8BE5\u89D2\u5EA6\u7684\u547C\u5438\u6296\u52A8\u4E0D\u8BA9\u679C\u7BEE\u79FB\u52A8"
        },
        smooth: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u8DDF\u624B\u5E73\u6ED1",
          type: "num",
          unit: "",
          min: 0.2,
          max: 1,
          step: 0.02,
          def: 0.55,
          tip: "\u8D8A\u5927\u8D8A\u8DDF\u624B\u3001\u8D8A\u5C0F\u8D8A\u5E73\u987A\uFF1B\u8D8A\u5C0F\u8D8A\u4E0D\u5BB9\u6613\u56E0\u566A\u58F0\u8BA9\u679C\u7BEE\u6296\u52A8"
        },
        // ---------------- 接取与稳定（本游戏的核心） ----------------
        basketWidthPct: {
          group: "\u63A5\u53D6\u4E0E\u7A33\u5B9A",
          label: "\u63A5\u53D6\u5BBD\u5EA6",
          type: "num",
          unit: "% \u5C4F\u5BBD",
          min: 12,
          max: 40,
          step: 0.5,
          def: 24,
          tip: "\u679C\u7BEE\u5BBD\u5EA6\uFF0C\u4E5F\u662F\u5BF9\u51C6\u5224\u5B9A\u7684\u5BBD\u5EA6\uFF1B\u8D8A\u5BBD\u8D8A\u5BB9\u6613\u63A5\u4F4F"
        },
        holdToleranceDeg: {
          group: "\u63A5\u53D6\u4E0E\u7A33\u5B9A",
          label: "\u7A33\u5B9A\u5224\u5B9A\u5BB9\u5DEE",
          type: "num",
          unit: "\xB0",
          min: 2,
          max: 25,
          step: 0.5,
          def: 6,
          tip: "\u4EC5\u7528\u4E8E\u7EDF\u8BA1\u7A33\u5B9A\u7387\uFF1A\u504F\u79BB\u8D85\u8FC7\u8BE5\u89D2\u5EA6\u7684\u65F6\u95F4\u4E0D\u8BA1\u5165\u7A33\u5B9A\uFF0C\u4E0D\u5F71\u54CD\u63A5\u53D6"
        },
        holdToleranceYDeg: {
          group: "\u63A5\u53D6\u4E0E\u7A33\u5B9A",
          label: "\u524D\u540E\u5141\u8BB8\u504F\u79BB",
          type: "num",
          unit: "\xB0",
          min: 3,
          max: 30,
          step: 1,
          def: 12,
          tip: "\u4EC5\u5728\u300C\u540C\u65F6\u7EDF\u8BA1\u524D\u540E\u300D\u5F00\u542F\u65F6\u751F\u6548"
        },
        holdBothAxis: {
          group: "\u63A5\u53D6\u4E0E\u7A33\u5B9A",
          label: "\u540C\u65F6\u7EDF\u8BA1\u524D\u540E",
          type: "bool",
          def: false,
          tip: "\u524D\u540E\u65B9\u5411\u4E5F\u8BA1\u5165\u7A33\u5B9A\u7387\u7EDF\u8BA1\uFF0C\u9002\u5408\u5750\u59FF\u8EAF\u5E72\u63A7\u5236\u8BAD\u7EC3"
        },
        holdStableSec: {
          group: "\u63A5\u53D6\u4E0E\u7A33\u5B9A",
          label: "\u7A33\u5B9A\u5224\u5B9A\u65F6\u95F4",
          type: "num",
          unit: "\u79D2",
          min: 0.1,
          max: 2,
          step: 0.05,
          def: 0.4,
          tip: "\u8FDE\u7EED\u5728\u5BB9\u5DEE\u5185\u8FD9\u4E48\u4E45\u624D\u7B97\u4E00\u6B21\u7A33\u5B9A\uFF08\u53EA\u5F71\u54CD\u7A33\u5B9A\u7387\u7EDF\u8BA1\uFF09"
        },
        holdGraceSec: {
          group: "\u63A5\u53D6\u4E0E\u7A33\u5B9A",
          label: "\u8D8A\u754C\u5BBD\u9650",
          type: "num",
          unit: "\u79D2",
          min: 0,
          max: 1,
          step: 0.05,
          def: 0.25,
          tip: "\u77ED\u65F6\u95F4\u6296\u52A8\u4E0D\u4F1A\u6253\u65AD\u7A33\u5B9A\u8BA1\u65F6\uFF0C\u907F\u514D\u4E00\u6296\u5C31\u65AD"
        },
        // ---------------- 水果与下落 ----------------
        spawnInterval: {
          group: "\u6C34\u679C\u4E0E\u4E0B\u843D",
          label: "\u751F\u6210\u95F4\u9694",
          type: "num",
          unit: "\u79D2",
          min: 0.5,
          max: 3.5,
          step: 0.05,
          def: 1.4,
          tip: "\u5E73\u5747\u95F4\u9694\uFF0C\u5B9E\u9645\u4F1A\u6709 \xB115% \u7684\u81EA\u7136\u6D6E\u52A8"
        },
        fallSpeed: {
          group: "\u6C34\u679C\u4E0E\u4E0B\u843D",
          label: "\u4E0B\u843D\u901F\u5EA6",
          type: "num",
          unit: "\u5C4F\u9AD8/\u79D2",
          min: 0.12,
          max: 0.6,
          step: 0.01,
          def: 0.26,
          tip: "0.26 \u8868\u793A\u7EA6 3.8 \u79D2\u4ECE\u9876\u90E8\u843D\u5230\u7BEE\u5B50\uFF0C\u4E0E\u5C4F\u5E55\u5C3A\u5BF8\u65E0\u5173"
        },
        maxFruits: { group: "\u6C34\u679C\u4E0E\u4E0B\u843D", label: "\u540C\u65F6\u6700\u591A\u6C34\u679C", type: "num", unit: "\u4E2A", min: 1, max: 6, step: 1, def: 3 },
        speedRamp: {
          group: "\u6C34\u679C\u4E0E\u4E0B\u843D",
          label: "\u96BE\u5EA6\u722C\u5347",
          type: "num",
          unit: "%",
          min: 0,
          max: 40,
          step: 2,
          def: 15,
          tip: "\u8BAD\u7EC3\u540E\u6BB5\u6700\u591A\u52A0\u5FEB\u8BE5\u6BD4\u4F8B\uFF1B0 \u8868\u793A\u5168\u7A0B\u901F\u5EA6\u6052\u5B9A"
        },
        // ---------------- 计分 ----------------
        scoreApple: { group: "\u8BA1\u5206", label: "\u82F9\u679C", type: "num", unit: "\u5206", min: 1, max: 50, step: 1, def: 10 },
        scoreOrange: { group: "\u8BA1\u5206", label: "\u6A59\u5B50", type: "num", unit: "\u5206", min: 1, max: 50, step: 1, def: 10 },
        scoreBanana: { group: "\u8BA1\u5206", label: "\u9999\u8549", type: "num", unit: "\u5206", min: 1, max: 50, step: 1, def: 12 },
        scoreStrawberry: { group: "\u8BA1\u5206", label: "\u8349\u8393", type: "num", unit: "\u5206", min: 1, max: 50, step: 1, def: 15 },
        scoreWatermelon: { group: "\u8BA1\u5206", label: "\u897F\u74DC", type: "num", unit: "\u5206", min: 1, max: 50, step: 1, def: 20 },
        comboStep: {
          group: "\u8BA1\u5206",
          label: "\u6BCF\u7EA7\u8FDE\u51FB\u52A0\u6210",
          type: "num",
          unit: "",
          min: 0,
          max: 0.4,
          step: 0.02,
          def: 0.08,
          tip: "\u8FDE\u51FB 1 \u6B21\u5F97 1+step \u500D\uFF0C\u4E4B\u540E\u9010\u7EA7\u53E0\u52A0\uFF0C\u76F4\u5230\u4E0A\u9650"
        },
        comboMaxMul: { group: "\u8BA1\u5206", label: "\u8FDE\u51FB\u52A0\u6210\u4E0A\u9650", type: "num", unit: "\u500D", min: 1, max: 3, step: 0.1, def: 1.8 },
        comboWindowSec: {
          group: "\u8BA1\u5206",
          label: "\u8FDE\u51FB\u4FDD\u6301\u65F6\u95F4",
          type: "num",
          unit: "\u79D2",
          min: 0,
          max: 6,
          step: 0.5,
          def: 2.5,
          tip: "\u8D85\u8FC7\u8BE5\u65F6\u95F4\u6CA1\u6709\u63A5\u4F4F\u6C34\u679C\u5219\u8FDE\u51FB\u5F52\u96F6\uFF1B0 \u8868\u793A\u4E0D\u4F1A\u56E0\u95F4\u9694\u800C\u4E2D\u65AD"
        },
        comboResetOnMiss: { group: "\u8BA1\u5206", label: "\u6F0F\u63A5\u4E2D\u65AD\u8FDE\u51FB", type: "bool", def: true },
        finishBonus: { group: "\u8BA1\u5206", label: "\u5B8C\u6210\u8BAD\u7EC3\u5956\u52B1", type: "num", unit: "\u5206", min: 0, max: 200, step: 5, def: 40 },
        // ---------------- 反馈 ----------------
        sfxOn: { group: "\u53CD\u9988", label: "\u97F3\u6548", type: "bool", def: true },
        sfxVolume: {
          group: "\u53CD\u9988",
          label: "\u97F3\u6548\u97F3\u91CF",
          type: "num",
          unit: "",
          min: 0,
          max: 1,
          step: 0.05,
          def: 0.8,
          tip: "\u63A5\u4F4F / \u8FDE\u51FB / \u6F0F\u63A5\u7684\u63D0\u793A\u97F3\u91CF\uFF1B0 \u8868\u793A\u9759\u97F3\u4F46\u4ECD\u4FDD\u7559\u89C6\u89C9\u53CD\u9988"
        },
        bgmOn: {
          group: "\u53CD\u9988",
          label: "\u80CC\u666F\u97F3\u4E50",
          type: "bool",
          def: true,
          tip: "\u679C\u56ED\u80CC\u666F\u97F3\u4E50\u5728\u8BAD\u7EC3\u4E2D\u5FAA\u73AF\u64AD\u653E\uFF0C\u6682\u505C\u65F6\u540C\u6B65\u6682\u505C"
        },
        bgmVolume: {
          group: "\u53CD\u9988",
          label: "\u97F3\u4E50\u97F3\u91CF",
          type: "num",
          unit: "",
          min: 0,
          max: 1,
          step: 0.05,
          def: 0.26,
          tip: "\u80CC\u666F\u97F3\u4E50\u538B\u5F97\u6BD4\u97F3\u6548\u4F4E\uFF0C\u907F\u514D\u76D6\u4F4F\u547D\u4E2D\u63D0\u793A"
        },
        voiceOn: { group: "\u53CD\u9988", label: "\u8BED\u97F3\u63D0\u793A", type: "bool", def: true },
        vibrateOn: { group: "\u53CD\u9988", label: "\u632F\u52A8\u53CD\u9988", type: "bool", def: true }
      };
      var GROUPS = ["\u96BE\u5EA6", "\u8BAD\u7EC3\u76EE\u6807", "\u4F53\u611F\u8F93\u5165", "\u63A5\u53D6\u4E0E\u7A33\u5B9A", "\u6C34\u679C\u4E0E\u4E0B\u843D", "\u8BA1\u5206", "\u53CD\u9988"];
      var PRESETS = {
        1: {
          label: "\u7B2C 1 \u6863 \xB7 \u5165\u95E8",
          durationSec: 120,
          deadzoneDeg: 2,
          smooth: 0.5,
          basketWidthPct: 30,
          holdToleranceDeg: 10,
          holdStableSec: 0.3,
          holdGraceSec: 0.4,
          spawnInterval: 2,
          fallSpeed: 0.17,
          maxFruits: 2,
          speedRamp: 8,
          comboStep: 0.06,
          comboWindowSec: 3
        },
        2: {
          label: "\u7B2C 2 \u6863 \xB7 \u8F7B\u677E",
          durationSec: 90,
          deadzoneDeg: 1.5,
          smooth: 0.55,
          basketWidthPct: 26,
          holdToleranceDeg: 8,
          holdStableSec: 0.4,
          holdGraceSec: 0.3,
          spawnInterval: 1.5,
          fallSpeed: 0.22,
          maxFruits: 2,
          speedRamp: 12,
          comboStep: 0.08,
          comboWindowSec: 2.5
        },
        3: {
          label: "\u7B2C 3 \u6863 \xB7 \u6807\u51C6",
          durationSec: 80,
          deadzoneDeg: 1.2,
          smooth: 0.6,
          basketWidthPct: 24,
          holdToleranceDeg: 6,
          holdStableSec: 0.5,
          holdGraceSec: 0.25,
          spawnInterval: 1.15,
          fallSpeed: 0.28,
          maxFruits: 3,
          speedRamp: 16,
          comboStep: 0.1,
          comboWindowSec: 2.2
        },
        4: {
          label: "\u7B2C 4 \u6863 \xB7 \u8FDB\u9636",
          durationSec: 70,
          deadzoneDeg: 1,
          smooth: 0.66,
          basketWidthPct: 21,
          holdToleranceDeg: 5,
          holdStableSec: 0.6,
          holdGraceSec: 0.2,
          spawnInterval: 0.9,
          fallSpeed: 0.34,
          maxFruits: 4,
          speedRamp: 20,
          comboStep: 0.12,
          comboWindowSec: 2
        },
        5: {
          label: "\u7B2C 5 \u6863 \xB7 \u6311\u6218",
          durationSec: 60,
          deadzoneDeg: 0.8,
          smooth: 0.72,
          basketWidthPct: 18,
          holdToleranceDeg: 4,
          holdStableSec: 0.7,
          holdGraceSec: 0.15,
          spawnInterval: 0.72,
          fallSpeed: 0.4,
          maxFruits: 5,
          speedRamp: 24,
          comboStep: 0.14,
          comboWindowSec: 1.8
        }
      };
      var HARD_LIMIT = { angle: 45, duration: 300 };
      function validate(state) {
        const s = state || {};
        const errors = [];
        const warnings = [];
        if (!(s.durationSec >= 20 && s.durationSec <= HARD_LIMIT.duration)) {
          errors.push("\u8BAD\u7EC3\u65F6\u957F\u9700\u5728 20~300 \u79D2\u4E4B\u95F4");
        }
        if (!(s.basketWidthPct >= 12 && s.basketWidthPct <= 40)) errors.push("\u63A5\u53D6\u5BBD\u5EA6\u9700\u5728 12%~40% \u5C4F\u5BBD\u4E4B\u95F4");
        if (!(s.holdToleranceDeg >= 2 && s.holdToleranceDeg <= 25)) errors.push("\u7A33\u5B9A\u5224\u5B9A\u5BB9\u5DEE\u9700\u5728 2\xB0~25\xB0 \u4E4B\u95F4");
        if (!(s.holdStableSec >= 0.1)) errors.push("\u7A33\u5B9A\u5224\u5B9A\u65F6\u95F4\u9700\u4E0D\u5C0F\u4E8E 0.1 \u79D2");
        if (!(s.holdGraceSec >= 0)) errors.push("\u8D8A\u754C\u5BBD\u9650\u4E0D\u80FD\u4E3A\u8D1F\u6570");
        if (!(s.spawnInterval > 0)) errors.push("\u6C34\u679C\u751F\u6210\u95F4\u9694\u9700\u5927\u4E8E 0");
        if (!(s.fallSpeed > 0)) errors.push("\u6C34\u679C\u4E0B\u843D\u901F\u5EA6\u9700\u5927\u4E8E 0");
        if (!(s.maxFruits >= 1)) errors.push("\u540C\u65F6\u6700\u591A\u6C34\u679C\u9700\u81F3\u5C11\u4E3A 1");
        if (s.axisX === s.axisY) errors.push("\u5DE6\u53F3\u8F74\u4E0E\u524D\u540E\u8F74\u4E0D\u80FD\u4F7F\u7528\u540C\u4E00\u4E2A\u8F74");
        if (s.comboMaxMul < 1) errors.push("\u8FDE\u51FB\u52A0\u6210\u4E0A\u9650\u4E0D\u80FD\u5C0F\u4E8E 1 \u500D");
        if (s.spawnInterval < 0.8 && s.maxFruits >= 4) warnings.push("\u6C34\u679C\u5BC6\u5EA6\u8F83\u9AD8\uFF0C\u6CE8\u610F\u60A3\u8005\u662F\u5426\u6765\u5F97\u53CA\u79FB\u52A8\u679C\u7BEE");
        if (s.fallSpeed > 0.45) warnings.push("\u4E0B\u843D\u901F\u5EA6\u5F88\u5FEB\uFF0C\u7559\u7ED9\u79FB\u52A8\u679C\u7BEE\u7684\u65F6\u95F4\u5F88\u5C11");
        if (s.basketWidthPct < 15) warnings.push("\u63A5\u53D6\u5BBD\u5EA6\u8F83\u7A84\uFF0C\u9700\u8981\u66F4\u7CBE\u786E\u5730\u628A\u679C\u7BEE\u79FB\u5230\u6C34\u679C\u4E0B\u65B9");
        if (s.holdToleranceDeg < 3) warnings.push("\u7A33\u5B9A\u5BB9\u5DEE\u5F88\u5C0F\uFF0C\u7EDF\u8BA1\u5230\u7684\u7A33\u5B9A\u7387\u4F1A\u504F\u4F4E");
        if (s.holdStableSec > 1) warnings.push("\u7A33\u5B9A\u5224\u5B9A\u65F6\u95F4\u8F83\u957F\uFF0C\u7A33\u5B9A\u7387\u4F1A\u88AB\u538B\u4F4E");
        if (s.holdGraceSec === 0) warnings.push("\u8D8A\u754C\u5BBD\u9650\u4E3A 0\uFF0C\u8F7B\u5FAE\u6296\u52A8\u5C31\u4F1A\u6253\u65AD\u7A33\u5B9A\u8BA1\u65F6");
        if (s.comboWindowSec === 0) warnings.push("\u8FDE\u51FB\u4E0D\u4F1A\u56E0\u65F6\u95F4\u95F4\u9694\u800C\u4E2D\u65AD");
        if (s.speedRamp > 30) warnings.push("\u540E\u6BB5\u63D0\u901F\u5E45\u5EA6\u8F83\u5927\uFF0C\u8BAD\u7EC3\u540E\u534A\u7A0B\u53EF\u80FD\u8DDF\u4E0D\u4E0A");
        return { ok: errors.length === 0, errors, warnings };
      }
      var { createConfigStore } = require_config_store();
      var { ConfigStore, getStore: getStore2, coerce, DEFAULT_CONFIG } = createConfigStore({
        key: STORAGE_KEY,
        schema: SCHEMA,
        presets: PRESETS,
        validate,
        defaultDifficulty: 2,
        logTag: "fruit-config"
      });
      module.exports = {
        FruitConfigStore: ConfigStore,
        getStore: getStore2,
        SCHEMA,
        GROUPS,
        PRESETS,
        DEFAULT_CONFIG,
        STORAGE_KEY,
        validate,
        coerce
      };
    }
  });

  // utils/zero.js
  var require_zero = __commonJS({
    "utils/zero.js"(exports, module) {
      var KEY = "wt_zero_v1";
      var DEF = { roll: 0, pitch: 0, set: false };
      var state = null;
      function wrap180(v) {
        let x = v % 360;
        if (x > 180) x -= 360;
        if (x < -180) x += 360;
        return x;
      }
      function round2(v) {
        return Math.round(v * 100) / 100;
      }
      function syncApp(s) {
        const app = typeof getApp === "function" ? getApp() : null;
        if (app) {
          app.globalData = app.globalData || {};
          app.globalData.zero = s;
        }
      }
      function persist(s) {
        try {
          wx.setStorageSync(KEY, s);
        } catch (e) {
        }
      }
      function load() {
        if (state) return state;
        let s = null;
        try {
          s = wx.getStorageSync(KEY);
        } catch (e) {
        }
        if (s && typeof s.roll === "number" && typeof s.pitch === "number") {
          state = { roll: wrap180(s.roll), pitch: wrap180(s.pitch), set: !!s.set };
        } else {
          state = { roll: DEF.roll, pitch: DEF.pitch, set: DEF.set };
        }
        syncApp(state);
        return state;
      }
      function get() {
        const s = load();
        return { roll: s.roll, pitch: s.pitch, set: s.set };
      }
      function set(roll, pitch) {
        state = {
          roll: round2(wrap180(Number(roll) || 0)),
          pitch: round2(wrap180(Number(pitch) || 0)),
          set: true
        };
        persist(state);
        syncApp(state);
        return get();
      }
      function reset() {
        state = { roll: 0, pitch: 0, set: false };
        persist(state);
        syncApp(state);
        return get();
      }
      function setFromAngles(rawRoll, rawPitch) {
        return set(-(Number(rawRoll) || 0), -(Number(rawPitch) || 0));
      }
      function setFromSamples(samples) {
        if (!samples || !samples.length) return null;
        let sr = 0;
        let sp = 0;
        let n = 0;
        samples.forEach((s) => {
          if (!s) return;
          if (typeof s.roll === "number") sr += s.roll;
          if (typeof s.pitch === "number") sp += s.pitch;
          n++;
        });
        if (!n) return null;
        return set(-sr / n, -sp / n);
      }
      function apply(d) {
        if (!d) return d;
        if (typeof d.roll !== "number" && typeof d.pitch !== "number") return d;
        const z = load();
        const out = Object.assign({}, d);
        if (typeof d.roll === "number") {
          out.rawRoll = d.rawRoll === void 0 ? d.roll : d.rawRoll;
          out.roll = wrap180(d.roll + z.roll);
        }
        if (typeof d.pitch === "number") {
          out.rawPitch = d.rawPitch === void 0 ? d.pitch : d.rawPitch;
          out.pitch = wrap180(d.pitch + z.pitch);
        }
        return out;
      }
      module.exports = {
        get,
        set,
        reset,
        setFromAngles,
        setFromSamples,
        apply,
        wrap180
      };
    }
  });

  // utils/motion.js
  var require_motion = __commonJS({
    "utils/motion.js"(exports, module) {
      var zero = require_zero();
      var CAL_TOTAL_MS = 3e3;
      var CAL_BASE_MS = 800;
      var CAL_MIN_SAMPLES = 15;
      var CAL_STD_LIMIT = 2.6;
      var CAL_MAX_SWING = 9;
      var STALE_MS = 1200;
      var OUTLIER_JUMP = 45;
      var SWAY_BUCKETS = [0.2, 0.4, 0.6, 0.8, 1];
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function round(v, d) {
        const p = Math.pow(10, d || 0);
        return Math.round(v * p) / p;
      }
      function stdDev(arr) {
        if (!arr.length) return 0;
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        const m = s / arr.length;
        let v = 0;
        for (let i = 0; i < arr.length; i++) v += (arr[i] - m) * (arr[i] - m);
        return Math.sqrt(v / arr.length);
      }
      function mean(arr) {
        if (!arr.length) return 0;
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
      }
      var MotionTracker = class {
        /**
         * @param {object} cfg utils/wire-config 的 store（提供活动边界 / 灵敏度 / 死区 / 轴向）
         */
        constructor(cfg2) {
          this.cfg = cfg2;
          this.roll = 0;
          this.pitch = 0;
          this.rawRoll = 0;
          this.rawPitch = 0;
          this.nx = 0;
          this.ny = 0;
          this.angleX = 0;
          this.angleY = 0;
          this.load = 0;
          this.dir = "center";
          this.stale = true;
          this.hasSignal = false;
          this.lastFrameAt = 0;
          this.rateHz = 0;
          this.outliers = 0;
          this.quality = 1;
          this.simMode = false;
          this.simX = 0;
          this.simY = 0;
          this.simTargetX = 0;
          this.simTargetY = 0;
          this.cal = {
            active: false,
            startedAt: 0,
            elapsed: 0,
            total: CAL_TOTAL_MS,
            samples: [],
            result: null,
            // null | 'ok' | 'unstable' | 'no_data'
            message: ""
          };
          this.traj = {
            pathLength: 0,
            seconds: 0,
            peak: 0,
            sway: [0, 0, 0, 0, 0],
            samples: 0
          };
          this.prevNx = 0;
          this.prevNy = 0;
          this._rateAt = 0;
          this._rateCount = 0;
          this._deltaAcc = 0;
          this._deltaAt = 0;
        }
        // ---------------------------------------------------------------- 输入
        /** 传感器一帧：{ roll, pitch }（已由 witble 叠加全局零点） */
        feed(frame) {
          if (!frame) return;
          const hasRoll = typeof frame.roll === "number";
          const hasPitch = typeof frame.pitch === "number";
          if (!hasRoll && !hasPitch) return;
          const now = Date.now();
          const nextRoll = hasRoll ? frame.roll : this.roll;
          const nextPitch = hasPitch ? frame.pitch : this.pitch;
          if (this.hasSignal && now - this.lastFrameAt < 400) {
            const jump = Math.max(Math.abs(nextRoll - this.roll), Math.abs(nextPitch - this.pitch));
            if (jump > OUTLIER_JUMP) {
              this.outliers += 1;
              this.lastFrameAt = now;
              this._countRate(now);
              return;
            }
          }
          this.roll = nextRoll;
          this.pitch = nextPitch;
          if (typeof frame.rawRoll === "number") this.rawRoll = frame.rawRoll;
          if (typeof frame.rawPitch === "number") this.rawPitch = frame.rawPitch;
          this.hasSignal = true;
          this.stale = false;
          this.lastFrameAt = now;
          this._countRate(now);
          if (this.cal.active) {
            const r = typeof frame.rawRoll === "number" ? frame.rawRoll : nextRoll;
            const p = typeof frame.rawPitch === "number" ? frame.rawPitch : nextPitch;
            this.cal.samples.push({ t: now, roll: r, pitch: p });
          }
        }
        _countRate(now) {
          if (!this._rateAt) {
            this._rateAt = now;
            this._rateCount = 0;
          }
          this._rateCount += 1;
          const span = now - this._rateAt;
          if (span >= 1e3) {
            this.rateHz = Math.round(this._rateCount * 1e3 / span);
            this._rateAt = now;
            this._rateCount = 0;
            const bad = clamp(this.outliers / Math.max(4, this.rateHz), 0, 1);
            this.quality = round(1 - bad * 0.8, 2);
            this.outliers = 0;
          }
        }
        // ---------------------------------------------------------------- 模拟
        setSimMode(on) {
          this.simMode = !!on;
          if (!this.simMode) {
            this.simTargetX = 0;
            this.simTargetY = 0;
          }
        }
        /** 模拟输入（归一化 -1~1），带 0.35s 缓动，避免瞬移 */
        setSimTarget(x, y) {
          this.simTargetX = clamp(Number(x) || 0, -1, 1);
          if (typeof y === "number") this.simTargetY = clamp(y, -1, 1);
        }
        nudgeSim(dx, dy) {
          this.simTargetX = clamp(this.simTargetX + (dx || 0), -1, 1);
          this.simTargetY = clamp(this.simTargetY + (dy || 0), -1, 1);
        }
        centerSim() {
          this.simTargetX = 0;
          this.simTargetY = 0;
        }
        get source() {
          return this.simMode ? "simulation" : "real";
        }
        /** 真实数据是否可用（模拟模式下恒为 true） */
        isLive() {
          return this.simMode || !this.stale && this.hasSignal;
        }
        // ---------------------------------------------------------------- 标定
        beginCalibration() {
          this.cal.active = true;
          this.cal.startedAt = Date.now();
          this.cal.elapsed = 0;
          this.cal.samples = [];
          this.cal.result = null;
          this.cal.message = "";
        }
        cancelCalibration() {
          this.cal.active = false;
          this.cal.elapsed = 0;
          this.cal.samples = [];
        }
        /** 每帧推进标定；返回 true 表示刚刚完成（结果见 cal.result） */
        _tickCalibration(now) {
          if (!this.cal.active) return false;
          this.cal.elapsed = now - this.cal.startedAt;
          if (this.cal.elapsed < CAL_TOTAL_MS) return false;
          const samples = this.cal.samples || [];
          this.cal.active = false;
          this.cal.elapsed = CAL_TOTAL_MS;
          if (samples.length < CAL_MIN_SAMPLES) {
            this.cal.result = "no_data";
            this.cal.message = "\u6CA1\u6709\u6536\u5230\u8DB3\u591F\u7684\u59FF\u6001\u6570\u636E\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5";
            return true;
          }
          const rolls = samples.map((s) => s.roll);
          const pitches = samples.map((s) => s.pitch);
          const sdRoll = stdDev(rolls);
          const sdPitch = stdDev(pitches);
          const swing = Math.max(
            Math.max.apply(null, rolls) - Math.min.apply(null, rolls),
            Math.max.apply(null, pitches) - Math.min.apply(null, pitches)
          );
          if (sdRoll > CAL_STD_LIMIT || sdPitch > CAL_STD_LIMIT || swing > CAL_MAX_SWING) {
            this.cal.result = "unstable";
            this.cal.message = "\u68C0\u6D4B\u5230\u8EAB\u4F53\u6643\u52A8\uFF08" + round(Math.max(sdRoll, sdPitch), 1) + "\xB0\uFF09\uFF0C\u8BF7\u5750\u7A33\u6216\u7AD9\u7A33\u540E\u91CD\u65B0\u6807\u5B9A";
            return true;
          }
          const tail = samples.filter((s) => now - s.t <= CAL_BASE_MS);
          const use = tail.length >= 5 ? tail : samples;
          const baseRoll = mean(use.map((s) => s.roll));
          const basePitch = mean(use.map((s) => s.pitch));
          zero.set(-baseRoll, -basePitch);
          this.cal.result = "ok";
          this.cal.message = "\u6807\u5B9A\u5B8C\u6210\uFF1A\u9759\u6B62\u59FF\u6001\u5DF2\u8BB0\u4E3A\u4E2D\u7ACB\u4F4D";
          this.nx = 0;
          this.ny = 0;
          this.angleX = 0;
          this.angleY = 0;
          this.prevNx = 0;
          this.prevNy = 0;
          return true;
        }
        // ---------------------------------------------------------------- 每帧更新
        update(dt) {
          const now = Date.now();
          const step = clamp(Number(dt) || 1 / 60, 1e-3, 0.1);
          this._tickCalibration(now);
          if (!this.simMode && this.hasSignal && now - this.lastFrameAt > STALE_MS) this.stale = true;
          const cfg2 = this.cfg;
          const axisX = cfg2.get("axisX");
          const axisY = cfg2.get("axisY");
          const sens = Number(cfg2.get("sensitivity")) || 1;
          const dead = Number(cfg2.get("deadzoneDeg")) || 0;
          const leftLimit = Math.max(3, Number(cfg2.get("leftLimit")) || 12);
          const rightLimit = Math.max(3, Number(cfg2.get("rightLimit")) || 12);
          const fwdLimit = Math.max(3, Number(cfg2.get("forwardLimit")) || 12);
          const backLimit = Math.max(3, Number(cfg2.get("backLimit")) || 12);
          let targetX;
          let targetY;
          if (this.simMode) {
            const a = 1 - Math.pow(1 - 0.22, step * 60);
            this.simX += (this.simTargetX - this.simX) * a;
            this.simY += (this.simTargetY - this.simY) * a;
            targetX = this.simX;
            targetY = this.simY;
            this.angleX = targetX * (targetX < 0 ? leftLimit : rightLimit);
            this.angleY = targetY * (targetY < 0 ? backLimit : fwdLimit);
            this.stale = false;
          } else {
            const rawX = cfg2.get("invertX") ? -1 : 1;
            const rawY = cfg2.get("invertY") ? -1 : 1;
            const ax = axisX === "roll" ? this.roll : this.pitch;
            const ay = axisY === "roll" ? this.roll : this.pitch;
            const degX = rawX * ax;
            const degY = rawY * ay;
            const dx = Math.abs(degX) < dead ? 0 : degX - (degX > 0 ? dead : -dead);
            const dy = Math.abs(degY) < dead ? 0 : degY - (degY > 0 ? dead : -dead);
            this.angleX = degX;
            this.angleY = degY;
            targetX = clamp(dx * sens / (dx < 0 ? leftLimit : rightLimit), -1, 1);
            targetY = clamp(dy * sens / (dy < 0 ? backLimit : fwdLimit), -1, 1);
          }
          const smooth = clamp(Number(cfg2.get("smooth")) || 0.55, 0.2, 1);
          if (!this.simMode && this.stale) {
            const back = 1 - Math.pow(1 - 0.08, step * 60);
            this.nx += (0 - this.nx) * back;
            this.ny += (0 - this.ny) * back;
          } else {
            const alpha = 1 - Math.pow(1 - smooth, step * 60);
            this.nx += (targetX - this.nx) * alpha;
            this.ny += (targetY - this.ny) * alpha;
          }
          this.nx = clamp(this.nx, -1, 1);
          this.ny = clamp(this.ny, -1, 1);
          this.load = Math.max(Math.abs(this.nx), Math.abs(this.ny) * 0.75);
          if (this.nx < -0.1) this.dir = "left";
          else if (this.nx > 0.1) this.dir = "right";
          else this.dir = "center";
          return this;
        }
        // ---------------------------------------------------------------- 轨迹统计
        resetTrajectory() {
          this.traj = { pathLength: 0, seconds: 0, peak: 0, sway: [0, 0, 0, 0, 0], samples: 0 };
          this.prevNx = this.nx;
          this.prevNy = this.ny;
        }
        /** 每帧累计（仅 PLAYING 时调用）：归一化单位，不是厘米 */
        tickTrajectory(dt) {
          const step = clamp(Number(dt) || 0, 0, 0.1);
          if (step <= 0) return;
          const d = Math.sqrt(
            (this.nx - this.prevNx) * (this.nx - this.prevNx) + (this.ny - this.prevNy) * (this.ny - this.prevNy)
          );
          this.prevNx = this.nx;
          this.prevNy = this.ny;
          const t = this.traj;
          t.pathLength += d;
          t.seconds += step;
          t.samples += 1;
          if (Math.abs(this.nx) > t.peak) t.peak = Math.abs(this.nx);
          const a = Math.abs(this.nx);
          let idx = 0;
          while (idx < SWAY_BUCKETS.length - 1 && a > SWAY_BUCKETS[idx]) idx++;
          t.sway[idx] += step;
        }
        /** 轨迹摘要：明确标注为「姿态代理指标」 */
        getTrajectory() {
          const t = this.traj;
          const total = t.sway.reduce((a, b) => a + b, 0);
          const dist = SWAY_BUCKETS.map((b, i) => {
            const lo = i === 0 ? 0 : SWAY_BUCKETS[i - 1];
            return { label: lo.toFixed(1) + "~" + b.toFixed(1), ratio: total > 0 ? t.sway[i] / total : 0 };
          });
          return {
            pathLength: round(t.pathLength, 2),
            seconds: round(t.seconds, 2),
            peak: round(t.peak, 2),
            avgRate: t.seconds > 0.5 ? round(t.pathLength / t.seconds, 3) : 0,
            sway: dist,
            note: "\u5F52\u4E00\u5316\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u975E\u771F\u5B9E\u4F4D\u79FB"
          };
        }
        reset() {
          this.nx = 0;
          this.ny = 0;
          this.angleX = 0;
          this.angleY = 0;
          this.load = 0;
          this.dir = "center";
          this.prevNx = 0;
          this.prevNy = 0;
          this.resetTrajectory();
          this.cancelCalibration();
        }
      };
      module.exports = {
        MotionTracker,
        CAL_TOTAL_MS,
        CAL_BASE_MS,
        STALE_MS,
        SWAY_BUCKETS
      };
    }
  });

  // pkgFruit/games/fruit/score.js
  var require_score = __commonJS({
    "pkgFruit/games/fruit/score.js"(exports, module) {
      function round1(v) {
        return Math.round(v * 10) / 10;
      }
      var ScoreManager = class {
        constructor(cfg2) {
          this.cfg = cfg2;
          this.reset();
        }
        reset() {
          this.base = 0;
          this.hits = 0;
          this.misses = 0;
          this.combo = 0;
          this.maxCombo = 0;
          this.comboBonus = 0;
          this.finishBonus = 0;
          this.sinceHit = 0;
          this.lastGain = 0;
          this.settled = false;
          this.byType = {};
        }
        /** 连击倍率：第 n 次连续接住 → 1 + (n-1)*step，上限 comboMaxMul */
        get comboMul() {
          const step = Number(this.cfg.get("comboStep")) || 0;
          const cap = Math.max(1, Number(this.cfg.get("comboMaxMul")) || 1);
          return Math.min(cap, 1 + Math.max(0, this.combo - 1) * step);
        }
        /**
         * 接住一个水果。
         * @param {number} value 该水果的基础分
         * @param {string} type 水果类型 id（用于分类统计）
         * @returns {{gain:number, combo:number, mul:number}}
         */
        hit(value, type) {
          const base = Math.max(0, Number(value) || 0);
          this.combo += 1;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          const mul = this.comboMul;
          const gain = Math.round(base * mul);
          this.base += gain;
          this.comboBonus += Math.max(0, gain - base);
          this.hits += 1;
          this.sinceHit = 0;
          this.lastGain = gain;
          if (type) this.byType[type] = (this.byType[type] || 0) + 1;
          return { gain, combo: this.combo, mul };
        }
        miss() {
          this.misses += 1;
          if (this.cfg.get("comboResetOnMiss")) this.combo = 0;
        }
        /** 每帧推进：处理连击保持时间（0 表示不因时间中断） */
        update(dt) {
          const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
          const win = Number(this.cfg.get("comboWindowSec")) || 0;
          if (win > 0 && this.combo > 0) {
            this.sinceHit += step;
            if (this.sinceHit > win) {
              this.combo = 0;
              this.sinceHit = 0;
            }
          }
        }
        addFinish() {
          if (this.finishBonus > 0) return 0;
          const v = Math.max(0, Number(this.cfg.get("finishBonus")) || 0);
          this.finishBonus = v;
          return v;
        }
        /** 接取成功率；没有生成过水果时返回 0（不会除零） */
        get accuracy() {
          const total = this.hits + this.misses;
          return total > 0 ? this.hits / total : 0;
        }
        get total() {
          const raw = this.base + this.finishBonus;
          return Math.max(0, Math.round(raw));
        }
        snapshot() {
          return {
            total: this.total,
            base: Math.round(this.base),
            // 含连击加成后的实际得分
            rawBase: Math.round(this.base - this.comboBonus),
            // 不含加成的原始分（分项相加 = 总分）
            hits: this.hits,
            misses: this.misses,
            accuracy: round1(this.accuracy * 100) / 100,
            maxCombo: this.maxCombo,
            comboBonus: Math.round(this.comboBonus),
            finishBonus: Math.round(this.finishBonus),
            byType: Object.assign({}, this.byType)
          };
        }
      };
      module.exports = { ScoreManager };
    }
  });

  // pkgFruit/games/fruit/spawner.js
  var require_spawner = __commonJS({
    "pkgFruit/games/fruit/spawner.js"(exports, module) {
      var FIELD_MIN_X = 0.09;
      var FIELD_MAX_X = 0.91;
      var MIN_X_GAP = 0.19;
      var NEAR_TOP = 0.34;
      var FRUIT_TYPES = [
        { id: "apple", name: "\u82F9\u679C", scoreKey: "scoreApple", weight: 26, r: 28 },
        { id: "orange", name: "\u6A59\u5B50", scoreKey: "scoreOrange", weight: 22, r: 27 },
        { id: "banana", name: "\u9999\u8549", scoreKey: "scoreBanana", weight: 18, r: 30 },
        { id: "strawberry", name: "\u8349\u8393", scoreKey: "scoreStrawberry", weight: 18, r: 25 },
        { id: "watermelon", name: "\u897F\u74DC", scoreKey: "scoreWatermelon", weight: 16, r: 34 }
      ];
      var DESIGN_WIDTH = 390;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function mulberry32(seed) {
        let a = seed >>> 0;
        return function() {
          a = a + 1831565813 >>> 0;
          let t = a;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }
      var FruitSpawner = class {
        constructor(cfg2, opts) {
          const o = opts || {};
          this.cfg = cfg2;
          this.seed = typeof o.seed === "number" ? o.seed : 20261026;
          this.reset();
        }
        reset() {
          this.rng = mulberry32(this.seed);
          this.timer = 0.9;
          this.serial = 0;
        }
        _pickType() {
          const list = FRUIT_TYPES;
          let total = 0;
          for (let i = 0; i < list.length; i++) total += list[i].weight;
          let r = this.rng() * total;
          for (let i = 0; i < list.length; i++) {
            r -= list[i].weight;
            if (r <= 0) return list[i];
          }
          return list[0];
        }
        /**
         * 决定横向位置。
         * 果篮会随身体左右倾移动，所以水果要散布在整条可及范围内，
         * 并且刻意避开果篮当前所在的位置——原地不动接不到，必须把篮子移过去。
         * 同时尽量避开同一批下落的水果，避免完全重叠。
         *
         * @param {Array} fruits 场上水果
         * @param {object} [avoid] { x, half }：果篮当前位置与半宽
         */
        _pickX(fruits, avoid) {
          const minX = FIELD_MIN_X;
          const maxX = FIELD_MAX_X;
          const gap = Math.min(MIN_X_GAP, Math.max(0.02, (maxX - minX) * 0.32));
          const blockers = (fruits || []).filter((f) => f.state === "fall" && f.y < NEAR_TOP).map((f) => f.x);
          const keepOut = avoid && typeof avoid.x === "number" ? Math.max(0, Number(avoid.half) || 0) * 1.15 : 0;
          for (let attempt = 0; attempt < 16; attempt++) {
            const x = minX + this.rng() * (maxX - minX);
            let ok = true;
            if (keepOut && Math.abs(x - avoid.x) < keepOut) ok = false;
            for (let i = 0; i < blockers.length; i++) {
              if (Math.abs(blockers[i] - x) < gap) {
                ok = false;
                break;
              }
            }
            if (ok) return x;
          }
          let best = 0.5;
          let bestScore = -1;
          for (let attempt = 0; attempt < 12; attempt++) {
            const x = minX + this.rng() * (maxX - minX);
            let g = 1;
            for (let i = 0; i < blockers.length; i++) g = Math.min(g, Math.abs(blockers[i] - x));
            const away = !keepOut || Math.abs(x - avoid.x) >= keepOut;
            const score = (away ? 10 : 0) + g;
            if (score > bestScore) {
              bestScore = score;
              best = x;
            }
          }
          return best;
        }
        /**
         * 推进生成计时。
         * @param {number} dt 秒
         * @param {object} ctx { fruits, progress, basketX, basketHalf }
         * @returns {Array} 本帧要生成的水果描述
         */
        tick(dt, ctx) {
          const c = ctx || {};
          const fruits = c.fruits || [];
          const progress = clamp(Number(c.progress) || 0, 0, 1);
          const cfg2 = this.cfg;
          const out = [];
          const interval = Math.max(0.2, Number(cfg2.get("spawnInterval")) || 1.4);
          const maxFruits = Math.max(1, Math.round(Number(cfg2.get("maxFruits")) || 3));
          const baseSpeed = Math.max(0.02, Number(cfg2.get("fallSpeed")) || 0.26);
          const rampPct = Math.max(0, Number(cfg2.get("speedRamp")) || 0) / 100;
          const ramp = 1 + rampPct * progress;
          this.timer -= dt;
          if (this.timer > 0) return out;
          if (fruits.filter((f) => f.state === "fall").length >= maxFruits) {
            this.timer = 0.25;
            return out;
          }
          this.timer = Math.max(0.35, interval * (0.85 + this.rng() * 0.3) / ramp);
          const type = this._pickType();
          const x = this._pickX(fruits, {
            x: c.basketX,
            half: c.basketHalf
          });
          this.serial += 1;
          out.push({
            id: "f" + this.serial,
            type: type.id,
            x,
            y: -0.03,
            vy: baseSpeed * (0.92 + this.rng() * 0.18) * ramp,
            rot: (this.rng() - 0.5) * 0.5,
            vrot: (this.rng() - 0.5) * 2.4,
            swayAmp: 3e-3 + this.rng() * 7e-3,
            swayPhase: this.rng() * Math.PI * 2,
            swaySpeed: 1.1 + this.rng() * 1.4,
            baseX: x
          });
          return out;
        }
      };
      function scoreOf(cfg2, typeId) {
        const type = FRUIT_TYPES.find((t) => t.id === typeId);
        if (!type) return 10;
        const v = Number(cfg2.get(type.scoreKey));
        return isFinite(v) && v > 0 ? v : 10;
      }
      module.exports = {
        FruitSpawner,
        FRUIT_TYPES,
        DESIGN_WIDTH,
        scoreOf,
        mulberry32,
        MIN_X_GAP,
        NEAR_TOP
      };
    }
  });

  // pkgFruit/games/fruit/engine.js
  var require_engine = __commonJS({
    "pkgFruit/games/fruit/engine.js"(exports, module) {
      var { MotionTracker } = require_motion();
      var { ScoreManager } = require_score();
      var { FruitSpawner, FRUIT_TYPES, DESIGN_WIDTH, scoreOf } = require_spawner();
      var STATE = {
        IDLE: "IDLE",
        READY: "READY",
        CALIBRATING: "CALIBRATING",
        COUNTDOWN: "COUNTDOWN",
        PLAYING: "PLAYING",
        PAUSED: "PAUSED",
        SENSOR_ERROR: "SENSOR_ERROR",
        RESULT: "RESULT",
        ABORTED: "ABORTED"
      };
      var COUNTDOWN_SEC = 3;
      var SENSOR_RESUME_MS = 600;
      var CATCH_LINE = 1;
      var MISS_AFTER = 0.035;
      var REMOVE_AFTER = 1.3;
      var CATCH_ANIM_SEC = 0.36;
      var BASKET_EDGE = 0.02;
      var RADIUS_MAP = {};
      FRUIT_TYPES.forEach((t) => {
        RADIUS_MAP[t.id] = t.r / DESIGN_WIDTH;
      });
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function round(v, d) {
        const p = Math.pow(10, d || 0);
        return Math.round(v * p) / p;
      }
      var FruitEngine2 = class {
        constructor(opts) {
          const o = opts || {};
          this.cfg = o.cfg;
          this.motion = new MotionTracker(this.cfg);
          this.score = new ScoreManager(this.cfg);
          this.spawner = new FruitSpawner(this.cfg, { seed: o.seed });
          this.state = STATE.IDLE;
          this.prevState = STATE.IDLE;
          this.events = [];
          this.time = 0;
          this.t = 0;
          this.elapsedSec = 0;
          this.countdown = COUNTDOWN_SEC;
          this.startedAt = 0;
          this.sessionSeed = "";
          this.summary = null;
          this.finished = false;
          this.fruits = [];
          this.pops = [];
          this.bursts = [];
          this.fxSeq = 0;
          this.basket = {
            x: 0.5,
            nx: 0,
            // 当前控制量（-1 左 … +1 右），渲染层画位置指示
            vx: 0,
            // 横向速度（屏宽/秒），渲染层用来做倾斜
            tilt: 0,
            // -1 左 … 1 右（渲染层用来倾斜篮子）
            squash: 0,
            // 接住时的压缩动画 0~1
            flash: 0
            // 接住时的暖色高光 0~1
          };
          this.basketHalf = 0.12;
          this.catchHalf = 0.11;
          this.basketMinX = 0.5 - this.basketHalf - BASKET_EDGE;
          this.basketMaxX = 0.5 + this.basketHalf + BASKET_EDGE;
          this.align = { under: false, dx: 0, targetId: "" };
          this.hold = {
            devX: 0,
            // 平滑后的左右偏离（°）
            devY: 0,
            // 平滑后的前后偏离（°）
            inRange: true,
            // 当前是否在容差内
            holding: true,
            // 是否已经进入"稳定"状态（连续在容差内够时间）
            since: 0,
            // 已连续在容差内多久（秒）
            grace: 0,
            // 越界后剩余的宽限时间（秒）
            progress: 0,
            // 0~1，稳定计时进度
            timeSec: 0,
            // 本局在容差内的累计时间
            bestSec: 0,
            // 最长连续稳定
            runSec: 0,
            // 当前连续稳定
            outCount: 0,
            // 偏离超限次数
            devSum: 0,
            devSamples: 0,
            maxDev: 0,
            lostAt: 0
          };
          this.missFlash = 0;
          this.comboFlash = 0;
          this.comboMilestones = [3, 5, 8, 12, 16];
          this._milestoneIdx = 0;
          this.simMode = false;
          this.calibrated = false;
          this.lastCalibration = null;
          this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 };
          this._resumeAt = 0;
          this._lowTimeWarned = false;
          this.refreshGeometry();
        }
        // ---------------------------------------------------------------- 派生参数
        /** 篮子宽度 / 可移动范围随配置实时变化（治疗师改完立刻生效） */
        refreshGeometry() {
          const widthPct = Number(this.cfg.get("basketWidthPct")) || 24;
          this.basketHalf = clamp(widthPct / 200, 0.06, 0.2);
          this.catchHalf = this.basketHalf * 0.94;
          const edge = this.basketHalf + BASKET_EDGE;
          this.basketMinX = edge;
          this.basketMaxX = 1 - edge;
          this.basket.x = clamp(this.basket.x, this.basketMinX, this.basketMaxX);
        }
        // ---------------------------------------------------------------- 状态
        setState(next) {
          if (this.state === next) return;
          this.prevState = this.state;
          this.state = next;
          this.time = 0;
          this._emit("state", { state: next, prev: this.prevState });
        }
        _emit(type, extra) {
          this.events.push(Object.assign({ type, at: Date.now() }, extra || {}));
        }
        drainEvents() {
          const list = this.events;
          this.events = [];
          return list;
        }
        get isPlaying() {
          return this.state === STATE.PLAYING;
        }
        get catchAnimSec() {
          return CATCH_ANIM_SEC;
        }
        // ---------------------------------------------------------------- 流程
        prepare() {
          this.refreshGeometry();
          this.setState(STATE.READY);
          this.motion.reset();
          this.calibrated = !!this.lastCalibration && this.lastCalibration.ok;
          return this.state;
        }
        calibrate() {
          if (this.state !== STATE.READY && this.state !== STATE.CALIBRATING) return false;
          if (this.simMode) {
            this.lastCalibration = { ok: true, message: "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u8DF3\u8FC7\u771F\u5B9E\u6807\u5B9A", at: Date.now(), simulated: true };
            this.calibrated = true;
            this._emit("calibrate", this.lastCalibration);
            return true;
          }
          this.motion.beginCalibration();
          this.setState(STATE.CALIBRATING);
          return true;
        }
        cancelCalibration() {
          if (this.state !== STATE.CALIBRATING) return;
          this.motion.cancelCalibration();
          this.setState(STATE.READY);
        }
        /** 校验配置并进入倒计时；返回 { ok, errors, warnings } */
        startCountdown() {
          const v = this.cfg.validate();
          if (!v.ok) return { ok: false, errors: v.errors };
          if (!this.simMode && !this.motion.isLive()) {
            return { ok: false, errors: ["\u6CA1\u6709\u53EF\u7528\u7684\u4F20\u611F\u5668\u6570\u636E\uFF0C\u8BF7\u5148\u8FDE\u63A5\u8BBE\u5907\u6216\u5207\u6362\u5230\u6A21\u62DF\u6A21\u5F0F"] };
          }
          this.beginRound();
          this.setState(STATE.COUNTDOWN);
          this.countdown = COUNTDOWN_SEC;
          return { ok: true, warnings: v.warnings };
        }
        beginRound() {
          this.refreshGeometry();
          this.score.reset();
          this.spawner.reset();
          this.motion.resetTrajectory();
          this.elapsedSec = 0;
          this.fruits.length = 0;
          this.pops.length = 0;
          this.bursts.length = 0;
          this.basket.x = 0.5;
          this.basket.nx = 0;
          this.basket.vx = 0;
          this.basket.tilt = 0;
          this.basket.squash = 0;
          this.basket.flash = 0;
          this.align = { under: false, dx: 0, targetId: "" };
          this._resetHold();
          this.missFlash = 0;
          this.comboFlash = 0;
          this._milestoneIdx = 0;
          this._lowTimeWarned = false;
          this.finished = false;
          this.summary = null;
          this.startedAt = Date.now();
          this.sessionSeed = "fruit_" + this.startedAt + "_" + Math.random().toString(36).slice(2, 7);
          this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 };
          this._resumeAt = 0;
        }
        pause() {
          if (this.state !== STATE.PLAYING && this.state !== STATE.SENSOR_ERROR) return false;
          this._closeInterruption();
          this.setState(STATE.PAUSED);
          return true;
        }
        resume() {
          if (this.state !== STATE.PAUSED) return false;
          this.setState(STATE.PLAYING);
          this.lastFrameAt = Date.now();
          return true;
        }
        togglePause() {
          if (this.state === STATE.PLAYING) return this.pause();
          if (this.state === STATE.PAUSED) return this.resume();
          return false;
        }
        restart() {
          this.beginRound();
          return this.startCountdown();
        }
        toIntro() {
          if (this.state === STATE.PLAYING || this.state === STATE.PAUSED || this.state === STATE.COUNTDOWN || this.state === STATE.SENSOR_ERROR) {
            this.finish("aborted");
          }
          this.summary = null;
          this.motion.cancelCalibration();
          this.setState(STATE.IDLE);
          return this.state;
        }
        enterSensorError() {
          if (this.state === STATE.PLAYING) this._enterSensorError();
        }
        /** 结算：只执行一次（防重复加分 / 重复写记录） */
        finish(reason) {
          if (this.state === STATE.RESULT || this.state === STATE.ABORTED) return this.summary;
          if (this.score.settled) return this.summary;
          this.score.settled = true;
          this.finished = true;
          this._closeInterruption();
          const plannedSec = Number(this.cfg.get("durationSec")) || 90;
          const completed = reason !== "aborted" && this.elapsedSec >= plannedSec - 0.05;
          if (completed) this.score.addFinish();
          const snap = this.score.snapshot();
          const traj = this.motion.getTrajectory();
          const acc = this.score.accuracy;
          const grade = acc >= 0.9 ? "S" : acc >= 0.78 ? "A" : acc >= 0.6 ? "B" : "C";
          this.summary = {
            recordId: this.sessionSeed || "fruit_" + Date.now(),
            gameId: "fruit",
            scene: "fruit-orchard-01",
            difficulty: Number(this.cfg.get("difficulty")) || 2,
            rangeConfig: {
              basketWidthPct: this.cfg.get("basketWidthPct"),
              holdToleranceDeg: this.cfg.get("holdToleranceDeg"),
              holdToleranceYDeg: this.cfg.get("holdToleranceYDeg"),
              holdBothAxis: this.cfg.get("holdBothAxis"),
              holdStableSec: this.cfg.get("holdStableSec"),
              holdGraceSec: this.cfg.get("holdGraceSec"),
              deadzoneDeg: this.cfg.get("deadzoneDeg"),
              spawnInterval: this.cfg.get("spawnInterval"),
              fallSpeed: this.cfg.get("fallSpeed"),
              maxFruits: this.cfg.get("maxFruits")
            },
            score: this.score.total,
            breakdown: snap,
            hits: snap.hits,
            misses: snap.misses,
            accuracy: snap.accuracy,
            comboMax: snap.maxCombo,
            // ---- 稳定统计（辅助指标，不影响接取）----
            holdRate: this.elapsedSec > 0.2 ? round(this.hold.timeSec / this.elapsedSec, 3) : 0,
            holdTimeSec: round(this.hold.timeSec, 1),
            holdBestSec: round(this.hold.bestSec, 1),
            holdOutCount: this.hold.outCount,
            deviationAvgDeg: this.hold.devSamples ? round(this.hold.devSum / this.hold.devSamples, 1) : 0,
            deviationMaxDeg: round(this.hold.maxDev, 1),
            holdToleranceDeg: Number(this.cfg.get("holdToleranceDeg")) || 6,
            durationSec: round(this.elapsedSec, 1),
            plannedSec,
            completed,
            reason: reason || (completed ? "timeout" : "aborted"),
            aborted: reason === "aborted",
            pathLength: traj.pathLength,
            avgRate: traj.avgRate,
            peak: traj.peak,
            sway: traj.sway,
            trajectorySummary: {
              pathLength: traj.pathLength,
              avgRate: traj.avgRate,
              peak: traj.peak,
              sway: traj.sway,
              note: traj.note
            },
            dataSource: this.motion.source,
            interrupted: this.interruption.count > 0,
            interruptedSec: round(this.interruption.totalSec, 1),
            interruptedCount: this.interruption.count,
            sensorInterrupted: this.interruption.count > 0,
            grade,
            startedAt: this.startedAt || Date.now(),
            endedAt: Date.now(),
            calibration: this.lastCalibration || null
          };
          this.setState(reason === "aborted" ? STATE.ABORTED : STATE.RESULT);
          this._emit("finish", { summary: this.summary, reason: reason || "end" });
          return this.summary;
        }
        // ---------------------------------------------------------------- 传感器
        feedSensor(frame) {
          this.motion.feed(frame);
          if (this.state === STATE.SENSOR_ERROR) {
            if (!this._resumeAt) this._resumeAt = Date.now();
            if (Date.now() - this._resumeAt > SENSOR_RESUME_MS) this._autoResume();
          }
        }
        _autoResume() {
          this._resumeAt = 0;
          if (this.state !== STATE.SENSOR_ERROR) return;
          this._closeInterruption();
          this.setState(STATE.PLAYING);
          this.lastFrameAt = Date.now();
          this._emit("sensor:resume");
        }
        _closeInterruption() {
          const it = this.interruption;
          if (it.active && it.startedAt) {
            it.totalSec += (Date.now() - it.startedAt) / 1e3;
            it.active = false;
            it.startedAt = 0;
          }
        }
        _enterSensorError() {
          const it = this.interruption;
          if (it.active) return;
          it.active = true;
          it.startedAt = Date.now();
          it.count += 1;
          this.setState(STATE.SENSOR_ERROR);
          this._resumeAt = 0;
          this._emit("sensor:lost");
        }
        setSimMode(on) {
          this.simMode = !!on;
          this.motion.setSimMode(this.simMode);
          if (this.simMode) {
            this.calibrated = true;
            if (!this.lastCalibration || !this.lastCalibration.ok) {
              this.lastCalibration = { ok: true, message: "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u8DF3\u8FC7\u771F\u5B9E\u6807\u5B9A", at: Date.now(), simulated: true };
            }
          } else {
            this.motion.cancelCalibration();
            if (this.state === STATE.CALIBRATING) this.setState(STATE.READY);
            if (this.state === STATE.SENSOR_ERROR) this.setState(STATE.PAUSED);
          }
          this._emit("source", { source: this.motion.source });
        }
        setSimTarget(x, y) {
          this.motion.setSimTarget(x, y);
        }
        nudgeSim(dx, dy) {
          this.motion.nudgeSim(dx, dy);
        }
        centerSim() {
          this.motion.centerSim();
        }
        // ---------------------------------------------------------------- 模拟测试入口
        // 说明：这些方法只在模拟模式下可用，且不会跳过真实逻辑——
        // 它们只是改变水果位置，接取/漏接仍由 _tickPlaying 的碰撞判定决定。
        /** 在篮子正上方（或随机位置）补充若干个水果 */
        debugSpawn(count, opts) {
          if (!this.simMode || this.state !== STATE.PLAYING) return 0;
          const o = opts || {};
          const n = clamp(Math.round(Number(count) || 1), 1, 6);
          for (let i = 0; i < n; i++) {
            this.spawner.serial += 1;
            this.fruits.push(this._makeFruit({
              id: "dbg" + this.spawner.serial,
              type: FRUIT_TYPES[(this.spawner.serial + i) % FRUIT_TYPES.length].id,
              x: o.atBasket ? clamp(this.basket.x + (i - (n - 1) / 2) * 0.02, 0.08, 0.92) : 0.2 + 0.6 * ((i + 1) / (n + 1)),
              // 从半空补出来，1 秒左右到达篮口，方便观察接取动画与判定
              y: Math.max(0.12, 0.72 - i * 0.16),
              vy: Number(this.cfg.get("fallSpeed")) || 0.26,
              rot: 0,
              vrot: 0.6,
              swayAmp: 0,
              swayPhase: 0,
              swaySpeed: 1
            }));
          }
          return n;
        }
        /** 把最低的水果挪到篮子正上方：下一帧走真实接取判定 */
        debugAlignToBasket() {
          if (!this.simMode || this.state !== STATE.PLAYING) return false;
          const f = this._lowestFruit();
          if (!f) return false;
          f.baseX = this.basket.x;
          f.x = this.basket.x;
          f.y = Math.max(f.y, CATCH_LINE - 0.02);
          f.swayAmp = 0;
          return true;
        }
        /** 把最低的水果挪到远离篮子的位置：下一帧走真实漏接判定 */
        debugAlignAway() {
          if (!this.simMode || this.state !== STATE.PLAYING) return false;
          const f = this._lowestFruit();
          if (!f) return false;
          const away = clamp(this.basket.x + (this.catchHalf + 0.14) * (this.basket.x >= 0.5 ? 1 : -1), 0.08, 0.92);
          f.baseX = away;
          f.x = away;
          f.y = Math.max(f.y, CATCH_LINE - 0.02);
          f.swayAmp = 0;
          return true;
        }
        _lowestFruit() {
          let target = null;
          for (let i = 0; i < this.fruits.length; i++) {
            const f = this.fruits[i];
            if (f.state !== "fall") continue;
            if (!target || f.y > target.y) target = f;
          }
          return target;
        }
        // ---------------------------------------------------------------- 每帧
        update(dt) {
          const step = clamp(Number(dt) || 0, 0, 0.1);
          this.t += step;
          this.time += step;
          this.basket.squash = Math.max(0, this.basket.squash - step * 3.6);
          this.basket.flash = Math.max(0, this.basket.flash - step * 2.4);
          this.missFlash = Math.max(0, this.missFlash - step * 1.6);
          this.comboFlash = Math.max(0, this.comboFlash - step * 1.2);
          this._pruneFx();
          this.motion.update(step);
          if (this.state === STATE.CALIBRATING) {
            if (!this.motion.cal.active && this.motion.cal.result) {
              this.lastCalibration = {
                ok: this.motion.cal.result === "ok",
                result: this.motion.cal.result,
                message: this.motion.cal.message,
                at: Date.now()
              };
              this.calibrated = !!this.lastCalibration.ok;
              this._emit("calibrate", this.lastCalibration);
              this.setState(STATE.READY);
            }
            return;
          }
          if (this.state === STATE.COUNTDOWN) {
            this.countdown -= step;
            this._updateHold(step);
            if (this.countdown <= 0) {
              this.countdown = 0;
              this._resetHold();
              this.setState(STATE.PLAYING);
              this.lastFrameAt = Date.now();
              this._emit("go");
            }
            return;
          }
          if (this.state === STATE.PLAYING && !this.simMode && this.motion.stale) {
            this._enterSensorError();
            return;
          }
          if (this.state !== STATE.PLAYING) return;
          this._tickPlaying(step);
        }
        _tickPlaying(step) {
          const cfg2 = this.cfg;
          this._updateHold(step);
          this.motion.tickTrajectory(step);
          this.elapsedSec += step;
          this.score.update(step);
          const plannedSec = Number(cfg2.get("durationSec")) || 90;
          const progress = clamp(this.elapsedSec / Math.max(1, plannedSec), 0, 1);
          const spawns = this.spawner.tick(step, {
            fruits: this.fruits,
            progress,
            basketX: this.basket.x,
            basketHalf: this.basketHalf
          });
          for (let i = 0; i < spawns.length; i++) this.fruits.push(this._makeFruit(spawns[i]));
          for (let i = 0; i < this.fruits.length; i++) {
            const f = this.fruits[i];
            if (f.state === "caught") continue;
            const missed = f.state === "missed";
            const prevY = f.y;
            f.y += f.vy * (missed ? 1.7 : 1) * step;
            f.swayPhase += f.swaySpeed * step;
            f.x = clamp(f.baseX + Math.sin(f.swayPhase) * f.swayAmp, 0.02, 0.98);
            f.rot += f.vrot * step;
            if (missed) continue;
            if (prevY < CATCH_LINE && f.y >= CATCH_LINE) {
              const rExtra = (RADIUS_MAP[f.type] || 0.06) * 0.55;
              const inWidth = Math.abs(f.x - this.basket.x) <= this.catchHalf + rExtra;
              if (inWidth) {
                this._catch(f);
                continue;
              }
              f.missReason = "outside";
            }
            if (!f.scored && f.y > CATCH_LINE + MISS_AFTER) {
              f.scored = true;
              f.state = "missed";
              f.missedAt = this.t;
              this.score.miss();
              this.missFlash = 1;
              this._emit("miss", {
                x: f.x,
                type: f.type,
                reason: f.missReason || "outside",
                dx: round(f.x - this.basket.x, 3)
              });
            }
          }
          this._updateAlign();
          this._cleanup();
          if (this.elapsedSec >= plannedSec) {
            this.finish("timeout");
            return;
          }
          const left = plannedSec - this.elapsedSec;
          if (!this._lowTimeWarned && left <= 10) {
            this._lowTimeWarned = true;
            this._emit("warn", { left: Math.ceil(left) });
          }
        }
        _makeFruit(spec) {
          return {
            id: spec.id,
            type: spec.type,
            x: spec.x,
            baseX: spec.x,
            y: spec.y,
            vy: spec.vy,
            rot: spec.rot,
            vrot: spec.vrot,
            swayAmp: spec.swayAmp,
            swayPhase: spec.swayPhase,
            swaySpeed: spec.swaySpeed,
            state: "fall",
            scored: false,
            caughtAt: 0
          };
        }
        /**
         * 稳定统计：每帧更新偏离量 / 是否在容差内。
         * 只写进训练记录，不参与接取判定——接取只看果篮有没有对准水果。
         */
        _updateHold(step) {
          const cfg2 = this.cfg;
          const h = this.hold;
          const tol = Math.max(1, Number(cfg2.get("holdToleranceDeg")) || 6);
          const tolY = Math.max(1, Number(cfg2.get("holdToleranceYDeg")) || 12);
          const bothAxis = !!cfg2.get("holdBothAxis");
          const stable = Math.max(0.05, Number(cfg2.get("holdStableSec")) || 0.4);
          const grace = Math.max(0, Number(cfg2.get("holdGraceSec")) || 0);
          const dead = Math.max(0, Number(cfg2.get("deadzoneDeg")) || 0);
          const smooth = clamp(Number(cfg2.get("smooth")) || 0.55, 0.2, 1);
          const a = 1 - Math.pow(1 - smooth, step * 60);
          h.devX += (Math.abs(this.motion.angleX) - h.devX) * a;
          h.devY += (Math.abs(this.motion.angleY) - h.devY) * a;
          const devX = h.devX < dead ? 0 : h.devX;
          const devY = h.devY < dead ? 0 : h.devY;
          const inRange = devX <= tol && (!bothAxis || devY <= tolY);
          h.inRange = inRange;
          h.devSum += devX;
          h.devSamples += 1;
          if (devX > h.maxDev) h.maxDev = devX;
          if (inRange) {
            h.timeSec += step;
            h.runSec += step;
            if (h.runSec > h.bestSec) h.bestSec = h.runSec;
            h.since = Math.min(stable + 1, h.since + step);
            h.grace = grace;
            if (!h.holding && h.since >= stable) h.holding = true;
          } else {
            h.runSec = 0;
            if (h.holding) {
              h.grace -= step;
              if (h.grace <= 0) {
                h.holding = false;
                h.since = 0;
                h.outCount += 1;
                h.lostAt = this.t;
              }
            } else {
              h.since = Math.max(0, h.since - step * 2);
            }
          }
          h.progress = clamp(h.since / stable, 0, 1);
          this._followBasket(step);
        }
        /**
         * 果篮跟随：nx = -1 在最左、+1 在最右，线性映射到可移动范围。
         * nx 在 motion 层已经过死区 + 一阶低通，这里只做边界收口和倾斜动画。
         */
        _followBasket(step) {
          const b = this.basket;
          const nx = clamp(Number(this.motion.nx) || 0, -1, 1);
          const travel = (this.basketMaxX - this.basketMinX) / 2;
          const target = clamp(0.5 + nx * travel, this.basketMinX, this.basketMaxX);
          const prev = b.x;
          b.x = target;
          b.nx = clamp((b.x - 0.5) / Math.max(1e-6, travel), -1, 1);
          b.vx = step > 0 ? (b.x - prev) / step : 0;
          b.tilt = clamp(b.vx * 0.12, -0.5, 0.5);
        }
        /** 对位提示：最低那颗下落水果是否已在篮口正上方 */
        _updateAlign() {
          const a = this.align;
          const f = this._lowestFruit();
          if (!f) {
            a.under = false;
            a.dx = 0;
            a.targetId = "";
            return;
          }
          a.dx = f.x - this.basket.x;
          a.targetId = f.id;
          a.under = Math.abs(a.dx) <= this.catchHalf;
        }
        _resetHold() {
          const h = this.hold;
          h.devX = 0;
          h.devY = 0;
          h.inRange = true;
          h.holding = false;
          h.since = 0;
          h.grace = Number(this.cfg.get("holdGraceSec")) || 0;
          h.progress = 0;
          h.timeSec = 0;
          h.bestSec = 0;
          h.runSec = 0;
          h.outCount = 0;
          h.devSum = 0;
          h.devSamples = 0;
          h.maxDev = 0;
          h.lostAt = 0;
        }
        _catch(f) {
          f.scored = true;
          f.state = "caught";
          f.caughtAt = this.t;
          f.catchFromX = f.x;
          const value = scoreOf(this.cfg, f.type);
          const r = this.score.hit(value, f.type);
          this.basket.squash = 1;
          this.basket.flash = 1;
          this.comboFlash = 1;
          this.fxSeq += 1;
          this.pops.push({
            id: "p" + this.fxSeq,
            text: "+" + r.gain,
            x: f.x,
            at: this.t,
            combo: r.combo,
            mul: r.mul
          });
          this.bursts.push({
            id: "b" + this.fxSeq,
            x: f.x,
            at: this.t,
            seed: this.fxSeq * 977 + 13,
            type: f.type
          });
          if (this._milestoneIdx < this.comboMilestones.length && r.combo >= this.comboMilestones[this._milestoneIdx]) {
            this._emit("combo", { value: r.combo });
            this._milestoneIdx += 1;
          }
          this._emit("hit", { gain: r.gain, combo: r.combo, mul: r.mul, type: f.type, x: f.x });
        }
        _pruneFx() {
          if (this.pops.length && this.t - this.pops[0].at > 1.2) {
            this.pops = this.pops.filter((p) => this.t - p.at <= 1.2);
          }
          if (this.bursts.length && this.t - this.bursts[0].at > 1.1) {
            this.bursts = this.bursts.filter((b) => this.t - b.at <= 1.1);
          }
        }
        _cleanup() {
          const anim = CATCH_ANIM_SEC;
          const MISS_FADE_SEC = 0.9;
          this.fruits = this.fruits.filter((f) => {
            if (f.state === "caught") return this.t - f.caughtAt <= anim;
            if (f.state === "missed") {
              return f.y <= REMOVE_AFTER && this.t - (f.missedAt || 0) <= MISS_FADE_SEC;
            }
            return f.y <= REMOVE_AFTER;
          });
          const cap = Math.max(8, Math.round(Number(this.cfg.get("maxFruits")) || 3) * 4);
          if (this.fruits.length > cap) this.fruits.splice(0, this.fruits.length - cap);
        }
        // ---------------------------------------------------------------- 视图数据
        getViewModel() {
          const cfg2 = this.cfg;
          const plannedSec = Number(cfg2.get("durationSec")) || 90;
          const timeLeft = Math.max(0, plannedSec - this.elapsedSec);
          return {
            state: this.state,
            timeLeft,
            timeLeftText: this._fmtTime(timeLeft),
            elapsed: this.elapsedSec,
            plannedSec,
            score: this.score.total,
            hits: this.score.hits,
            misses: this.score.misses,
            accuracy: this.score.accuracy,
            combo: this.score.combo,
            comboMul: this.score.comboMul,
            maxCombo: this.score.maxCombo,
            // 稳定统计（只用于记录，不影响接取）
            hold: {
              devX: round(this.hold.devX, 1),
              devY: round(this.hold.devY, 1),
              inRange: this.hold.inRange,
              holding: this.hold.holding,
              progress: this.hold.progress,
              since: round(this.hold.since, 2),
              timeSec: round(this.hold.timeSec, 1),
              outCount: this.hold.outCount,
              bestSec: round(this.hold.bestSec, 1),
              lostAt: this.hold.lostAt
            },
            holdRate: this.elapsedSec > 0.5 ? this.hold.timeSec / this.elapsedSec : null,
            holdToleranceDeg: Number(cfg2.get("holdToleranceDeg")) || 6,
            holdToleranceYDeg: Number(cfg2.get("holdToleranceYDeg")) || 12,
            holdBothAxis: !!cfg2.get("holdBothAxis"),
            holdStableSec: Math.max(0.05, Number(cfg2.get("holdStableSec")) || 0.4),
            catchHalf: this.catchHalf,
            // 身体控制量（归一化，驱动果篮左右移动）
            nx: this.motion.nx,
            load: this.motion.load,
            dir: this.motion.dir,
            basket: this.basket,
            basketHalf: this.basketHalf,
            basketMinX: this.basketMinX,
            basketMaxX: this.basketMaxX,
            // 对位提示：最低那颗水果是否在篮口正上方
            aligned: this.align.under,
            alignDx: round(this.align.dx, 3),
            alignTargetId: this.align.targetId,
            fruits: this.fruits,
            pops: this.pops,
            bursts: this.bursts,
            catchAnimSec: CATCH_ANIM_SEC,
            catchLine: CATCH_LINE,
            missFlash: this.missFlash,
            comboFlash: this.comboFlash,
            // 设备与状态
            rateHz: this.motion.rateHz,
            stale: this.motion.stale,
            quality: this.motion.quality,
            source: this.motion.source,
            sim: this.simMode,
            countdown: this.countdown,
            difficulty: Number(cfg2.get("difficulty")) || 2,
            calibrated: this.calibrated,
            calibration: this.lastCalibration,
            calibrationProgress: this.state === STATE.CALIBRATING ? clamp(this.motion.cal.elapsed / this.motion.cal.total, 0, 1) : 0,
            interrupted: this.interruption,
            canResume: this.state === STATE.SENSOR_ERROR && !this.motion.stale
          };
        }
        _fmtTime(sec) {
          const s = Math.max(0, Math.ceil(sec));
          const m = Math.floor(s / 60);
          const r = s % 60;
          return (m < 10 ? "0" + m : m) + ":" + (r < 10 ? "0" + r : r);
        }
      };
      module.exports = { FruitEngine: FruitEngine2, STATE, CATCH_LINE, CATCH_ANIM_SEC };
    }
  });

  // pkgFruit/games/fruit/fruits.js
  var require_fruits = __commonJS({
    "pkgFruit/games/fruit/fruits.js"(exports, module) {
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function ellipse(ctx, x, y, rx, ry, rot) {
        ctx.save();
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot);
        ctx.scale(Math.max(1e-3, rx), Math.max(1e-3, ry));
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
      }
      function radial(ctx, x, y, r, stops) {
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.1, x, y, r * 1.08);
        stops.forEach((s) => g.addColorStop(s[0], s[1]));
        return g;
      }
      function specular(ctx, x, y, rx, ry, alpha, rot) {
        ctx.save();
        ctx.globalAlpha = alpha === void 0 ? 0.55 : alpha;
        ellipse(ctx, x, y, rx, ry, rot || -0.5);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.restore();
      }
      function drawApple(ctx, x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot || 0);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.62);
        ctx.bezierCurveTo(r * 0.55, -r * 1.02, r * 1.06, -r * 0.3, r * 0.92, r * 0.22);
        ctx.bezierCurveTo(r * 0.8, r * 0.92, r * 0.18, r * 1.02, 0, r * 0.88);
        ctx.bezierCurveTo(-r * 0.18, r * 1.02, -r * 0.8, r * 0.92, -r * 0.92, r * 0.22);
        ctx.bezierCurveTo(-r * 1.06, -r * 0.3, -r * 0.55, -r * 1.02, 0, -r * 0.62);
        ctx.closePath();
        ctx.fillStyle = radial(ctx, 0, 0, r, [
          [0, "#F4685A"],
          [0.55, "#DE3B31"],
          [1, "#A81F1F"]
        ]);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.22;
        ellipse(ctx, -r * 0.55, r * 0.2, r * 0.66, r * 0.7);
        ctx.fillStyle = "#7A1220";
        ctx.fill();
        ctx.restore();
        specular(ctx, -r * 0.32, -r * 0.36, r * 0.26, r * 0.34, 0.5, -0.5);
        ctx.beginPath();
        ctx.lineWidth = Math.max(1.2, r * 0.1);
        ctx.strokeStyle = "#7A4A22";
        ctx.lineCap = "round";
        ctx.moveTo(0, -r * 0.6);
        ctx.quadraticCurveTo(r * 0.06, -r * 0.92, r * 0.14, -r * 1.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r * 0.1, -r * 0.86);
        ctx.quadraticCurveTo(r * 0.56, -r * 1.16, r * 0.66, -r * 0.74);
        ctx.quadraticCurveTo(r * 0.34, -r * 0.7, r * 0.1, -r * 0.86);
        ctx.closePath();
        ctx.fillStyle = "#4FA83C";
        ctx.fill();
        ctx.restore();
      }
      function drawOrange(ctx, x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot || 0);
        ellipse(ctx, 0, 0, r * 0.98, r * 0.96);
        ctx.fillStyle = radial(ctx, 0, 0, r, [
          [0, "#FFC15A"],
          [0.5, "#F99A28"],
          [1, "#DE6E12"]
        ]);
        ctx.fill();
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#8C4406";
        for (let i = 0; i < 14; i++) {
          const a = i * 2.399;
          const rq = r * (0.24 + i % 5 * 0.13);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rq, Math.sin(a) * rq, Math.max(0.6, r * 0.035), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.18;
        ellipse(ctx, -r * 0.5, r * 0.3, r * 0.6, r * 0.62);
        ctx.fillStyle = "#9C4A08";
        ctx.fill();
        ctx.restore();
        specular(ctx, -r * 0.32, -r * 0.38, r * 0.28, r * 0.36, 0.5, -0.6);
        ellipse(ctx, 0, -r * 0.9, r * 0.16, r * 0.1);
        ctx.fillStyle = "#4E7A2A";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.1, -r * 0.92);
        ctx.quadraticCurveTo(r * 0.48, -r * 1.12, r * 0.58, -r * 0.84);
        ctx.quadraticCurveTo(r * 0.3, -r * 0.8, r * 0.1, -r * 0.92);
        ctx.closePath();
        ctx.fillStyle = "#57A83C";
        ctx.fill();
        ctx.restore();
      }
      function drawBanana(ctx, x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot || 0);
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, -r * 0.42);
        ctx.bezierCurveTo(-r * 0.5, r * 0.72, r * 0.42, r * 0.86, r * 0.92, r * 0.2);
        ctx.bezierCurveTo(r * 0.62, r * 0.5, -r * 0.16, r * 0.34, -r * 0.62, -r * 0.54);
        ctx.closePath();
        const g = ctx.createLinearGradient(-r * 0.8, -r * 0.4, r * 0.8, r * 0.6);
        g.addColorStop(0, "#FFE06A");
        g.addColorStop(0.45, "#FFCB2E");
        g.addColorStop(1, "#E9A213");
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = Math.max(0.8, r * 0.06);
        ctx.strokeStyle = "rgba(140,88,10,0.35)";
        ctx.stroke();
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, -r * 0.32);
        ctx.quadraticCurveTo(-r * 0.24, r * 0.36, r * 0.5, r * 0.44);
        ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.lineCap = "round";
        ctx.strokeStyle = "#FFF6C4";
        ctx.stroke();
        ctx.restore();
        ellipse(ctx, -r * 0.86, -r * 0.42, r * 0.1, r * 0.07, 0.5);
        ctx.fillStyle = "#6E4A16";
        ctx.fill();
        ellipse(ctx, r * 0.9, r * 0.2, r * 0.09, r * 0.07, -0.6);
        ctx.fillStyle = "#6E4A16";
        ctx.fill();
        ctx.restore();
      }
      function drawStrawberry(ctx, x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot || 0);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.58);
        ctx.bezierCurveTo(r * 0.92, -r * 0.72, r * 0.94, r * 0.3, 0, r * 1);
        ctx.bezierCurveTo(-r * 0.94, r * 0.3, -r * 0.92, -r * 0.72, 0, -r * 0.58);
        ctx.closePath();
        ctx.fillStyle = radial(ctx, 0, -r * 0.1, r, [
          [0, "#FF7A88"],
          [0.55, "#E93B4E"],
          [1, "#B01C31"]
        ]);
        ctx.fill();
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#FFE9A8";
        for (let row = 0; row < 4; row++) {
          const count = 3 - (row > 1 ? 1 : 0);
          for (let i = 0; i < count; i++) {
            const px = (i - (count - 1) / 2) * r * 0.42;
            const py = -r * 0.18 + row * r * 0.36;
            ellipse(ctx, px, py, r * 0.055, r * 0.075, 0.2);
            ctx.fill();
          }
        }
        ctx.restore();
        specular(ctx, -r * 0.3, -r * 0.18, r * 0.2, r * 0.32, 0.42, -0.5);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.52;
          const len = r * (i === 2 ? 0.5 : 0.42);
          ctx.lineTo(Math.cos(a) * len, -r * 0.52 + Math.sin(a) * len * 0.5);
        }
        ctx.closePath();
        ctx.fillStyle = "#3F9B34";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.58);
        ctx.lineTo(0, -r * 0.94);
        ctx.lineWidth = Math.max(1, r * 0.09);
        ctx.strokeStyle = "#2F7A28";
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }
      function drawWatermelon(ctx, x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot || 0);
        const h = r * 0.95;
        const w = r * 1.08;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.82);
        ctx.quadraticCurveTo(-w, h * 0.2, -w * 0.98, -h * 0.02);
        ctx.quadraticCurveTo(0, -h * 0.72, w * 0.98, -h * 0.02);
        ctx.quadraticCurveTo(w, h * 0.2, 0, h * 0.82);
        ctx.closePath();
        ctx.save();
        ctx.clip();
        const g = ctx.createLinearGradient(0, -h * 0.5, 0, h);
        g.addColorStop(0, "#FF6E73");
        g.addColorStop(0.6, "#F04350");
        g.addColorStop(1, "#D22B3C");
        ctx.fillStyle = g;
        ctx.fillRect(-w, -h, w * 2, h * 2.4);
        ctx.fillStyle = "#3A1A20";
        const seeds = [[-0.42, 0.02], [0, -0.1], [0.4, 0.04], [-0.22, 0.36], [0.2, 0.34], [0, 0.56]];
        seeds.forEach((s) => {
          ellipse(ctx, s[0] * r, s[1] * r, r * 0.06, r * 0.085, s[0] * 0.5);
          ctx.fill();
        });
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(-w * 0.98, -h * 0.02);
        ctx.quadraticCurveTo(0, -h * 0.72, w * 0.98, -h * 0.02);
        ctx.quadraticCurveTo(w, h * 0.2, 0, h * 0.82);
        ctx.quadraticCurveTo(-w, h * 0.2, -w * 0.98, -h * 0.02);
        ctx.closePath();
        ctx.lineWidth = Math.max(2.4, r * 0.2);
        ctx.strokeStyle = "#EFF8E2";
        ctx.stroke();
        ctx.lineWidth = Math.max(1.6, r * 0.11);
        ctx.strokeStyle = "#3E8E3A";
        ctx.stroke();
        ctx.restore();
      }
      var DRAWERS = {
        apple: drawApple,
        orange: drawOrange,
        banana: drawBanana,
        strawberry: drawStrawberry,
        watermelon: drawWatermelon
      };
      function drawFruit(ctx, type, x, y, r, rot, opt) {
        const o = opt || {};
        const fn = DRAWERS[type] || drawApple;
        ctx.save();
        if (o.alpha !== void 0) ctx.globalAlpha = o.alpha;
        if (o.squash) {
          const s = clamp(o.squash, 0, 1);
          ctx.translate(x, y + r * 0.3 * s);
          ctx.scale(1 + s * 0.16, 1 - s * 0.2);
          ctx.translate(-x, -(y + r * 0.3 * s));
        }
        fn(ctx, x, y, r, rot || 0);
        ctx.restore();
      }
      function drawBasket(ctx, x, y, halfW, o) {
        const opt = o || {};
        const squash = clamp(opt.squash || 0, 0, 1);
        const tilt = clamp(opt.tilt || 0, -1, 1);
        const h = halfW * 0.96;
        const rimRY = halfW * 0.195;
        const bottomHalf = halfW * 0.64;
        const sx = 1 + squash * 0.1;
        const sy = 1 - squash * 0.14;
        ctx.save();
        if (opt.alpha !== void 0) ctx.globalAlpha = opt.alpha;
        ctx.translate(x, y);
        ctx.rotate(tilt * 0.06);
        ctx.scale(sx, sy);
        ctx.save();
        ctx.globalAlpha = 0.18;
        ellipse(ctx, 0, h * 1, halfW * 0.96, halfW * 0.15);
        ctx.fillStyle = "#3C5A34";
        ctx.fill();
        ctx.restore();
        const bodyPath = () => {
          ctx.beginPath();
          ctx.moveTo(-halfW, 0);
          ctx.bezierCurveTo(-halfW * 1.04, h * 0.34, -bottomHalf * 1.16, h * 0.74, -bottomHalf, h);
          ctx.quadraticCurveTo(0, h * 1.06, bottomHalf, h);
          ctx.bezierCurveTo(bottomHalf * 1.16, h * 0.74, halfW * 1.04, h * 0.34, halfW, 0);
          ctx.closePath();
        };
        bodyPath();
        const bg2 = ctx.createLinearGradient(-halfW, 0, halfW * 0.6, h);
        bg2.addColorStop(0, "#D9A566");
        bg2.addColorStop(0.42, "#E7BE85");
        bg2.addColorStop(0.72, "#C9924F");
        bg2.addColorStop(1, "#A9713A");
        ctx.fillStyle = bg2;
        ctx.fill();
        ctx.save();
        bodyPath();
        ctx.clip();
        const cols = 8;
        const lw = Math.max(1, halfW * 0.055);
        for (let i = 0; i < cols; i++) {
          const t = (i + 0.5) / cols;
          const x0 = -halfW + halfW * 2 * t;
          const x1 = -bottomHalf + bottomHalf * 2 * t;
          const cx2 = (x0 + x1) * 0.5 * 1.04;
          ctx.beginPath();
          ctx.moveTo(x0, h * 0.02);
          ctx.quadraticCurveTo(cx2, h * 0.6, x1, h * 1.01);
          ctx.lineWidth = lw;
          ctx.strokeStyle = i % 2 ? "rgba(255,231,190,0.42)" : "rgba(122,76,32,0.3)";
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x0 + lw * 0.7, h * 0.02);
          ctx.quadraticCurveTo(cx2 + lw * 0.7, h * 0.6, x1 + lw * 0.5, h * 1.01);
          ctx.lineWidth = Math.max(0.6, lw * 0.45);
          ctx.strokeStyle = "rgba(120,72,28,0.22)";
          ctx.stroke();
        }
        const bands = [0.2, 0.42, 0.64, 0.86];
        bands.forEach((t) => {
          const half = halfW + (bottomHalf - halfW) * t;
          ctx.beginPath();
          ctx.moveTo(-half * 0.98, h * t);
          ctx.quadraticCurveTo(0, h * t + h * 0.09, half * 0.98, h * t);
          ctx.lineWidth = Math.max(1.6, halfW * 0.07);
          ctx.strokeStyle = "rgba(255,226,182,0.36)";
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-half * 0.98, h * t + Math.max(1, halfW * 0.055));
          ctx.quadraticCurveTo(0, h * t + h * 0.09 + Math.max(1, halfW * 0.055), half * 0.98, h * t + Math.max(1, halfW * 0.055));
          ctx.lineWidth = Math.max(0.8, halfW * 0.035);
          ctx.strokeStyle = "rgba(116,70,26,0.34)";
          ctx.stroke();
        });
        const shade = ctx.createLinearGradient(-halfW, 0, halfW, 0);
        shade.addColorStop(0, "rgba(84,52,20,0.34)");
        shade.addColorStop(0.34, "rgba(84,52,20,0.06)");
        shade.addColorStop(0.62, "rgba(255,238,205,0.16)");
        shade.addColorStop(1, "rgba(84,52,20,0.26)");
        ctx.fillStyle = shade;
        ctx.fillRect(-halfW * 1.1, 0, halfW * 2.2, h * 1.1);
        ctx.restore();
        ellipse(ctx, 0, rimRY * 0.16, halfW * 0.985, rimRY);
        const inner = ctx.createLinearGradient(0, -rimRY, 0, rimRY * 2);
        inner.addColorStop(0, "#6B4320");
        inner.addColorStop(0.55, "#8E5C2B");
        inner.addColorStop(1, "#5E3A1B");
        ctx.fillStyle = inner;
        ctx.fill();
        ctx.save();
        ellipse(ctx, 0, rimRY * 0.16, halfW * 0.985, rimRY);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(-halfW, -rimRY * 2);
        ctx.lineTo(halfW, -rimRY * 2);
        ctx.lineTo(halfW, rimRY * 0.55);
        ctx.quadraticCurveTo(0, rimRY * 1.5, -halfW, rimRY * 0.55);
        ctx.closePath();
        ctx.fillStyle = "rgba(46,28,12,0.35)";
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ellipseOnly(ctx, 0, 0, halfW, rimRY);
        ctx.lineWidth = Math.max(3.4, halfW * 0.135);
        const rg = ctx.createLinearGradient(0, -rimRY * 1.4, 0, rimRY * 1.6);
        rg.addColorStop(0, "#F7DCB4");
        rg.addColorStop(0.4, "#E2B279");
        rg.addColorStop(0.75, "#C1874A");
        rg.addColorStop(1, "#9E6931");
        ctx.strokeStyle = rg;
        ctx.stroke();
        ctx.beginPath();
        ctx.save();
        ctx.scale(halfW, rimRY);
        ctx.arc(0, 0, 0.94, Math.PI * 0.22, Math.PI * 0.78);
        ctx.restore();
        ctx.lineWidth = Math.max(1.2, halfW * 0.045);
        ctx.strokeStyle = "rgba(255,246,226,0.9)";
        ctx.stroke();
        if (opt.flash > 0.01) {
          ctx.save();
          const f = Math.min(1, opt.flash);
          const glow = ctx.createRadialGradient(0, rimRY * 0.2, 2, 0, rimRY * 0.2, halfW * 0.95);
          glow.addColorStop(0, "rgba(255,214,138," + (0.55 * f).toFixed(3) + ")");
          glow.addColorStop(0.6, "rgba(255,205,120," + (0.22 * f).toFixed(3) + ")");
          glow.addColorStop(1, "rgba(255,200,110,0)");
          ellipse(ctx, 0, rimRY * 0.2, halfW * 0.98, rimRY * 1.15);
          ctx.fillStyle = glow;
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
      function ellipseOnly(ctx, x, y, rx, ry) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(Math.max(1e-3, rx), Math.max(1e-3, ry));
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
      }
      module.exports = {
        drawFruit,
        drawBasket,
        FRUIT_DRAWERS: DRAWERS
      };
    }
  });

  // pkgFruit/games/fruit/renderer.js
  var require_renderer = __commonJS({
    "pkgFruit/games/fruit/renderer.js"(exports, module) {
      var { drawFruit, drawBasket } = require_fruits();
      var { FRUIT_TYPES, DESIGN_WIDTH } = require_spawner();
      var C = {
        ink: "#152D22",
        inkSoft: "#35503F",
        inkMute: "#5E7367",
        teal: "#0F9C8C",
        tealDeep: "#0A7E72",
        tealLight: "#43C7B0",
        amber: "#E39A32",
        amberDeep: "#B4771A",
        danger: "#DF5540",
        white: "#FFFFFF",
        card: "rgba(255,255,255,0.96)",
        line: "rgba(21,45,34,0.09)"
      };
      var SKY = {
        top: "#8ACFEC",
        mid: "#BCE5F5",
        low: "#EFF6E9",
        horizon: "#F7F3DE",
        sun: "rgba(255,247,214,0.9)",
        hillFar: "#A9C8D8",
        hillMid: "#94BBAE",
        hillNear: "#8CB48F",
        treeDark: "#4C7F58",
        treeMid: "#5F9863",
        treeLight: "#79B173",
        trunk: "#7A5C3C",
        grassFar: "#C9E0A9",
        grassMid: "#A9CC84",
        grassNear: "#8CB86A"
      };
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      function rr(ctx, x, y, w, h, r) {
        const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.arcTo(x + w, y, x + w, y + rad, rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
        ctx.lineTo(x + rad, y + h);
        ctx.arcTo(x, y + h, x, y + h - rad, rad);
        ctx.lineTo(x, y + rad);
        ctx.arcTo(x, y, x + rad, y, rad);
        ctx.closePath();
      }
      function ellipse(ctx, x, y, rx, ry) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(Math.max(1e-3, rx), Math.max(1e-3, ry));
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
      }
      function hash(i, seed) {
        const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
        return x - Math.floor(x);
      }
      var FruitRenderer2 = class {
        constructor(opts) {
          const o = opts || {};
          this.canvas = o.canvas;
          this.ctx = o.ctx;
          this.engine = o.engine;
          this.cfg = o.cfg;
          this.W = 375;
          this.H = 667;
          this.dpr = 2;
          this.clock = 0;
          this.nowMs = 0;
          this.buttons = [];
          this.pressId = "";
          this.pressAt = 0;
          this.bg = null;
          this.bgKey = "";
          this.bgCtx = null;
          this.hint = null;
          this.simOpen = false;
          this.fx = { catchGlow: 0 };
          this._layout();
        }
        resize(w, h, dpr2) {
          this.W = Math.max(280, w);
          this.H = Math.max(480, h);
          this.dpr = dpr2 || 2;
          this.bg = null;
          this.bgKey = "";
          this._layout();
        }
        // ---------------------------------------------------------------- 布局
        _layout() {
          const W = this.W;
          const H = this.H;
          const short = H < 700;
          const safeTop = this._safeTop();
          const hudH = short ? 82 : 92;
          const hudY = safeTop + 5;
          const hudBottom = hudY + hudH;
          const fieldTop = hudBottom + 12;
          const widthPct = Number(this.cfg.get("basketWidthPct")) || 22;
          const basketHalfW = clamp(W * widthPct / 200, W * 0.06, W * 0.2);
          const basketH = basketHalfW * 0.96 + 10;
          const groundY = H - (short ? 62 : 76);
          const rimY = groundY - basketH;
          this.L = {
            W,
            H,
            short,
            safeTop,
            cx: W * 0.5,
            hudY,
            hudH,
            hudBottom,
            fieldTop,
            fieldH: Math.max(120, rimY - fieldTop),
            groundY,
            rimY,
            catchLine: 1,
            basketHalfW,
            btnY: H - (short ? 46 : 52),
            btnH: short ? 38 : 42,
            horizonY: H * (short ? 0.5 : 0.52),
            fruitScale: W / DESIGN_WIDTH
          };
        }
        _safeTop() {
          try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const sb = info.statusBarHeight || 24;
            const cap = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
            const bottom = cap && cap.bottom ? cap.bottom + 8 : sb + 8;
            return Math.max(sb + 6, bottom);
          } catch (e) {
            return 40;
          }
        }
        // ---------------------------------------------------------------- 主渲染
        render(dt, now) {
          const ctx = this.ctx;
          if (!ctx) return;
          this.clock += Math.min(0.06, dt || 0.016);
          this.nowMs = now || Date.now();
          this.buttons.length = 0;
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          ctx.clearRect(0, 0, this.W, this.H);
          const engine2 = this.engine;
          const vm = engine2.getViewModel();
          const screen = this._screen(vm.state);
          this._drawBackground();
          this._drawWorld(vm, screen);
          if (screen === "play") {
            this._drawHud(vm);
            if (vm.sim) this._drawSimPad(vm);
            if (vm.state === "COUNTDOWN") this._drawCountdown(vm);
            if (vm.state === "PAUSED") this._drawPauseOverlay(vm);
            if (vm.state === "SENSOR_ERROR") this._drawSensorOverlay(vm);
          } else if (screen === "intro") {
            this._drawIntro(vm);
          } else if (screen === "prepare") {
            this._drawPrepare(vm);
          } else {
            this._drawResult(vm);
          }
          this._drawTransient();
        }
        _screen(state) {
          if (state === "IDLE") return "intro";
          if (state === "READY" || state === "CALIBRATING") return "prepare";
          if (state === "RESULT" || state === "ABORTED") return "result";
          return "play";
        }
        // ================================================================ 背景
        _drawBackground() {
          const ctx = this.ctx;
          const key = this.W + "x" + this.H + "@" + this.dpr;
          if (this.bg && this.bgKey === key) {
            ctx.drawImage(this.bg, 0, 0, this.W, this.H);
            return;
          }
          this.bgKey = key;
          let off = null;
          try {
            if (wx.createOffscreenCanvas) {
              off = wx.createOffscreenCanvas({
                type: "2d",
                width: Math.round(this.W * this.dpr),
                height: Math.round(this.H * this.dpr)
              });
            }
          } catch (e) {
            off = null;
          }
          if (off && off.getContext) {
            const g = off.getContext("2d");
            g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.bgCtx = g;
            this._paintSky(g);
            this.bgCtx = null;
            this.bg = off;
            ctx.drawImage(off, 0, 0, this.W, this.H);
          } else {
            this.bgCtx = null;
            this._paintSky(ctx);
            this.bg = null;
          }
        }
        _paintSky(g) {
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const hz = L.horizonY;
          const sky = g.createLinearGradient(0, 0, 0, hz + H * 0.08);
          sky.addColorStop(0, SKY.top);
          sky.addColorStop(0.55, SKY.mid);
          sky.addColorStop(0.86, SKY.low);
          sky.addColorStop(1, SKY.horizon);
          g.fillStyle = sky;
          g.fillRect(0, 0, W, hz + H * 0.1);
          const sunX = W * 0.82;
          const sunY = hz * 0.22;
          const sun = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.55);
          sun.addColorStop(0, SKY.sun);
          sun.addColorStop(0.35, "rgba(255,248,220,0.34)");
          sun.addColorStop(1, "rgba(255,248,220,0)");
          g.fillStyle = sun;
          g.fillRect(0, 0, W, hz);
          const halo = g.createRadialGradient(sunX, sunY, W * 0.1, sunX, sunY, W * 0.78);
          halo.addColorStop(0, "rgba(255,250,226,0.20)");
          halo.addColorStop(0.6, "rgba(255,250,226,0.06)");
          halo.addColorStop(1, "rgba(255,250,226,0)");
          g.fillStyle = halo;
          g.fillRect(0, 0, W, hz);
          this._drawClouds(g, true);
          g.save();
          g.lineCap = "round";
          g.strokeStyle = "rgba(74,104,92,0.34)";
          const birds = [[0.62, 0.14, 8, 1.3], [0.69, 0.105, 6, 1.1], [0.575, 0.175, 5, 0.9]];
          birds.forEach((b) => {
            const bx = W * b[0];
            const by = hz * b[1];
            const sp = b[2];
            g.lineWidth = b[3];
            g.beginPath();
            g.moveTo(bx - sp, by);
            g.quadraticCurveTo(bx - sp * 0.5, by - sp * 0.62, bx, by);
            g.quadraticCurveTo(bx + sp * 0.5, by - sp * 0.62, bx + sp, by);
            g.stroke();
          });
          g.restore();
          this._paintHills(g);
          this._paintTrees(g);
          this._paintField(g);
          const foot = g.createLinearGradient(0, H * 0.86, 0, H);
          foot.addColorStop(0, "rgba(48,84,48,0)");
          foot.addColorStop(1, "rgba(38,68,42,0.18)");
          g.fillStyle = foot;
          g.fillRect(0, H * 0.86, W, H * 0.14);
        }
        _drawClouds(g, baked) {
          const W = this.W;
          const H = this.H;
          const hz = this.L.horizonY;
          const ctx = g || this.ctx;
          const clouds = [
            { x: 0.16, y: 0.12, s: 0.9, a: 0.92 },
            { x: 0.62, y: 0.075, s: 0.66, a: 0.8 },
            { x: 0.88, y: 0.19, s: 0.5, a: 0.66 },
            { x: 0.36, y: 0.26, s: 0.42, a: 0.5 }
          ];
          ctx.save();
          clouds.forEach((c, ci) => {
            const drift = baked ? 0 : Math.sin(this.clock * 0.06 + ci) * 4;
            const cx = W * c.x + drift;
            const cy = hz * c.y * 2.6;
            const r = W * 0.13 * c.s;
            ctx.globalAlpha = c.a;
            const puffs = [
              [-1.1, 0.22, 0.62],
              [-0.4, -0.1, 0.86],
              [0.35, 0.02, 0.74],
              [1, 0.26, 0.54],
              [0.05, 0.3, 0.68]
            ];
            puffs.forEach((p) => {
              const grd = ctx.createRadialGradient(
                cx + p[0] * r,
                cy + p[1] * r,
                r * 0.1,
                cx + p[0] * r,
                cy + p[1] * r,
                r * p[2]
              );
              grd.addColorStop(0, "rgba(255,255,255,0.96)");
              grd.addColorStop(0.72, "rgba(255,255,255,0.72)");
              grd.addColorStop(1, "rgba(255,255,255,0)");
              ctx.fillStyle = grd;
              ellipse(ctx, cx + p[0] * r, cy + p[1] * r, r * p[2], r * p[2] * 0.78);
              ctx.fill();
            });
          });
          ctx.restore();
        }
        _paintHills(g) {
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const hz = L.horizonY;
          g.beginPath();
          g.moveTo(0, hz + 6);
          g.lineTo(0, hz - H * 0.055);
          g.bezierCurveTo(W * 0.16, hz - H * 0.1, W * 0.3, hz - H * 0.035, W * 0.44, hz - H * 0.06);
          g.bezierCurveTo(W * 0.6, hz - H * 0.088, W * 0.72, hz - H * 0.02, W * 0.86, hz - H * 0.048);
          g.bezierCurveTo(W * 0.94, hz - H * 0.062, W * 0.98, hz - H * 0.04, W, hz - H * 0.042);
          g.lineTo(W, hz + 6);
          g.closePath();
          g.fillStyle = SKY.hillFar;
          g.globalAlpha = 0.62;
          g.fill();
          g.globalAlpha = 1;
          g.beginPath();
          g.moveTo(0, hz + 10);
          g.lineTo(0, hz - H * 0.012);
          g.bezierCurveTo(W * 0.18, hz - H * 0.05, W * 0.34, hz + H * 4e-3, W * 0.52, hz - H * 0.016);
          g.bezierCurveTo(W * 0.7, hz - H * 0.038, W * 0.84, hz + H * 6e-3, W, hz - H * 8e-3);
          g.lineTo(W, hz + 10);
          g.closePath();
          g.fillStyle = SKY.hillMid;
          g.globalAlpha = 0.72;
          g.fill();
          g.globalAlpha = 1;
        }
        _paintTrees(g) {
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const hz = L.horizonY;
          const rows = [
            { y: hz + H * 0.012, scale: 0.62, alpha: 0.5, xs: [0.04, 0.13, 0.22, 0.3, 0.72, 0.8, 0.89, 0.97] },
            { y: hz + H * 0.055, scale: 0.96, alpha: 0.85, xs: [0.02, 0.115, 0.235, 0.785, 0.895, 0.98] }
          ];
          rows.forEach((row) => {
            row.xs.forEach((fx, i) => {
              const x = W * fx;
              const s = row.scale * (0.86 + hash(i, row.scale * 10) * 0.3);
              this._tree(g, x, row.y, W * 0.062 * s, s, row.alpha, i + Math.round(row.scale * 10));
            });
          });
          const bush = (bx, by, r, a) => {
            g.save();
            g.globalAlpha = a;
            const grd = g.createRadialGradient(bx - r * 0.3, by - r * 0.4, r * 0.1, bx, by, r);
            grd.addColorStop(0, "#8CC079");
            grd.addColorStop(1, "#5C8F52");
            g.fillStyle = grd;
            [[-0.7, 0.1, 0.62], [0, -0.1, 0.8], [0.72, 0.12, 0.58]].forEach((p) => {
              ellipse(g, bx + p[0] * r, by + p[1] * r, r * p[2], r * p[2] * 0.78);
              g.fill();
            });
            g.restore();
          };
          bush(W * 0.1, hz + H * 0.052, W * 0.045, 0.9);
          bush(W * 0.9, hz + H * 0.06, W * 0.052, 0.9);
          bush(W * 0.045, hz + H * 0.072, W * 0.034, 0.75);
          const belt = g.createLinearGradient(0, hz - 2, 0, hz + H * 0.13);
          belt.addColorStop(0, "rgba(96,140,86,0.22)");
          belt.addColorStop(1, "rgba(96,140,86,0)");
          g.fillStyle = belt;
          g.fillRect(0, hz - 2, W, H * 0.13);
        }
        _tree(g, x, baseY, r, s, alpha, seed) {
          g.save();
          g.globalAlpha = alpha;
          g.beginPath();
          g.moveTo(x - r * 0.09, baseY);
          g.lineTo(x - r * 0.055, baseY - r * 1.25);
          g.lineTo(x + r * 0.055, baseY - r * 1.25);
          g.lineTo(x + r * 0.09, baseY);
          g.closePath();
          g.fillStyle = SKY.trunk;
          g.fill();
          const cy = baseY - r * 1.72;
          const puffs = [
            [-0.62, 0.1, 0.62],
            [0.6, 0.06, 0.6],
            [-0.05, -0.42, 0.68],
            [0.02, 0.16, 0.78]
          ];
          puffs.forEach((p, i) => {
            const px = x + p[0] * r;
            const py = cy + p[1] * r;
            const pr = r * p[2];
            const grd = g.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
            grd.addColorStop(0, i === 2 ? SKY.treeLight : SKY.treeMid);
            grd.addColorStop(1, SKY.treeDark);
            g.fillStyle = grd;
            ellipse(g, px, py, pr, pr * 0.92);
            g.fill();
          });
          g.globalAlpha = alpha * 0.9;
          g.fillStyle = "#E2694F";
          for (let i = 0; i < 3; i++) {
            const a = hash(i + 3, seed) * Math.PI * 2;
            const rr2 = r * (0.35 + hash(i + 9, seed) * 0.34);
            g.beginPath();
            g.arc(x + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * 0.8, Math.max(1, r * 0.055), 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          g.save();
          g.globalAlpha = alpha * 0.16;
          ellipse(g, x, baseY + r * 0.02, r * 0.8, r * 0.14);
          g.fillStyle = "#33562F";
          g.fill();
          g.restore();
        }
        _paintField(g) {
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const hz = L.horizonY;
          const grass = g.createLinearGradient(0, hz, 0, H);
          grass.addColorStop(0, SKY.grassFar);
          grass.addColorStop(0.45, SKY.grassMid);
          grass.addColorStop(1, SKY.grassNear);
          g.fillStyle = grass;
          g.beginPath();
          g.moveTo(0, hz);
          g.lineTo(W, hz);
          g.lineTo(W, H);
          g.lineTo(0, H);
          g.closePath();
          g.fill();
          const pool = g.createRadialGradient(
            W * 0.5,
            hz + (H - hz) * 0.55,
            10,
            W * 0.5,
            hz + (H - hz) * 0.55,
            W * 0.62
          );
          pool.addColorStop(0, "rgba(255,252,214,0.30)");
          pool.addColorStop(0.55, "rgba(255,252,214,0.10)");
          pool.addColorStop(1, "rgba(255,252,214,0)");
          g.fillStyle = pool;
          g.fillRect(0, hz, W, H - hz);
          g.save();
          g.lineCap = "round";
          for (let i = 1; i <= 8; i++) {
            const t = i / 8;
            const y = hz + Math.pow(t, 1.9) * (H - hz) * 0.82;
            const a = 0.07 + t * 0.1;
            g.beginPath();
            g.moveTo(-W * 0.04, y);
            g.quadraticCurveTo(W * 0.5, y - (1 - t) * H * 6e-3, W * 1.04, y);
            g.lineWidth = 1 + t * 2.4;
            g.strokeStyle = "rgba(255,255,255," + a + ")";
            g.stroke();
          }
          const vx = W * 0.5;
          for (let i = -2; i <= 2; i++) {
            g.beginPath();
            g.moveTo(vx + i * W * 0.055, hz + 4);
            g.lineTo(vx + i * W * 0.32, H);
            g.lineWidth = 1;
            g.strokeStyle = "rgba(255,255,255,0.075)";
            g.stroke();
          }
          g.restore();
          g.save();
          g.lineCap = "round";
          for (let i = 0; i < 110; i++) {
            const gx = W * hash(i, 42);
            const gy = hz + Math.pow(hash(i, 43), 0.75) * (H - hz) * 0.92;
            const len = 1.8 + hash(i, 44) * 5;
            g.lineWidth = 0.7 + hash(i, 45) * 0.9;
            g.strokeStyle = "rgba(255,255,255," + (0.05 + hash(i, 46) * 0.09).toFixed(3) + ")";
            g.beginPath();
            g.moveTo(gx, gy);
            g.quadraticCurveTo(gx + 1, gy - len * 0.6, gx + 2.4, gy - len);
            g.stroke();
          }
          g.restore();
          const flower = (fx, fy, r, petal) => {
            g.fillStyle = petal;
            for (let k = 0; k < 5; k++) {
              const a = k / 5 * Math.PI * 2;
              g.beginPath();
              g.ellipse(
                fx + Math.cos(a) * r * 0.9,
                fy + Math.sin(a) * r * 0.9,
                r * 0.66,
                r * 0.5,
                a,
                0,
                Math.PI * 2
              );
              g.fill();
            }
            g.fillStyle = "#F7D06B";
            g.beginPath();
            g.arc(fx, fy, r * 0.44, 0, Math.PI * 2);
            g.fill();
          };
          const petals = ["rgba(255,255,255,0.94)", "rgba(255,216,228,0.94)", "rgba(255,238,190,0.94)"];
          for (let i = 0; i < 9; i++) {
            const left = i < 5;
            const fx = left ? W * (0.045 + i * 0.043) : W * (0.755 + (i - 5) * 0.052);
            const fy = H * (0.7 + hash(i, 31) * 0.15);
            flower(fx, fy, 2.2 + hash(i, 32) * 1.5, petals[i % 3]);
          }
          const glow = g.createRadialGradient(W * 0.8, hz + H * 0.02, 4, W * 0.8, hz + H * 0.02, W * 0.7);
          glow.addColorStop(0, "rgba(255,250,215,0.35)");
          glow.addColorStop(1, "rgba(255,250,215,0)");
          g.fillStyle = glow;
          g.fillRect(0, hz - 6, W, H - hz);
          g.save();
          g.globalAlpha = 0.4;
          g.strokeStyle = "#7FA85F";
          g.lineWidth = 2;
          for (let i = 0; i < 7; i++) {
            const bx = i < 4 ? W * (0.02 + i * 0.035) : W * (0.86 + (i - 4) * 0.033);
            const by = H - 4 - hash(i, 7) * 10;
            const hgt = 12 + hash(i, 3) * 18;
            g.beginPath();
            g.moveTo(bx, by);
            g.quadraticCurveTo(bx + (i % 2 ? 3 : -3), by - hgt * 0.6, bx + (i % 2 ? 7 : -7), by - hgt);
            g.stroke();
          }
          g.restore();
        }
        // ================================================================ 世界
        _drawWorld(vm, screen) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const beam = ctx.createLinearGradient(0, L.fieldTop, 0, L.groundY);
          beam.addColorStop(0, "rgba(255,255,255,0.16)");
          beam.addColorStop(0.55, "rgba(255,255,255,0.07)");
          beam.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = beam;
          ctx.fillRect(W * 0.14, L.fieldTop, W * 0.72, L.groundY - L.fieldTop);
          if (screen === "play" || screen === "countdown") {
            for (let i = 0; i < 2; i++) {
              const t = this.clock * (0.3 + i * 0.1) + i * 2.2;
              const bx2 = W * (i === 0 ? 0.13 : 0.87) + Math.sin(t) * W * 0.055;
              const by = L.fieldTop + (L.groundY - L.fieldTop) * (0.66 + 0.1 * Math.sin(t * 0.8 + i));
              const flap = 0.35 + Math.abs(Math.sin(this.clock * 5.5 + i)) * 0.65;
              ctx.save();
              ctx.globalAlpha = 0.55;
              ctx.translate(bx2, by);
              ctx.fillStyle = i === 0 ? "rgba(255,205,110,0.95)" : "rgba(255,175,196,0.95)";
              ctx.beginPath();
              ctx.ellipse(-3.4, -1.2, 3.8 * flap, 2.7, -0.42, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.ellipse(3.4, -1.2, 3.8 * flap, 2.7, 0.42, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "rgba(96,68,40,0.9)";
              ctx.beginPath();
              ctx.ellipse(0, 0, 1.1, 2.3, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          const bx = vm.basket ? clamp(vm.basket.x, 0, 1) : 0.5;
          ctx.save();
          ctx.globalAlpha = 0.1;
          ellipse(ctx, bx * W, L.groundY + 2, L.basketHalfW * 1.5, 7);
          ctx.fillStyle = "#33502C";
          ctx.fill();
          ctx.restore();
          this._drawFruits(vm);
          if (screen === "play") this._drawAimGuide(vm);
          if (screen !== "result") this._drawBasket(vm);
          this._drawFx(vm);
          const vig = ctx.createRadialGradient(W * 0.5, H * 0.55, W * 0.42, W * 0.5, H * 0.55, W * 0.95);
          vig.addColorStop(0, "rgba(20,50,30,0)");
          vig.addColorStop(1, "rgba(20,50,30,0.1)");
          ctx.fillStyle = vig;
          ctx.fillRect(0, 0, W, H);
        }
        _fruitPx(f) {
          const L = this.L;
          return {
            x: f.x * L.W,
            y: L.fieldTop + f.y * L.fieldH
          };
        }
        _fruitRadius(type) {
          const t = FRUIT_TYPES.find((it) => it.id === type) || FRUIT_TYPES[0];
          return t.r * this.L.fruitScale;
        }
        _drawFruits(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const anim = vm.catchAnimSec || 0.36;
          const fruits = vm.fruits || [];
          const basketX = vm.basket ? vm.basket.x : 0.5;
          for (let i = 0; i < fruits.length; i++) {
            const f = fruits[i];
            const r0 = this._fruitRadius(f.type);
            const p = this._fruitPx(f);
            if (f.state === "caught") {
              const age = clamp((this.engine.t - f.caughtAt) / anim, 0, 1);
              const ease = age * age * (3 - 2 * age);
              const fromX = (f.catchFromX !== void 0 ? f.catchFromX : f.x) * L.W;
              const toX = basketX * L.W;
              const fromY = L.fieldTop + L.catchLine * L.fieldH;
              const toY = L.fieldTop + (L.catchLine + 0.1) * L.fieldH;
              const x = lerp(fromX, toX, ease);
              const y = lerp(fromY, toY, ease);
              const r = r0 * (1 - ease * 0.42);
              drawFruit(ctx, f.type, x, y, r, f.rot + ease * 1.6, { alpha: 1 - ease * 0.55 });
              continue;
            }
            if (f.state === "missed") {
              const t = clamp((f.y - 1) / 0.3, 0, 1);
              drawFruit(ctx, f.type, p.x, p.y, r0 * (1 - t * 0.28), f.rot, { alpha: (1 - t) * 0.85 });
              continue;
            }
            const depthScale = 0.74 + 0.26 * clamp(f.y, 0, 1);
            if (f.y > 0.42) {
              const k = clamp((f.y - 0.42) / 0.58, 0, 1);
              const sw = r0 * (1.05 - k * 0.42);
              ctx.save();
              ctx.globalAlpha = 0.08 + k * 0.16;
              ellipse(ctx, p.x, L.rimY + 3, sw, sw * 0.26);
              ctx.fillStyle = "#2C4A22";
              ctx.fill();
              ctx.restore();
            }
            drawFruit(ctx, f.type, p.x, p.y, r0 * depthScale, f.rot);
          }
        }
        _drawBasket(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const b = vm.basket || { x: 0.5, tilt: 0, squash: 0, flash: 0 };
          const halfW = L.basketHalfW;
          const x = b.x * L.W;
          const aligned = !!vm.aligned;
          const alpha = 1 - (vm.missFlash || 0) * 0.12;
          if ((vm.missFlash || 0) > 0.02) {
            const t = 1 - vm.missFlash;
            ctx.save();
            ctx.globalAlpha = (vm.missFlash || 0) * 0.35;
            ellipse(ctx, x, L.rimY, halfW * (1.2 + t * 0.9), halfW * (0.3 + t * 0.2));
            ctx.lineWidth = 2;
            ctx.strokeStyle = C.amber;
            ctx.stroke();
            ctx.restore();
          }
          ctx.save();
          ctx.globalAlpha = aligned ? 0.62 : 0.26;
          const g = ctx.createRadialGradient(x, L.rimY, halfW * 0.2, x, L.rimY, halfW * 1.5);
          g.addColorStop(0, aligned ? "rgba(63,195,176,0.5)" : "rgba(255,255,255,0.3)");
          g.addColorStop(1, "rgba(63,195,176,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x, L.rimY, halfW * 1.5, halfW * 0.9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          drawBasket(ctx, x, L.rimY, halfW, {
            tilt: b.tilt,
            squash: b.squash,
            flash: b.flash,
            alpha
          });
        }
        /** 最低水果的落点引导：虚线 + 篮口高度上的落点标记 */
        _drawAimGuide(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const fruits = vm.fruits || [];
          let target = null;
          for (let i = 0; i < fruits.length; i++) {
            const f = fruits[i];
            if (f.state !== "fall" || f.y >= L.catchLine) continue;
            if (!target || f.y > target.y) target = f;
          }
          if (!target) return;
          const p = this._fruitPx(target);
          const r = this._fruitRadius(target.type);
          if (p.y + r * 0.5 >= L.rimY) return;
          const aligned = !!vm.aligned;
          ctx.save();
          ctx.globalAlpha = aligned ? 0.32 : 0.18;
          ctx.setLineDash([5, 7]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = aligned ? "#0F9C8C" : "#FFFFFF";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + r * 0.7);
          ctx.lineTo(p.x, L.rimY + 1);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = aligned ? 0.65 : 0.34;
          ctx.beginPath();
          ctx.ellipse(p.x, L.rimY + 1, L.basketHalfW * 0.6, 5, 0, 0, Math.PI * 2);
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = aligned ? "#0F9C8C" : "rgba(255,255,255,0.95)";
          ctx.stroke();
          ctx.restore();
        }
        _drawFx(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const t = this.engine.t;
          const bursts = vm.bursts || [];
          for (let bi = 0; bi < bursts.length; bi++) {
            const b = bursts[bi];
            const age = t - b.at;
            if (age < 0 || age > 1.1) continue;
            const bx = b.x * L.W;
            const by = L.fieldTop + L.catchLine * L.fieldH - 12;
            const k = clamp(age / 0.7, 0, 1);
            const alpha = 1 - k;
            const color = this._fruitColor(b.type);
            ctx.save();
            for (let i = 0; i < 9; i++) {
              const a = hash(i, b.seed) * Math.PI * 2;
              const sp = (46 + hash(i + 20, b.seed) * 96) * (1 - k * 0.55);
              const px = bx + Math.cos(a) * sp * age;
              const py = by + Math.sin(a) * sp * age + 210 * age * age;
              const pr = Math.max(0.8, (2.4 + hash(i + 40, b.seed) * 3) * (1 - k * 0.7));
              ctx.globalAlpha = alpha * 0.9;
              ctx.fillStyle = i % 3 === 0 ? "#FFFFFF" : color;
              ctx.beginPath();
              ctx.arc(px, py, pr, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
          const pops = vm.pops || [];
          for (let i = 0; i < pops.length; i++) {
            const p = pops[i];
            const age = t - p.at;
            if (age < 0 || age > 1.2) continue;
            const k = clamp(age / 1, 0, 1);
            const alpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
            const x = p.x * L.W;
            const y = L.fieldTop + L.catchLine * L.fieldH - 18 - k * 46;
            const scale = 1 + Math.max(0, 0.22 - k) * 2.2;
            ctx.save();
            ctx.globalAlpha = clamp(alpha, 0, 1);
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = '800 20px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(255,255,255,0.92)";
            ctx.strokeText(p.text, 0, 0);
            ctx.fillStyle = p.combo >= 3 ? C.amberDeep : C.tealDeep;
            ctx.fillText(p.text, 0, 0);
            if (p.mul && p.mul > 1.05) {
              ctx.font = '700 10px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
              ctx.lineWidth = 3;
              ctx.strokeStyle = "rgba(255,255,255,0.9)";
              ctx.strokeText("x" + p.mul.toFixed(2), 0, 16);
              ctx.fillStyle = C.amberDeep;
              ctx.fillText("x" + p.mul.toFixed(2), 0, 16);
            }
            ctx.restore();
          }
        }
        _fruitColor(type) {
          if (type === "orange") return "#F59A28";
          if (type === "banana") return "#FFCE3A";
          if (type === "strawberry") return "#E93B4E";
          if (type === "watermelon") return "#EF4A55";
          return "#DE3B31";
        }
        // ================================================================ HUD
        _drawHud(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const x = 12;
          const y = L.hudY;
          const w = W - 24;
          const h = L.hudH;
          const short = L.short;
          ctx.save();
          ctx.shadowColor = "rgba(16,48,32,0.18)";
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 6;
          rr(ctx, x, y, w, h, 20);
          ctx.fillStyle = "rgba(255,255,255,0.97)";
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, 20);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.stroke();
          const topBar = ctx.createLinearGradient(x + 16, 0, x + w - 16, 0);
          topBar.addColorStop(0, "#7ED3B6");
          topBar.addColorStop(0.55, "#F3C96B");
          topBar.addColorStop(1, "#F2A07C");
          rr(ctx, x + 16, y + 2, w - 32, 3, 1.5);
          ctx.fillStyle = topBar;
          ctx.fill();
          const labelY = y + (short ? 20 : 22);
          const numBase = y + (short ? 46 : 52);
          const scoreStr = String(Math.round(vm.score));
          this._text("\u5F97\u5206", x + 16, labelY, { size: 9.5, weight: "700", color: C.inkMute });
          this._text(scoreStr, x + 15, numBase, { size: short ? 26 : 30, weight: "800", color: C.ink });
          const lowTime = vm.timeLeft <= 10;
          this._text("\u5269\u4F59", x + w - 16, labelY, {
            size: 9.5,
            weight: "700",
            color: C.inkMute,
            align: "right"
          });
          this._text(vm.timeLeftText, x + w - 15, numBase - (short ? 2 : 3), {
            size: short ? 20 : 23,
            weight: "800",
            color: lowTime ? C.danger : C.ink,
            align: "right"
          });
          const combo = vm.combo || 0;
          const ccx = x + w * 0.5;
          const ccy = y + (short ? 33 : 37);
          if (combo >= 2) {
            const pop = 1 + Math.max(0, 0.16 - (vm.comboFlash || 0) * 0.16);
            const label = "\u8FDE\u51FB " + combo + (vm.comboMul > 1.02 ? "  x" + vm.comboMul.toFixed(1) : "");
            const cw = this._measure(label, 10.5, "700") + 20;
            ctx.save();
            ctx.translate(ccx, ccy);
            ctx.scale(pop, pop);
            ctx.shadowColor = "rgba(222,142,28,0.35)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 2;
            rr(ctx, -cw / 2, -10, cw, 21, 10.5);
            const g = ctx.createLinearGradient(0, -10, 0, 11);
            g.addColorStop(0, "#F7C566");
            g.addColorStop(1, "#E39425");
            ctx.fillStyle = g;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            this._text(label, 0, 3.6, { size: 10.5, weight: "700", color: "#FFFFFF", align: "center" });
            ctx.restore();
          } else {
            this._text("\u8FDE\u51FB \u2014", ccx, ccy + 3.4, {
              size: 9,
              weight: "600",
              color: "rgba(21,45,34,0.22)",
              align: "center"
            });
          }
          const divY = y + (short ? 55 : 62);
          ctx.beginPath();
          ctx.moveTo(x + 16, divY);
          ctx.lineTo(x + w - 16, divY);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(21,45,34,0.08)";
          ctx.stroke();
          const statY = y + (short ? 70 : 79);
          const judged = (vm.hits || 0) + (vm.misses || 0);
          const acc = judged > 0 ? clamp(vm.accuracy || 0, 0, 1) : null;
          const cols = [
            { k: "\u63A5\u4F4F", v: String(vm.hits || 0), c: C.teal },
            { k: "\u6F0F\u63A5", v: String(vm.misses || 0), c: C.amber },
            {
              k: "\u547D\u4E2D",
              v: acc === null ? "\u2014" : Math.round(acc * 100) + "%",
              c: acc === null ? C.inkMute : acc >= 0.6 ? C.teal : C.amber
            }
          ];
          const colW = (w - 32) / 3;
          cols.forEach((c, i) => {
            const cx0 = x + 16 + colW * i;
            this._dot(cx0 + 3, statY - 3.2, 3, c.c);
            this._text(c.k, cx0 + 11, statY, { size: 9, weight: "600", color: C.inkMute });
            const kw = this._measure(c.k, 9, "600");
            this._text(c.v, cx0 + 11 + kw + 5, statY, { size: 11, weight: "800", color: C.ink });
            if (i < 2) {
              ctx.beginPath();
              ctx.moveTo(cx0 + colW - 9, statY - 9);
              ctx.lineTo(cx0 + colW - 9, statY + 3);
              ctx.lineWidth = 1;
              ctx.strokeStyle = "rgba(21,45,34,0.07)";
              ctx.stroke();
            }
          });
          const ratio = clamp(vm.timeLeft / Math.max(1, vm.plannedSec), 0, 1);
          const barX = x + 16;
          const barW = w - 32;
          const barY = y + h - 9;
          rr(ctx, barX, barY, barW, 4, 2);
          ctx.fillStyle = "rgba(21,45,34,0.08)";
          ctx.fill();
          if (ratio > 0.01) {
            const pg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            pg.addColorStop(0, "#43C7B0");
            pg.addColorStop(1, lowTime ? "#DF5540" : "#9BDC8F");
            rr(ctx, barX, barY, Math.max(4, barW * ratio), 4, 2);
            ctx.fillStyle = pg;
            ctx.fill();
          }
          this._drawBottomBar(vm);
        }
        _drawBottomBar(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const by = L.btnY;
          const bh = L.btnH;
          const bw = Math.min(84, W * 0.22);
          this._button("pause", 12, by, bw, bh, vm.state === "PAUSED" ? "\u7EE7\u7EED" : "\u6682\u505C", {
            variant: "glass",
            icon: vm.state === "PAUSED" ? "play" : "pause",
            size: 12
          });
          this._button("quit", W - 12 - bw, by, bw, bh, "\u7ED3\u675F", {
            variant: "glass",
            icon: "exit",
            size: 12
          });
          const basketX = clamp(vm.basket ? vm.basket.x : 0.5, 0, 1);
          const x0 = 12 + bw + 12;
          const x1 = W - 12 - bw - 12;
          const pillW = Math.max(40, x1 - x0);
          const pillH = Math.min(30, bh);
          const pillY = by + (bh - pillH) / 2;
          ctx.save();
          ctx.shadowColor = "rgba(16,48,32,0.12)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
          rr(ctx, x0, pillY, pillW, pillH, pillH / 2);
          ctx.fillStyle = "rgba(255,255,255,0.94)";
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          const trackX0 = x0 + 14;
          const trackX1 = x0 + pillW - 30;
          const trackW = Math.max(20, trackX1 - trackX0);
          const ty = pillY + pillH / 2;
          rr(ctx, trackX0, ty - 2.5, trackW, 5, 2.5);
          ctx.fillStyle = "rgba(21,45,34,0.09)";
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            const tx = trackX0 + trackW * (i / 2);
            ctx.fillStyle = i === 1 ? "rgba(21,45,34,0.28)" : "rgba(21,45,34,0.16)";
            ctx.fillRect(tx - 0.6, ty - (i === 1 ? 6 : 4.5), 1.2, i === 1 ? 12 : 9);
          }
          const aligned = !!vm.aligned;
          const kx = trackX0 + trackW * basketX;
          const kr = aligned ? 7 : 6;
          ctx.beginPath();
          ctx.arc(kx, ty, kr, 0, Math.PI * 2);
          ctx.fillStyle = aligned ? C.teal : C.amber;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.stroke();
          const dirWord = vm.dir === "left" ? "\u5DE6" : vm.dir === "right" ? "\u53F3" : "\u4E2D";
          this._text(dirWord, x0 + pillW - 11, ty + 3.2, {
            size: 9.5,
            weight: "700",
            color: aligned ? C.tealDeep : C.inkMute,
            align: "right"
          });
          ctx.restore();
        }
        _dot(x, y, r, color) {
          const ctx = this.ctx;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        // ================================================================ 模拟控制
        _drawSimPad(vm) {
          const L = this.L;
          const W = L.W;
          const x = 10;
          const chipY = L.hudBottom + 6;
          this._miniChip("sim:toggle", x, chipY, 62, 24, this.simOpen ? "\u6536\u8D77 \u25B4" : "\u6A21\u62DF \u25BE", true);
          if (!this.simOpen) return;
          const bw = 44;
          const bh = 28;
          const gap = 4;
          const rows = [
            [
              { id: "sim:hold", label: "\u56DE\u4E2D" },
              { id: "sim:out", label: "\u503E\u8EAB" },
              { id: "sim:spawn", label: "\u8865\u679C" }
            ],
            [
              { id: "sim:catch", label: "\u63A5\u4F4F" },
              { id: "sim:miss", label: "\u6F0F\u63A5" },
              { id: "sim:lost", label: "\u65AD\u7EBF" }
            ],
            [
              { id: "sim:combo", label: "\u8FDE\u51FB" }
            ]
          ];
          let y = chipY + 28;
          rows.forEach((row) => {
            row.forEach((btn, i) => {
              this._miniChip(btn.id, x + i * (bw + gap), y, bw, bh, btn.label, false);
            });
            y += bh + gap;
          });
          void W;
        }
        _miniChip(id, x, y, w, h, label, strong) {
          const ctx = this.ctx;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          rr(ctx, x, y, w, h, 9);
          ctx.fillStyle = pressed ? "rgba(15,156,140,0.95)" : strong ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.78)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = pressed ? "rgba(15,156,140,1)" : "rgba(21,45,34,0.12)";
          ctx.stroke();
          this._text(label, x + w / 2, y + h * 0.66, {
            size: 11,
            weight: "700",
            color: pressed ? "#FFFFFF" : C.inkSoft,
            align: "center"
          });
          this.buttons.push({ id, x, y, w, h });
        }
        // ================================================================ 倒计时 / 暂停 / 断线
        _drawCountdown(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const n = Math.max(1, Math.ceil(vm.countdown));
          const frac = 1 - (vm.countdown - Math.floor(vm.countdown));
          ctx.save();
          ctx.fillStyle = "rgba(12,40,26,0.22)";
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
          const cx = W / 2;
          const cy = H * 0.42;
          const r = Math.min(W * 0.15, 58);
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.94)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.lineWidth = 4;
          ctx.strokeStyle = C.tealLight;
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.restore();
          this._text(String(n), cx, cy + 14, { size: 40, weight: "800", color: C.ink, align: "center" });
          this._text("\u51C6\u5907\u5F00\u59CB", cx, cy + r + 26, {
            size: 13,
            weight: "600",
            color: "#FFFFFF",
            align: "center",
            shadow: true
          });
          this._text("\u5DE6\u53F3\u503E\u8EAB\uFF0C\u628A\u679C\u7BEE\u79FB\u5230\u6C34\u679C\u4E0B\u9762", cx, cy + r + 46, {
            size: 10.5,
            weight: "500",
            color: "rgba(255,255,255,0.85)",
            align: "center"
          });
        }
        _drawPauseOverlay(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          ctx.save();
          ctx.fillStyle = "rgba(10,36,24,0.42)";
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
          const pw = Math.min(W - 56, 320);
          const ph = 250;
          const px = (W - pw) / 2;
          const py = (H - ph) / 2 - 10;
          this._panel(px, py, pw, ph);
          this._text("\u5DF2\u6682\u505C", px + pw / 2, py + 42, { size: 19, weight: "800", color: C.ink, align: "center" });
          this._text("\u6C34\u679C\u3001\u8BA1\u65F6\u4E0E\u5224\u5B9A\u90FD\u505C\u5728\u539F\u5730", px + pw / 2, py + 64, {
            size: 10.5,
            weight: "500",
            color: C.inkMute,
            align: "center"
          });
          this._text("\u5DF2\u63A5\u4F4F " + vm.hits + " \xB7 \u6F0F\u63A5 " + vm.misses, px + pw / 2, py + 90, {
            size: 12,
            weight: "600",
            color: C.inkSoft,
            align: "center"
          });
          this._button("resume", px + 24, py + ph - 116, pw - 48, 44, "\u7EE7\u7EED\u8BAD\u7EC3", { variant: "primary", icon: "play", size: 14 });
          this._button("quit", px + 24, py + ph - 64, pw - 48, 40, "\u7ED3\u675F\u672C\u5C40\u5E76\u67E5\u770B\u6210\u7EE9", { variant: "ghost", icon: "exit", size: 11 });
        }
        _drawSensorOverlay(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          ctx.save();
          ctx.fillStyle = "rgba(10,36,24,0.5)";
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
          const pw = Math.min(W - 48, 330);
          const ph = 262;
          const px = (W - pw) / 2;
          const py = (H - ph) / 2 - 8;
          this._panel(px, py, pw, ph, { accent: C.amber });
          this._text("\u4F20\u611F\u5668\u6570\u636E\u4E2D\u65AD", px + pw / 2, py + 44, { size: 18, weight: "800", color: C.ink, align: "center" });
          this._text("\u5DF2\u505C\u6B62\u63A5\u53D6\u5224\u5B9A\uFF0C\u672C\u5C40\u4E0D\u4F1A\u56E0\u4E2D\u65AD\u800C\u5F97\u5206", px + pw / 2, py + 68, {
            size: 10.5,
            weight: "500",
            color: C.inkMute,
            align: "center"
          });
          this._text(
            "\u4E2D\u65AD " + (vm.interrupted ? vm.interrupted.count : 0) + " \u6B21 \xB7 \u7D2F\u8BA1 " + ((vm.interrupted ? vm.interrupted.totalSec : 0) || 0).toFixed(1) + " \u79D2",
            px + pw / 2,
            py + 92,
            { size: 11, weight: "600", color: C.amberDeep, align: "center" }
          );
          this._button("reconnect", px + 24, py + 112, pw - 48, 44, "\u91CD\u65B0\u8FDE\u63A5\u4F20\u611F\u5668", { variant: "primary", icon: "bluetooth", size: 13 });
          this._button("resume", px + 24, py + 164, (pw - 58) / 2, 38, "\u7EE7\u7EED\u7B49\u5F85", { variant: "ghost", size: 11 });
          this._button("quit", px + 24 + (pw - 58) / 2 + 10, py + 164, (pw - 58) / 2, 38, "\u7ED3\u675F\u672C\u5C40", { variant: "ghost", size: 11 });
        }
        // ================================================================ 介绍页
        _drawIntro(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(255,255,255,0.18)");
          scrim.addColorStop(0.42, "rgba(255,255,255,0.10)");
          scrim.addColorStop(0.62, "rgba(255,253,246,0.30)");
          scrim.addColorStop(1, "rgba(255,251,240,0.55)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          const cardX = 16;
          const cardW = W - 32;
          const roomy = H >= 700;
          const needH = roomy ? 404 : 336;
          let cardH = Math.min(needH, H - (L.safeTop + 18) - 196 - 16);
          cardH = Math.max(300, cardH);
          let cardY = H - 16 - cardH;
          const headMin = L.safeTop + 18;
          if (cardY - headMin < 214) {
            cardY = Math.min(headMin + 214, H - 16 - 300);
            cardH = H - 16 - cardY;
          }
          const headNeed = 196;
          const headTop = headMin + Math.max(0, Math.min(54, (cardY - headMin - headNeed) * 0.42));
          const top = headTop;
          this._text("\u63A5\u6C34\u679C", 24, top + 34, { size: 34, weight: "800", color: C.ink });
          this._text("\u679C\u56ED\u63A5\u679C\u8BAD\u7EC3", 25, top + 58, { size: 12, weight: "700", color: C.inkSoft });
          this._text("\u5DE6\u53F3\u503E\u8EAB \xB7 \u8EAB\u4F53\u4E00\u52A8\uFF0C\u679C\u7BEE\u8DDF\u7740\u8D70", 25, top + 78, {
            size: 11,
            weight: "500",
            color: C.inkMute
          });
          const rowY = top + 116;
          const types = ["apple", "orange", "banana", "strawberry", "watermelon"];
          const gap = Math.min(56, (W - 60) / 5);
          types.forEach((t, i) => {
            const fx = 34 + i * gap;
            const bob = Math.sin(this.clock * 1.4 + i * 0.7) * 2.2;
            drawFruit(ctx, t, fx, rowY + bob, 15 * L.fruitScale, Math.sin(this.clock * 0.9 + i) * 0.18);
          });
          let cx = 25;
          const chips = [];
          chips.push({
            t: vm.sim ? "\u6A21\u62DF\u6570\u636E" : vm.stale ? "\u4F20\u611F\u5668\u672A\u8FDE\u63A5" : "\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5",
            bg: vm.sim ? "rgba(227,154,50,0.95)" : vm.stale ? "rgba(255,255,255,0.9)" : "rgba(15,156,140,0.92)",
            fg: vm.sim ? "#FFFFFF" : vm.stale ? "#6B7A70" : "#FFFFFF"
          });
          chips.push({ t: "\u65F6\u957F " + (Number(this.cfg.get("durationSec")) || 90) + " \u79D2", bg: "rgba(255,255,255,0.9)", fg: C.inkSoft });
          chips.push({ t: "\u7B2C " + vm.difficulty + " \u6863", bg: "rgba(255,255,255,0.9)", fg: C.inkSoft });
          chips.forEach((c) => {
            const w = this._measure(c.t, 10.5, "600") + 20;
            rr(ctx, cx, rowY + 26, w, 22, 11);
            ctx.fillStyle = c.bg;
            ctx.fill();
            this._text(c.t, cx + w / 2, rowY + 41, {
              size: 10.5,
              weight: "600",
              color: c.fg || "#FFFFFF",
              align: "center"
            });
            cx += w + 7;
          });
          this._glass(cardX, cardY, cardW, cardH, 22);
          this._text("\u600E\u4E48\u73A9", cardX + 20, cardY + 26, { size: 12, weight: "700", color: C.ink });
          const steps = [
            "\u7AD9\u597D\u6216\u5750\u7A33\uFF0C\u5728\u4E2D\u7ACB\u4F4D\u5B8C\u6210\u96F6\u70B9\u6807\u5B9A",
            "\u8EAB\u4F53\u5411\u5DE6\u6216\u5411\u53F3\u503E\uFF0C\u679C\u7BEE\u4F1A\u8DDF\u7740\u6A2A\u5411\u79FB\u52A8",
            "\u6C34\u679C\u843D\u4E0B\u524D\u628A\u679C\u7BEE\u79FB\u5230\u5B83\u6B63\u4E0B\u65B9\u5C31\u7B97\u63A5\u4F4F"
          ];
          const stepGap = roomy ? 26 : 22;
          steps.forEach((s, i) => {
            const sy = cardY + 50 + i * stepGap;
            ctx.beginPath();
            ctx.arc(cardX + 25, sy - 4, 8, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(15,156,140,0.12)";
            ctx.fill();
            this._text(String(i + 1), cardX + 25, sy - 0.5, {
              size: 9,
              weight: "700",
              color: C.tealDeep,
              align: "center"
            });
            this._text(s, cardX + 39, sy - 0.5, { size: 10.5, weight: "500", color: C.inkSoft });
          });
          let contentY = cardY + 50 + steps.length * stepGap + 2;
          if (roomy) {
            const params2 = [
              { k: "\u63A5\u53D6\u5BBD\u5EA6", v: (Number(this.cfg.get("basketWidthPct")) || 24) + "% \u5C4F\u5BBD" },
              { k: "\u5DE6\u53F3\u884C\u7A0B", v: "\u6574\u5C4F\u53EF\u79FB\u52A8" },
              { k: "\u751F\u6210\u95F4\u9694", v: (Number(this.cfg.get("spawnInterval")) || 1.4).toFixed(1) + " \u79D2/\u4E2A" },
              { k: "\u4E0B\u843D\u901F\u5EA6", v: (Number(this.cfg.get("fallSpeed")) || 0.26).toFixed(2) + " \u5C4F\u9AD8/\u79D2" }
            ];
            const cellW = (cardW - 40) / 2;
            params2.forEach((p, i) => {
              const px2 = cardX + 20 + i % 2 * cellW;
              const py2 = contentY + Math.floor(i / 2) * 38;
              rr(ctx, px2, py2, cellW - 8, 32, 9);
              ctx.fillStyle = "rgba(21,45,34,0.035)";
              ctx.fill();
              this._text(p.k, px2 + 10, py2 + 13, { size: 9.5, weight: "500", color: C.inkMute });
              this._text(p.v, px2 + 10, py2 + 26, { size: 10.5, weight: "700", color: C.ink });
            });
            contentY += 82;
            this._text("\u6210\u7EE9\u5148\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u53EF\u5728\u300C\u8BAD\u7EC3\u8BB0\u5F55\u300D\u91CC\u67E5\u770B\u5E76\u4E0A\u62A5\u6CBB\u7597\u5E08", cardX + 20, contentY + 4, {
              size: 9.5,
              weight: "500",
              color: "rgba(21,45,34,0.42)"
            });
          } else {
            this._text("\u4E5F\u53EF\u4EE5\u5148\u5230\u300C\u8BAD\u7EC3\u8BBE\u7F6E\u300D\u8C03\u6574\u96BE\u5EA6\u4E0E\u63A5\u53D6\u8303\u56F4", cardX + 20, contentY + 6, {
              size: 9,
              weight: "600",
              color: C.inkMute
            });
          }
          const btnH = 48;
          const startY = cardY + cardH - btnH - 16;
          this._button("start", cardX + 18, startY, cardW - 36, btnH, "\u5F00\u59CB\u8BAD\u7EC3", { variant: "primary", icon: "play", size: 15 });
          const halfW = (cardW - 46) / 2;
          this._button("settings", cardX + 18, startY - 44, halfW, 36, "\u8BAD\u7EC3\u8BBE\u7F6E", { variant: "ghost", icon: "gear", size: 11 });
          this._button("records", cardX + 28 + halfW, startY - 44, halfW, 36, "\u8BAD\u7EC3\u8BB0\u5F55", { variant: "ghost", icon: "list", size: 11 });
          const swY = startY - 74;
          const label = vm.sim ? "\u6A21\u62DF\u6570\u636E\uFF1A\u5F00\uFF08\u4EC5\u7528\u4E8E\u6D4B\u8BD5\uFF09" : "\u4F7F\u7528\u6A21\u62DF\u6570\u636E\u6D4B\u8BD5\uFF08\u65E0\u4F20\u611F\u5668\u4E5F\u80FD\u73A9\uFF09";
          this._text(label, cardX + 18, swY + 14, {
            size: 10,
            weight: "600",
            color: vm.sim ? C.amberDeep : C.inkMute
          });
          const swW = 44;
          const swH = 24;
          const swX = cardX + cardW - 18 - swW;
          rr(ctx, swX, swY, swW, swH, swH / 2);
          ctx.fillStyle = vm.sim ? "rgba(227,154,50,0.95)" : "rgba(21,45,34,0.14)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(swX + (vm.sim ? swW - swH / 2 : swH / 2), swY + swH / 2, swH / 2 - 3, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          this.buttons.push({ id: vm.sim ? "sim:off" : "sim:on", x: swX - 90, y: swY - 6, w: swW + 96, h: swH + 12 });
        }
        // ================================================================ 准备页
        _drawPrepare(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(255,255,255,0.16)");
          scrim.addColorStop(0.5, "rgba(255,255,255,0.10)");
          scrim.addColorStop(1, "rgba(255,251,240,0.48)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          const cardX = 16;
          const cardW = W - 32;
          const cardNeed = 520;
          let cardH = Math.min(cardNeed, H - (L.safeTop + 76) - 20);
          cardH = Math.max(420, cardH);
          let cardY = H - 18 - cardH;
          const headShift = Math.max(0, Math.min(46, (cardY - (L.safeTop + 76) - 92) * 0.34));
          this._text("\u8BBE\u5907\u51C6\u5907", 22, L.safeTop + 34 + headShift, { size: 24, weight: "800", color: C.ink });
          this._text("\u4F69\u6234\u4F20\u611F\u5668 \u2192 \u96F6\u70B9\u6807\u5B9A \u2192 \u5F00\u59CB\u8BAD\u7EC3", 23, L.safeTop + 56 + headShift, {
            size: 11,
            weight: "600",
            color: C.inkSoft
          });
          this._button("back", W - 66, L.safeTop + 12 + headShift, 52, 34, "\u8FD4\u56DE", { variant: "link", size: 11 });
          this._glass(cardX, cardY, cardW, cardH, 22);
          let cx = cardX + 18;
          const connected = !vm.stale;
          const chips = [
            { t: vm.sim ? "\u6A21\u62DF\u6A21\u5F0F" : connected ? "\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5" : "\u4F20\u611F\u5668\u672A\u8FDE\u63A5", bg: vm.sim ? C.amber : connected ? C.teal : "rgba(21,45,34,0.35)" },
            { t: (vm.rateHz || 0) + " Hz", bg: "rgba(21,45,34,0.12)" }
          ];
          chips.forEach((c) => {
            const w = this._measure(c.t, 10, "700") + 18;
            rr(ctx, cx, cardY + 18, w, 22, 11);
            ctx.fillStyle = c.bg;
            ctx.fill();
            this._text(c.t, cx + w / 2, cardY + 33, { size: 10, weight: "700", color: "#FFFFFF", align: "center" });
            cx += w + 6;
          });
          if (!connected && !vm.sim) {
            this._button("connect", cardX + cardW - 92, cardY + 14, 78, 30, "\u53BB\u8FDE\u63A5", { variant: "primary", size: 11, icon: "bluetooth" });
          }
          const figW = Math.min(112, cardW * 0.32);
          const figH = Math.min(146, cardH * 0.32);
          this._drawWearFigure(cardX + 16 + figW / 2, cardY + 118, figH);
          const tx = cardX + 16 + figW + 34;
          const tw = cardW - (tx - cardX) - 16;
          const steps = [
            { t: "\u4F20\u611F\u5668\u5361\u5728\u80F8\u5E26\u4E0A", d: "\u80F8\u5E26\u4ECE\u814B\u4E0B\u6700\u9AD8\u70B9\u7ED5\u4E00\u5708\u56FA\u5B9A" },
            { t: "\u4FDD\u6301\u4E2D\u7ACB\u4F4D 3 \u79D2", d: "\u5750\u7A33\u6216\u7AD9\u7A33\uFF0C\u53CC\u624B\u81EA\u7136\u653E\u4E0B" },
            { t: "\u6807\u5B9A\u5B8C\u6210\u540E\u8FDB\u5165\u6E38\u620F", d: "\u8EAB\u4F53\u5DE6\u53F3\u503E\uFF0C\u679C\u7BEE\u8DDF\u7740\u8FC7\u53BB\u63A5\u6C34\u679C" }
          ];
          const stepGap2 = cardH > 560 ? 56 : cardH > 480 ? 52 : 46;
          steps.forEach((s, i) => {
            const sy = cardY + 66 + i * stepGap2;
            ctx.beginPath();
            ctx.arc(tx + 9, sy, 9, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 ? "rgba(15,156,140,0.16)" : "rgba(21,45,34,0.07)";
            ctx.fill();
            this._text(String(i + 1), tx + 9, sy + 3.5, {
              size: 10,
              weight: "700",
              color: C.tealDeep,
              align: "center"
            });
            this._text(s.t, tx + 24, sy + 4, { size: 11, weight: "600", color: C.ink });
            this._text(s.d, tx + 24, sy + 18, { size: 9, weight: "500", color: C.inkMute });
            void tw;
          });
          const infoY = cardY + 66 + 3 * stepGap2 - 8;
          if (vm.state === "CALIBRATING") {
            const p = clamp(vm.calibrationProgress || 0, 0, 1);
            this._text("\u6B63\u5728\u6807\u5B9A\uFF1A\u8BF7\u4FDD\u6301\u4E0D\u52A8", cardX + 18, infoY + 8, { size: 11, weight: "600", color: C.tealDeep });
            rr(ctx, cardX + 18, infoY + 16, cardW - 36, 8, 4);
            ctx.fillStyle = "rgba(21,45,34,0.08)";
            ctx.fill();
            rr(ctx, cardX + 18, infoY + 16, Math.max(4, (cardW - 36) * p), 8, 4);
            ctx.fillStyle = C.tealLight;
            ctx.fill();
          } else if (vm.calibration && !vm.calibration.simulated) {
            const ok = !!vm.calibration.ok;
            this._text(
              ok ? "\u6807\u5B9A\u5B8C\u6210\uFF1A\u5F53\u524D\u59FF\u6001\u5DF2\u8BB0\u4E3A\u4E2D\u7ACB\u4F4D" : vm.calibration.message || "\u6807\u5B9A\u5931\u8D25",
              cardX + 18,
              infoY + 12,
              {
                size: 10.5,
                weight: "600",
                color: ok ? C.tealDeep : C.danger
              }
            );
          } else if (!vm.calibrated) {
            this._text("\u8FD8\u6CA1\u6709\u6807\u5B9A\u3002\u8FDE\u63A5\u4F20\u611F\u5668\u540E\u5148\u505A\u4E00\u6B21\u96F6\u70B9\u6807\u5B9A\u3002", cardX + 18, infoY + 12, {
              size: 10,
              weight: "500",
              color: C.inkMute
            });
          }
          const btnH = 46;
          const by = cardY + cardH - btnH - 16;
          this._button("enter", cardX + 18, by, cardW - 36, btnH, "\u8FDB\u5165\u6E38\u620F", {
            variant: "primary",
            icon: "play",
            size: 15,
            disabled: vm.state === "CALIBRATING"
          });
          const halfW = (cardW - 46) / 2;
          this._button("calibrate", cardX + 18, by - 44, halfW, 38, vm.calibrated ? "\u91CD\u65B0\u6807\u5B9A" : "\u5F00\u59CB\u6807\u5B9A", {
            variant: "ghost",
            icon: "refresh",
            size: 11
          });
          this._button(vm.sim ? "sim:off" : "sim:on", cardX + 28 + halfW, by - 44, halfW, 38, vm.sim ? "\u5173\u95ED\u6A21\u62DF" : "\u4F7F\u7528\u6A21\u62DF", {
            variant: "ghost",
            icon: "check",
            size: 11
          });
          const ghostTop = by - 44;
          const chipsH = 46;
          const tipsH = 78;
          const tipsGap = 10;
          const bottomLimit = ghostTop - 12;
          let condTop = bottomLimit - (chipsH + tipsGap + tipsH);
          let showTips = condTop >= infoY + 30;
          if (!showTips) condTop = bottomLimit - chipsH;
          if (condTop >= infoY + 24) {
            this._text("\u672C\u5C40\u6761\u4EF6", cardX + 18, condTop + 10, { size: 10, weight: "700", color: C.ink });
            const conds = [
              "\u7B2C " + vm.difficulty + " \u6863",
              "\u7BEE\u5B50 " + (Number(this.cfg.get("basketWidthPct")) || 24) + "%",
              "\u6C34\u679C " + (Number(this.cfg.get("spawnInterval")) || 1.4).toFixed(1) + " \u79D2/\u4E2A",
              "\u843D\u901F " + (Number(this.cfg.get("fallSpeed")) || 0.26).toFixed(2)
            ];
            const widths = conds.map((c) => this._measure(c, 9.5, "600") + 18);
            const totalW = widths.reduce((a, b) => a + b, 0) + 6 * (conds.length - 1);
            if (totalW <= cardW - 36) {
              let ccx = cardX + 18;
              conds.forEach((c, i) => {
                rr(ctx, ccx, condTop + 18, widths[i], 22, 11);
                ctx.fillStyle = "rgba(21,45,34,0.05)";
                ctx.fill();
                this._text(c, ccx + widths[i] / 2, condTop + 33, {
                  size: 9.5,
                  weight: "600",
                  color: C.inkSoft,
                  align: "center"
                });
                ccx += widths[i] + 6;
              });
            } else {
              this._text(conds.join(" \xB7 "), cardX + 18, condTop + 33, {
                size: 9.5,
                weight: "600",
                color: C.inkSoft
              });
            }
            if (showTips) {
              const noteY = condTop + chipsH + tipsGap;
              rr(ctx, cardX + 16, noteY, cardW - 32, tipsH, 12);
              ctx.fillStyle = "rgba(15,156,140,0.06)";
              ctx.fill();
              this._text("\u6807\u5B9A\u5C0F\u8D34\u58EB", cardX + 30, noteY + 19, { size: 10, weight: "700", color: C.tealDeep });
              const tips = [
                "\u80F8\u5E26\u522B\u677E\uFF1A\u677E\u4E86\u4F20\u611F\u5668\u4F1A\u6643\uFF0C\u8BFB\u6570\u8DDF\u7740\u6296\uFF1B",
                "\u6807\u5B9A\u65F6\u4FDD\u6301\u5B89\u9759\uFF0C\u4E0D\u8981\u8F6C\u5934\u3001\u62AC\u624B\u6216\u8C03\u6574\u5750\u59FF\uFF1B",
                '\u82E5\u63D0\u793A"\u68C0\u6D4B\u5230\u6643\u52A8"\uFF0C\u5750\u7A33\u540E\u91CD\u65B0\u70B9\u300C\u5F00\u59CB\u6807\u5B9A\u300D\u3002'
              ];
              tips.forEach((t, i) => {
                this._text(t, cardX + 30, noteY + 35 + i * 14, {
                  size: 9.2,
                  weight: "500",
                  color: C.inkSoft
                });
              });
            }
          }
        }
        _drawWearFigure(cx, cy, h) {
          const ctx = this.ctx;
          const s = h / 140;
          const skin = "#F3D3B0";
          const shirt = "#4FA79A";
          const pants = "#3D5C6B";
          const strap = "#64798B";
          ctx.save();
          ctx.translate(cx, cy);
          ctx.save();
          ctx.globalAlpha = 0.12;
          ellipse(ctx, 0, 68 * s, 42 * s, 7 * s);
          ctx.fillStyle = "#20392B";
          ctx.fill();
          ctx.restore();
          rr(ctx, -14 * s, 8 * s, 28 * s, 22 * s, 6 * s);
          ctx.fillStyle = pants;
          ctx.fill();
          [-1, 1].forEach((side) => {
            rr(ctx, side * 7 * s - 5 * s, 28 * s, 10 * s, 32 * s, 4 * s);
            ctx.fillStyle = pants;
            ctx.fill();
            rr(ctx, side * 7 * s - 7 * s, 56 * s, 14 * s, 9 * s, 4 * s);
            ctx.fillStyle = "#2C3E48";
            ctx.fill();
          });
          [-1, 1].forEach((side) => {
            ctx.beginPath();
            ctx.moveTo(side * 14 * s, -33 * s);
            ctx.quadraticCurveTo(side * 27 * s, -12 * s, side * 23 * s, 16 * s);
            ctx.lineWidth = 7 * s;
            ctx.lineCap = "round";
            ctx.strokeStyle = shirt;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(side * 23 * s, 18 * s, 4.2 * s, 0, Math.PI * 2);
            ctx.fillStyle = skin;
            ctx.fill();
          });
          rr(ctx, -16 * s, -38 * s, 32 * s, 52 * s, 11 * s);
          const g = ctx.createLinearGradient(-16 * s, -38 * s, 16 * s, 14 * s);
          g.addColorStop(0, "#5FBDAE");
          g.addColorStop(1, shirt);
          ctx.fillStyle = g;
          ctx.fill();
          const bandTop = -33 * s;
          const bandBot = -26 * s;
          const bandBow = 1.6 * s;
          const bandPath = () => {
            ctx.beginPath();
            ctx.moveTo(-19 * s, bandTop);
            ctx.quadraticCurveTo(0, bandTop + bandBow, 19 * s, bandTop);
            ctx.lineTo(19 * s, bandBot);
            ctx.quadraticCurveTo(0, bandBot + bandBow, -19 * s, bandBot);
            ctx.closePath();
          };
          ctx.save();
          rr(ctx, -16 * s, -38 * s, 32 * s, 52 * s, 11 * s);
          ctx.clip();
          bandPath();
          ctx.fillStyle = strap;
          ctx.fill();
          ctx.save();
          bandPath();
          ctx.clip();
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.fillRect(-19 * s, bandTop, 38 * s, 2.4 * s);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(-19 * s, bandBot - 2.2 * s, 38 * s, 2.2 * s);
          ctx.restore();
          [-1, 1].forEach((side) => {
            rr(ctx, side * 14 * s - 2.3 * s, (bandTop + bandBot) / 2 - 2.8 * s, 4.6 * s, 5.6 * s, 1.4 * s);
            ctx.fillStyle = "#8C9DA9";
            ctx.fill();
            ctx.lineWidth = 0.7 * s;
            ctx.strokeStyle = "rgba(40,58,70,0.28)";
            ctx.stroke();
          });
          ctx.restore();
          const sw2 = 8.4 * s;
          const sh2 = 5.2 * s;
          const sy = (bandTop + bandBot) / 2;
          rr(ctx, -sw2 / 2 + 0.6 * s, sy - sh2 / 2 + 0.9 * s, sw2, sh2, 1.4 * s);
          ctx.fillStyle = "rgba(24,38,48,0.28)";
          ctx.fill();
          rr(ctx, -sw2 / 2, sy - sh2 / 2, sw2, sh2, 1.2 * s);
          ctx.fillStyle = "#E3982F";
          ctx.fill();
          ctx.lineWidth = 0.8 * s;
          ctx.strokeStyle = "rgba(255,255,255,0.92)";
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(2 * s, sy - 0.9 * s, 0.7 * s, 0, Math.PI * 2);
          ctx.fillStyle = "#9BF0D9";
          ctx.fill();
          rr(ctx, -4.5 * s, -44 * s, 9 * s, 10 * s, 4 * s);
          ctx.fillStyle = skin;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, -54 * s, 14 * s, 0, Math.PI * 2);
          ctx.fillStyle = skin;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, -58 * s, 14 * s, Math.PI * 1.02, Math.PI * 2.02);
          ctx.fillStyle = "#3A3128";
          ctx.fill();
          const drawLeader = (pts) => {
            const path = () => {
              ctx.beginPath();
              ctx.moveTo(pts[0][0] * s, pts[0][1] * s);
              for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s);
            };
            ctx.setLineDash([]);
            ctx.strokeStyle = "rgba(255,255,255,0.82)";
            ctx.lineWidth = 3;
            path();
            ctx.stroke();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = "rgba(21,45,34,0.34)";
            ctx.lineWidth = 1.1;
            path();
            ctx.stroke();
          };
          ctx.save();
          drawLeader([[16, sy / s], [27, sy / s], [27, -40], [30, -40]]);
          drawLeader([[0, (sy + 2.6 * s) / s], [0, -13], [27, -13], [30, -13]]);
          ctx.setLineDash([]);
          ctx.restore();
          const fs1 = Math.max(7, 7.8 * s);
          const fs2 = Math.max(6.8, 7.2 * s);
          this._text("\u80F8\u5E26", 32 * s, -42 * s, { size: fs1, weight: "700", color: C.inkMute });
          this._text("\u8FC7\u814B\u4E0B\u6700\u9AD8\u70B9", 32 * s, -33 * s, {
            size: fs2,
            weight: "500",
            color: "rgba(21,45,34,0.4)"
          });
          this._text("\u4F20\u611F\u5668", 32 * s, -15 * s, { size: fs1, weight: "700", color: C.inkMute });
          this._text("\u6263\u5728\u80F8\u5E26\u6B63\u4E2D", 32 * s, -6 * s, {
            size: fs2,
            weight: "500",
            color: "rgba(21,45,34,0.4)"
          });
          ctx.restore();
        }
        // ================================================================ 结算页
        _drawResult(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const engine2 = this.engine;
          const sum = engine2.summary || {};
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(255,255,255,0.30)");
          scrim.addColorStop(0.5, "rgba(255,253,246,0.42)");
          scrim.addColorStop(1, "rgba(255,249,238,0.62)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          const px = 16;
          const pw = W - 32;
          const py = Math.max(L.safeTop + 8, H * 0.055);
          const ph = H - py - 16;
          this._glass(px, py, pw, ph, 24);
          const tight = ph < 590;
          const aborted = !sum.completed;
          const gx = px + 20;
          const gw = pw - 40;
          const bh = tight ? 42 : 46;
          const btnBlockH = bh + 14 + (tight ? 40 : 44) + 10;
          const scoreSize = tight ? 36 : 40;
          const tileH = tight ? 38 : 42;
          const mGap = tight ? 30 : 34;
          const swayRows = (sum.sway || []).slice(0, tight ? 3 : 5);
          const rowGap = tight ? 13 : 15;
          const baseContent = (tight ? 104 : 108) + tileH + (tight ? 18 : 22) + mGap * 3 + (tight ? 8 : 12) + 14 + Math.max(1, swayRows.length) * rowGap + (tight ? 10 : 12);
          const spare = Math.max(0, ph - 26 - baseContent - btnBlockH);
          const topPad = 26 + Math.min(70, spare * 0.26);
          const gapA = Math.min(34, spare * 0.14);
          let y = py + topPad;
          this._text(aborted ? "\u672C\u5C40\u5DF2\u7ED3\u675F" : "\u8BAD\u7EC3\u5B8C\u6210", gx, y + 18, {
            size: 15,
            weight: "800",
            color: C.ink
          });
          this._text(sum.dataSource === "simulation" ? "\u6A21\u62DF\u6570\u636E \xB7 \u4E0D\u8BA1\u5165\u771F\u5B9E\u8BAD\u7EC3" : "\u771F\u5B9E\u4F20\u611F\u5668\u6570\u636E", gx, y + 34, {
            size: 9,
            weight: "500",
            color: sum.dataSource === "simulation" ? C.amberDeep : C.inkMute
          });
          const ringR = tight ? 20 : 23;
          this._gradeRing(px + pw - 30 - ringR, y + 30, ringR, sum.grade || "-");
          const scoreStr = String(sum.score || 0);
          this._text(scoreStr, gx, y + (tight ? 70 : 74), { size: scoreSize, weight: "800", color: C.ink });
          const sw = this._measure(scoreStr, scoreSize, "800");
          this._text("\u5206", gx + sw + 5, y + (tight ? 70 : 74), { size: 11, weight: "600", color: C.inkMute });
          this._text("\u63A5\u4F4F " + (sum.hits || 0) + " \u4E2A \xB7 \u6F0F\u63A5 " + (sum.misses || 0) + " \u4E2A \xB7 \u6210\u529F\u7387 " + Math.round((sum.accuracy || 0) * 100) + "%", gx, y + (tight ? 90 : 96), {
            size: 10,
            weight: "500",
            color: C.inkSoft
          });
          const tiles = [
            { k: "\u57FA\u7840\u5206", v: sum.breakdown && (sum.breakdown.rawBase !== void 0 ? sum.breakdown.rawBase : sum.breakdown.base) || 0 },
            { k: "\u8FDE\u51FB\u52A0\u6210", v: sum.breakdown && sum.breakdown.comboBonus || 0 },
            { k: "\u5B8C\u6210\u5956\u52B1", v: sum.breakdown && sum.breakdown.finishBonus || 0 },
            { k: "\u6700\u9AD8\u8FDE\u51FB", v: sum.comboMax || 0 }
          ];
          const tileY = y + (tight ? 100 : 108);
          const tileGap = 8;
          const tileW = (gw - tileGap * 3) / 4;
          tiles.forEach((t, i) => {
            const tx = gx + i * (tileW + tileGap);
            rr(ctx, tx, tileY, tileW, tileH, 10);
            ctx.fillStyle = "rgba(21,45,34,0.04)";
            ctx.fill();
            this._text(String(t.v), tx + tileW / 2, tileY + tileH * 0.5 + 4, {
              size: 13,
              weight: "700",
              color: C.ink,
              align: "center"
            });
            this._text(t.k, tx + tileW / 2, tileY + tileH - 5, {
              size: 9.5,
              weight: "500",
              color: C.inkMute,
              align: "center"
            });
          });
          y = tileY + tileH + gapA + (tight ? 8 : 10);
          const holdRate = typeof sum.holdRate === "number" ? sum.holdRate : 0;
          const metrics = [
            { k: "\u547D\u4E2D\u7387", v: Math.round((sum.accuracy || 0) * 100) + "%", hi: true },
            { k: "\u7A33\u5B9A\u7387", v: Math.round(holdRate * 100) + "%" },
            { k: "\u6700\u957F\u7A33\u5B9A", v: (sum.holdBestSec || 0).toFixed(1) + " \u79D2" },
            { k: "\u5E73\u5747\u504F\u79BB", v: (sum.deviationAvgDeg || 0).toFixed(1) + "\xB0 / \xB1" + (sum.holdToleranceDeg || 6) + "\xB0" },
            { k: "\u8BAD\u7EC3\u65F6\u957F", v: this._fmtSec(sum.durationSec || 0) },
            { k: "\u6570\u636E\u6765\u6E90", v: sum.dataSource === "simulation" ? "\u6A21\u62DF" : "\u771F\u5B9E" }
          ];
          const cellW = gw / 2;
          metrics.forEach((m, i) => {
            const mx = gx + i % 2 * cellW;
            const my = y + Math.floor(i / 2) * mGap;
            this._text(m.k, mx, my + 9, { size: 9, weight: "500", color: C.inkMute });
            this._text(m.v, mx, my + 24, { size: 12, weight: "700", color: m.hi ? C.tealDeep : C.ink });
          });
          y += mGap * 3 + gapA * 0.7;
          this._text("\u8EAB\u4F53\u6446\u52A8\u5206\u5E03\uFF08\u5F52\u4E00\u5316\u4EE3\u7406\uFF0C\u975E\u771F\u5B9E\u4F4D\u79FB\uFF09", gx, y + 6, { size: 9, weight: "600", color: C.inkMute });
          y += 14;
          swayRows.forEach((b, i) => {
            const ry = y + i * rowGap;
            const ratio = clamp(b.ratio || 0, 0, 1);
            this._text(b.label, gx, ry + 6, { size: 9.5, weight: "500", color: C.inkMute });
            const tx = gx + 42;
            const tw = gw - 42 - 32;
            rr(ctx, tx, ry, tw, 5, 2.5);
            ctx.fillStyle = "rgba(21,45,34,0.06)";
            ctx.fill();
            if (ratio > 0.01) {
              rr(ctx, tx, ry, Math.max(3, tw * ratio), 5, 2.5);
              ctx.fillStyle = i >= 3 ? "rgba(223,85,64,0.7)" : i >= 1 ? "rgba(227,154,50,0.72)" : "rgba(63,195,176,0.85)";
              ctx.fill();
            }
            this._text(Math.round(ratio * 100) + "%", gx + gw, ry + 6, {
              size: 9.5,
              weight: "600",
              color: C.inkMute,
              align: "right"
            });
          });
          y += swayRows.length * rowGap + gapA * 0.7;
          this._text("\u7A33\u5B9A\u7387\u4E0E\u504F\u79BB\u89D2\u90FD\u662F\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u4E0D\u662F\u771F\u5B9E\u4F4D\u79FB\uFF1B\u6210\u7EE9\u4EC5\u7528\u4E8E\u8BAD\u7EC3\u5BF9\u6BD4\u3002", gx, y + 8, {
            size: 9.5,
            weight: "500",
            color: "rgba(21,45,34,0.4)"
          });
          const footBottom = y + 14;
          const by = py + ph - bh - 14;
          const ghostTop = by - (tight ? 40 : 44);
          const tips = [];
          const acc = sum.accuracy || 0;
          if (acc >= 0.85) {
            tips.push("\u5BF9\u51C6\u5F88\u51C6\uFF0C\u53EF\u4EE5\u52A0\u5FEB\u4E0B\u843D\u901F\u5EA6\u6216\u7F29\u5C0F\u7BEE\u53E3\u5BBD\u5EA6");
          } else if (acc < 0.55) {
            tips.push("\u5148\u653E\u5BBD\u7BEE\u53E3\u5BBD\u5EA6\u6216\u51CF\u6162\u4E0B\u843D\u901F\u5EA6\uFF0C\u8BA9\u60A3\u8005\u66F4\u5BB9\u6613\u5BF9\u51C6");
          } else {
            tips.push("\u5BF9\u51C6\u57FA\u672C\u5230\u4F4D\uFF0C\u6CE8\u610F\u6C34\u679C\u843D\u5230\u7BEE\u53E3\u524D\u4E0D\u8981\u63D0\u524D\u505C\u4E0B\u52A8\u4F5C");
          }
          if ((sum.misses || 0) >= 8) {
            tips.push('\u6F0F\u63A5\u504F\u591A\uFF0C\u53EF\u4EE5\u5148\u53EA\u7EC3"\u770B\u5230\u843D\u70B9\u518D\u79FB\u52A8"\uFF0C\u4E0D\u5FC5\u8FFD\u6C42\u8FDE\u51FB');
          } else if (acc >= 0.8) {
            tips.push("\u547D\u4E2D\u5F88\u7A33\uFF0C\u53EF\u4EE5\u9002\u5F53\u63D0\u9AD8\u4E00\u6863\u96BE\u5EA6");
          }
          const tipH = 40 + Math.min(2, tips.length) * 16;
          const tipTop = ghostTop - 14 - tipH;
          if (tipTop > footBottom + 18) {
            rr(ctx, gx - 4, tipTop, gw + 8, tipH, 12);
            ctx.fillStyle = "rgba(15,156,140,0.055)";
            ctx.fill();
            this._text("\u8BAD\u7EC3\u5EFA\u8BAE", gx + 8, tipTop + 19, { size: 10, weight: "700", color: C.tealDeep });
            tips.slice(0, 2).forEach((t, i) => {
              this._text(t, gx + 8, tipTop + 36 + i * 16, { size: 9.5, weight: "500", color: C.inkSoft });
            });
          }
          this._button("again", gx, by, gw, bh, "\u518D\u6765\u4E00\u5C40", { variant: "primary", icon: "refresh", size: 14 });
          const halfW = (gw - 9) / 2;
          this._button("records", gx, ghostTop, halfW, tight ? 34 : 36, "\u8BAD\u7EC3\u8BB0\u5F55", {
            variant: "ghost",
            icon: "list",
            size: 10.5
          });
          this._button("home", gx + halfW + 9, ghostTop, halfW, tight ? 34 : 36, "\u8FD4\u56DE\u9996\u9875", {
            variant: "ghost",
            icon: "home",
            size: 10.5
          });
        }
        _gradeRing(x, y, r, grade) {
          const ctx = this.ctx;
          const color = grade === "S" ? "#E39A32" : grade === "A" ? "#0F9C8C" : grade === "B" ? "#5B93B8" : "#8B9A8F";
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = color;
          ctx.stroke();
          this._text(grade, x, y + r * 0.34, {
            size: r * 0.95,
            weight: "800",
            color,
            align: "center"
          });
          this._text("\u8BC4\u7EA7", x, y + r + 11, { size: 9, weight: "600", color: C.inkMute, align: "center" });
          ctx.restore();
        }
        // ================================================================ 基础控件
        _text(str, x, y, o) {
          const opt = o || {};
          const ctx = this.ctx;
          ctx.save();
          ctx.font = (opt.weight || "400") + " " + (opt.size || 12) + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
          ctx.textAlign = opt.align || "left";
          ctx.textBaseline = opt.baseline || "alphabetic";
          if (opt.alpha !== void 0) ctx.globalAlpha = opt.alpha;
          if (opt.shadow) {
            ctx.shadowColor = "rgba(8,26,16,0.4)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 1;
          }
          ctx.fillStyle = opt.color || C.ink;
          ctx.fillText(String(str), x, y);
          ctx.restore();
        }
        _measure(str, size, weight) {
          const ctx = this.ctx;
          ctx.save();
          ctx.font = (weight || "400") + " " + size + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
          const w = ctx.measureText(String(str)).width;
          ctx.restore();
          return w;
        }
        _glass(x, y, w, h, r) {
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(10,36,22,0.18)";
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 6;
          rr(ctx, x, y, w, h, r);
          ctx.fillStyle = C.card;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, r);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.stroke();
        }
        _panel(x, y, w, h, o) {
          const opt = o || {};
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(6,22,14,0.34)";
          ctx.shadowBlur = 28;
          ctx.shadowOffsetY = 10;
          rr(ctx, x, y, w, h, 22);
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, "rgba(255,255,255,0.99)");
          g.addColorStop(1, "rgba(246,251,247,0.99)");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, 22);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.92)";
          ctx.stroke();
          if (opt.accent) {
            ctx.beginPath();
            ctx.moveTo(x + 22, y + 1);
            ctx.lineTo(x + w - 22, y + 1);
            ctx.lineWidth = 3;
            ctx.strokeStyle = opt.accent;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        _button(id, x, y, w, h, label, o) {
          const opt = o || {};
          const ctx = this.ctx;
          const disabled = !!opt.disabled;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          const scale = pressed ? 0.97 : 1;
          const cxp = x + w / 2;
          const cyp = y + h / 2;
          ctx.save();
          ctx.translate(cxp, cyp);
          ctx.scale(scale, scale);
          ctx.translate(-cxp, -cyp);
          const r = Math.min(h / 2, 22);
          if (opt.variant === "primary") {
            ctx.save();
            ctx.shadowColor = disabled ? "rgba(12,38,20,0.05)" : "rgba(15,156,140,0.34)";
            ctx.shadowBlur = disabled ? 2 : 14;
            ctx.shadowOffsetY = disabled ? 1 : 5;
            rr(ctx, x, y, w, h, r);
            const g = ctx.createLinearGradient(0, y, 0, y + h);
            if (disabled) {
              g.addColorStop(0, "#CBD8D0");
              g.addColorStop(1, "#B9C8BE");
            } else {
              g.addColorStop(0, "#22B49F");
              g.addColorStop(1, "#0A8B7E");
            }
            ctx.fillStyle = g;
            ctx.fill();
            ctx.restore();
          } else if (opt.variant === "glass") {
            ctx.save();
            ctx.shadowColor = "rgba(10,36,22,0.12)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 3;
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = disabled ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.86)";
            ctx.fill();
            ctx.restore();
            rr(ctx, x, y, w, h, r);
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.stroke();
          } else if (opt.variant === "link") {
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = pressed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.4)";
            ctx.stroke();
          } else {
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = disabled ? "rgba(240,244,240,1)" : "rgba(255,255,255,0.96)";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(21,45,34,0.1)";
            ctx.stroke();
          }
          const fg = opt.variant === "primary" ? "#FFFFFF" : opt.variant === "link" ? "#FFFFFF" : C.ink;
          const size = opt.size || 14;
          const hasIcon = !!opt.icon;
          const textW = this._measure(label, size, "700");
          const iconW = hasIcon ? size + 7 : 0;
          const startX = cxp - (textW + iconW) / 2;
          if (hasIcon) this._icon(opt.icon, startX, cyp, size * 0.95, fg);
          this._text(label, startX + iconW, cyp + size * 0.36, { size, weight: "700", color: fg });
          ctx.restore();
          if (!disabled) this.buttons.push({ id, x, y, w, h });
        }
        _icon(name, x, y, size, color) {
          const ctx = this.ctx;
          const s = size / 24;
          ctx.save();
          ctx.translate(x, y - size / 2);
          ctx.scale(s, s);
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 2.1;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          if (name === "play") {
            ctx.moveTo(8, 5);
            ctx.lineTo(19, 12);
            ctx.lineTo(8, 19);
            ctx.closePath();
            ctx.fill();
          } else if (name === "pause") {
            ctx.moveTo(9, 5);
            ctx.lineTo(9, 19);
            ctx.moveTo(15, 5);
            ctx.lineTo(15, 19);
            ctx.stroke();
          } else if (name === "exit") {
            ctx.moveTo(14, 4);
            ctx.lineTo(6, 4);
            ctx.lineTo(6, 20);
            ctx.lineTo(14, 20);
            ctx.moveTo(13, 12);
            ctx.lineTo(21, 12);
            ctx.moveTo(18, 9);
            ctx.lineTo(21, 12);
            ctx.lineTo(18, 15);
            ctx.stroke();
          } else if (name === "gear") {
            ctx.arc(12, 12, 3.2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(12, 12, 7.2, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 8; i++) {
              const a = i / 8 * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(12 + Math.cos(a) * 7.2, 12 + Math.sin(a) * 7.2);
              ctx.lineTo(12 + Math.cos(a) * 9.4, 12 + Math.sin(a) * 9.4);
              ctx.stroke();
            }
          } else if (name === "list") {
            ctx.moveTo(8, 6);
            ctx.lineTo(20, 6);
            ctx.moveTo(8, 12);
            ctx.lineTo(20, 12);
            ctx.moveTo(8, 18);
            ctx.lineTo(20, 18);
            ctx.moveTo(4.5, 6);
            ctx.lineTo(4.6, 6);
            ctx.moveTo(4.5, 12);
            ctx.lineTo(4.6, 12);
            ctx.moveTo(4.5, 18);
            ctx.lineTo(4.6, 18);
            ctx.stroke();
          } else if (name === "refresh") {
            ctx.arc(12, 12, 7, 0.6, 5.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(17.4, 4.6);
            ctx.lineTo(18.4, 9.2);
            ctx.lineTo(13.8, 8.2);
            ctx.stroke();
          } else if (name === "home") {
            ctx.moveTo(4, 11);
            ctx.lineTo(12, 4.5);
            ctx.lineTo(20, 11);
            ctx.moveTo(6.5, 10);
            ctx.lineTo(6.5, 19.5);
            ctx.lineTo(17.5, 19.5);
            ctx.lineTo(17.5, 10);
            ctx.stroke();
          } else if (name === "bluetooth") {
            ctx.moveTo(12, 3);
            ctx.lineTo(12, 21);
            ctx.lineTo(17, 16.5);
            ctx.lineTo(7, 7.5);
            ctx.moveTo(12, 3);
            ctx.lineTo(17, 7.5);
            ctx.lineTo(7, 16.5);
            ctx.stroke();
          } else if (name === "check") {
            ctx.moveTo(5, 12.5);
            ctx.lineTo(10, 17.5);
            ctx.lineTo(19, 7);
            ctx.stroke();
          }
          ctx.restore();
        }
        // ---------------------------------------------------------------- 临时提示
        showHint(text, color) {
          this.hint = { text, color: color || C.ink, at: this.nowMs || Date.now() };
        }
        _drawTransient() {
          const h = this.hint;
          if (!h) return;
          const age = (this.nowMs || Date.now()) - h.at;
          if (age > 1800) {
            this.hint = null;
            return;
          }
          const alpha = age < 1400 ? 1 : 1 - (age - 1400) / 400;
          const ctx = this.ctx;
          const W = this.W;
          const w = this._measure(h.text, 12, "600") + 32;
          const y = this.L.hudBottom + 10;
          ctx.save();
          ctx.globalAlpha = clamp(alpha, 0, 1);
          rr(ctx, (W - w) / 2, y, w, 28, 14);
          ctx.fillStyle = "rgba(19,41,28,0.84)";
          ctx.fill();
          this._text(h.text, W / 2, y + 18, { size: 12, weight: "600", color: "#FFFFFF", align: "center" });
          ctx.restore();
        }
        _fmtSec(sec) {
          const s = Math.max(0, Math.round(sec || 0));
          const m = Math.floor(s / 60);
          return (m < 10 ? "0" + m : m) + ":" + (s % 60 < 10 ? "0" + s % 60 : s % 60);
        }
        // ---------------------------------------------------------------- 交互
        hitTest(x, y) {
          for (let i = this.buttons.length - 1; i >= 0; i--) {
            const b = this.buttons[i];
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
          }
          return null;
        }
        markPress(id) {
          this.pressId = id;
          this.pressAt = this.nowMs || Date.now();
          if (id === "sim:toggle") this.simOpen = !this.simOpen;
        }
      };
      module.exports = { FruitRenderer: FruitRenderer2, C };
    }
  });

  // tools/fruit-preview/wx-stub.js
  function installWx() {
    if (typeof window === "undefined") return;
    const read = (k) => {
      try {
        const raw = window.localStorage.getItem("wireprev:" + k);
        return raw === null ? "" : JSON.parse(raw);
      } catch (e) {
        return "";
      }
    };
    const write = (k, v) => {
      try {
        window.localStorage.setItem("wireprev:" + k, JSON.stringify(v));
      } catch (e) {
      }
    };
    window.wx = {
      getStorageSync: read,
      setStorageSync: write,
      getWindowInfo: () => ({
        pixelRatio: Math.min(window.devicePixelRatio || 2, 2),
        statusBarHeight: 24,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      }),
      getMenuButtonBoundingClientRect: () => ({ top: 30, bottom: 62, left: window.innerWidth - 110, width: 90 }),
      createOffscreenCanvas: ({ width, height }) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        return c;
      },
      vibrateShort: () => {
      },
      setInnerAudioOption: () => {
      },
      createInnerAudioContext: () => ({
        play() {
        },
        pause() {
        },
        stop() {
        },
        destroy() {
        },
        seek() {
        },
        set src(v) {
        },
        set volume(v) {
        },
        set loop(v) {
        }
      })
    };
    window.getApp = () => ({ globalData: {} });
  }

  // tools/fruit-preview/main.js
  installWx();
  var { getStore } = require_fruit_config();
  var { FruitEngine } = require_engine();
  var { FruitRenderer } = require_renderer();
  var params = new URLSearchParams(window.location.search);
  var CSS_W = Math.max(280, Number(params.get("w")) || 390);
  var CSS_H = Math.max(480, Number(params.get("h")) || 844);
  var FROZEN = /[?&]freeze=1/.test(window.location.search);
  var canvas = document.getElementById("stage");
  var dpr = Math.min(window.devicePixelRatio || 2, 2);
  var screenEl = document.querySelector(".screen");
  if (screenEl && /[?&]bare=1/.test(window.location.search)) {
    screenEl.style.width = CSS_W + "px";
    screenEl.style.height = CSS_H + "px";
  }
  canvas.width = Math.round(CSS_W * dpr);
  canvas.height = Math.round(CSS_H * dpr);
  canvas.style.width = CSS_W + "px";
  canvas.style.height = CSS_H + "px";
  var cfg = getStore();
  cfg.reset();
  var engine = new FruitEngine({ cfg });
  engine.setSimMode(true);
  var renderer = new FruitRenderer({
    canvas,
    ctx: canvas.getContext("2d"),
    engine,
    cfg
  });
  renderer.resize(CSS_W, CSS_H, dpr);
  function simulate(seconds, inputFn) {
    const dt = 1 / 60;
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      if (inputFn) inputFn((i + 1) * dt, i);
      engine.update(dt);
      engine.drainEvents();
    }
  }
  var breakHold = /[?&]break=1/.test(window.location.search);
  function autoInput() {
    if (breakHold) {
      engine.setSimTarget(0.95, 0);
      return;
    }
    const f = engine._lowestFruit();
    if (!f) {
      engine.setSimTarget(0, 0);
      return;
    }
    const travel = (engine.basketMaxX - engine.basketMinX) / 2;
    const nx = (f.x - 0.5) / Math.max(0.01, travel);
    engine.setSimTarget(Math.max(-1, Math.min(1, nx)), 0);
  }
  function simulateUntil(maxSec, cond) {
    const dt = 1 / 60;
    const steps = Math.round(maxSec / dt);
    for (let i = 0; i < steps; i++) {
      autoInput();
      engine.update(dt);
      engine.drainEvents();
      if (cond()) return true;
    }
    return false;
  }
  var scenario = (params.get("screen") || "").toLowerCase();
  var frozen = FROZEN;
  if (scenario === "prepare") {
    engine.prepare();
    engine.calibrate();
  } else if (scenario === "playing" || scenario === "play") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(3.4, autoInput);
      simulateUntil(14, () => engine.score.hits >= 4);
    }
  } else if (scenario === "combo") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(3.4, autoInput);
      simulateUntil(20, () => engine.score.combo >= 4);
    }
  } else if (scenario === "result") {
    cfg.patch({ durationSec: 40, spawnInterval: 1.1 }, "preview");
    engine.refreshGeometry();
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(3.4, autoInput);
      simulate(30, autoInput);
      engine.finish("timeout");
    }
    frozen = true;
  } else if (scenario === "break") {
    breakHold = true;
    engine.prepare();
    engine.startCountdown();
    simulate(3.4);
    simulate(5, autoInput);
  } else if (scenario === "pause") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(3.4, autoInput);
      simulate(8, autoInput);
      engine.pause();
    }
    frozen = true;
  } else if (scenario === "sensor") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(3.4, autoInput);
      simulate(7, autoInput);
      engine.enterSensorError();
    }
    frozen = true;
  }
  var last = 0;
  function loop(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1e3) : 1 / 60;
    last = ts;
    if (!frozen) {
      if (simX) engine.setSimTarget(Number(simX.value) || 0, 0);
      else if (engine.state === "PLAYING") autoInput();
      engine.update(dt);
      engine.drainEvents();
    }
    renderer.render(frozen ? 0 : dt, Date.now());
    updateStateText();
    window.requestAnimationFrame(loop);
  }
  var STATE_TEXT = {
    IDLE: "\u4ECB\u7ECD\u9875",
    READY: "\u8BBE\u5907\u51C6\u5907\u9875",
    CALIBRATING: "\u6807\u5B9A\u4E2D",
    COUNTDOWN: "\u5012\u8BA1\u65F6",
    PLAYING: "\u6E38\u620F\u8FDB\u884C\u4E2D",
    PAUSED: "\u5DF2\u6682\u505C",
    SENSOR_ERROR: "\u4FE1\u53F7\u4E2D\u65AD",
    RESULT: "\u7ED3\u7B97\u9875",
    ABORTED: "\u5DF2\u4E2D\u6B62"
  };
  function updateStateText() {
    const el = document.getElementById("state");
    if (!el) return;
    el.textContent = (frozen ? "\uFF08\u5DF2\u5B9A\u683C\uFF09" : "") + (STATE_TEXT[engine.state] || engine.state);
    const live = document.getElementById("live");
    if (live) {
      live.textContent = "\u5F97\u5206 " + engine.score.total + " \xB7 \u63A5\u4F4F " + engine.score.hits + " \xB7 \u6F0F\u63A5 " + engine.score.misses + " \xB7 \u8FDE\u51FB " + (engine.score.combo || 0) + " \xB7 \u6C34\u679C " + engine.fruits.length;
    }
  }
  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
  bind("btn-intro", () => {
    frozen = false;
    engine.toIntro();
  });
  bind("btn-prepare", () => {
    frozen = false;
    engine.prepare();
    engine.calibrate();
  });
  bind("btn-play", () => {
    frozen = false;
    engine.prepare();
    if (engine.state === "CALIBRATING") engine.cancelCalibration();
    const r = engine.startCountdown();
    if (r.ok) engine.countdown = 0.05;
  });
  bind("btn-combo", () => {
    frozen = false;
    if (engine.state !== "PLAYING") return;
    engine.debugSpawn(3, { atBasket: true });
  });
  bind("btn-pause", () => {
    frozen = false;
    engine.togglePause();
  });
  bind("btn-result", () => {
    frozen = false;
    if (engine.state === "PLAYING" || engine.state === "PAUSED") engine.finish("timeout");
  });
  bind("btn-freeze", () => {
    frozen = true;
  });
  var simX = document.getElementById("sim-x");
  function paintSlider() {
    const lx = document.getElementById("sim-x-val");
    if (lx && simX) lx.textContent = Number(simX.value).toFixed(2);
    if (simX) engine.setSimTarget(Number(simX.value), 0);
  }
  if (simX) {
    simX.addEventListener("input", paintSlider);
    paintSlider();
  }
  bind("btn-center", () => {
    if (simX) simX.value = "0";
    paintSlider();
  });
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CSS_W / rect.width);
    const y = (e.clientY - rect.top) * (CSS_H / rect.height);
    const id = renderer.hitTest(x, y);
    if (!id) return;
    renderer.markPress(id);
    handleAction(id);
  });
  function handleAction(id) {
    if (id === "start") {
      engine.prepare();
      return;
    }
    if (id === "back") {
      engine.toIntro();
      return;
    }
    if (id === "calibrate") {
      engine.calibrate();
      return;
    }
    if (id === "enter") {
      const r = engine.startCountdown();
      if (r.ok) engine.countdown = 0.05;
      return;
    }
    if (id === "pause") {
      engine.togglePause();
      return;
    }
    if (id === "resume") {
      engine.resume();
      return;
    }
    if (id === "again" || id === "restart") {
      const r = engine.startCountdown();
      if (r.ok) engine.countdown = 0.05;
      return;
    }
    if (id === "sim:left") {
      engine.nudgeSim(-0.35, 0);
      return;
    }
    if (id === "sim:right") {
      engine.nudgeSim(0.35, 0);
      return;
    }
    if (id === "sim:center") {
      engine.centerSim();
      return;
    }
    if (id === "sim:spawn") {
      engine.debugSpawn(3);
      return;
    }
    if (id === "sim:catch") {
      engine.debugAlignToBasket();
      return;
    }
    if (id === "sim:miss") {
      engine.debugAlignAway();
      return;
    }
    if (id === "sim:combo") {
      engine.debugSpawn(3, { atBasket: true });
      return;
    }
    if (id === "sim:lost") {
      engine.enterSensorError();
      return;
    }
    if (id === "quit" || id === "exit") {
      engine.finish("aborted");
      return;
    }
    renderer.showHint("\u9884\u89C8\u9875\u4E0D\u8DF3\u8F6C\uFF1A" + id, "#3E5849");
  }
  if (scenario !== "bg") window.requestAnimationFrame(loop);
  if (scenario === "bg") {
    frozen = true;
    const mainCtx = canvas.getContext("2d");
    mainCtx.save();
    mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mainCtx.clearRect(0, 0, CSS_W, CSS_H);
    renderer._paintSky(mainCtx);
    mainCtx.restore();
  }
})();
