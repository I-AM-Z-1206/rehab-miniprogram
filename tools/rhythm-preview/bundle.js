(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // utils/rhythm-songs.js
  var require_rhythm_songs = __commonJS({
    "utils/rhythm-songs.js"(exports, module) {
      var SONGS = [
        {
          songId: "slow_wave",
          name: "\u9759\u6C34\u6DF1\u6D41",
          sub: "\u6162\u901F \xB7 \u56DB\u5C0F\u8282\u5FAA\u73AF",
          file: "/pkgRhythm/audio/rhythm/slow_wave.m4a",
          bpm: 66,
          beatsPerBar: 4,
          loopBars: 4,
          offsetMs: 0,
          tag: "\u5EB7\u590D",
          credit: "tools/gen_rhythm_audio.py \u5408\u6210\uFF0C\u65E0\u7B2C\u4E09\u65B9\u7D20\u6750"
        },
        {
          songId: "dawn_walk",
          name: "\u6668\u5149\u6F2B\u6B65",
          sub: "\u4E2D\u901F \xB7 \u56DB\u5C0F\u8282\u5FAA\u73AF",
          file: "/pkgRhythm/audio/rhythm/dawn_walk.m4a",
          bpm: 90,
          beatsPerBar: 4,
          loopBars: 4,
          offsetMs: 0,
          tag: "\u5165\u95E8",
          credit: "tools/gen_rhythm_audio.py \u5408\u6210\uFF0C\u65E0\u7B2C\u4E09\u65B9\u7D20\u6750"
        },
        {
          songId: "heart_pulse",
          name: "\u5FC3\u8DF3\u5F8B\u52A8",
          sub: "\u4E2D\u5FEB \xB7 \u56DB\u5C0F\u8282\u5FAA\u73AF",
          file: "/pkgRhythm/audio/rhythm/heart_pulse.m4a",
          bpm: 110,
          beatsPerBar: 4,
          loopBars: 4,
          offsetMs: 0,
          tag: "\u8FDB\u9636",
          credit: "tools/gen_rhythm_audio.py \u5408\u6210\uFF0C\u65E0\u7B2C\u4E09\u65B9\u7D20\u6750"
        }
      ];
      var DEFAULT_SONG_ID = SONGS[0].songId;
      function songById2(id) {
        return SONGS.find((s) => s.songId === id) || SONGS[0];
      }
      function beatMs(song) {
        const s = typeof song === "string" ? songById2(song) : song;
        return 6e4 / Math.max(30, Math.min(240, Number(s.bpm) || 100));
      }
      function loopMs(song) {
        const s = typeof song === "string" ? songById2(song) : song;
        const beats = (Number(s.beatsPerBar) || 4) * (Number(s.loopBars) || 4);
        return beats * beatMs(s);
      }
      function barMs(song) {
        const s = typeof song === "string" ? songById2(song) : song;
        return (Number(s.beatsPerBar) || 4) * beatMs(s);
      }
      module.exports = { SONGS, DEFAULT_SONG_ID, songById: songById2, beatMs, loopMs, barMs };
    }
  });

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

  // utils/rhythm-config.js
  var require_rhythm_config = __commonJS({
    "utils/rhythm-config.js"(exports, module) {
      var { SONGS, DEFAULT_SONG_ID } = require_rhythm_songs();
      var STORAGE_KEY = "rhythm_cfg_v1";
      var SONG_IDS = SONGS.map((s) => s.songId);
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
          tip: "\u7B2C 1 \u6863\u97F3\u7B26\u5C11\u3001\u7A97\u53E3\u5BBD\uFF1B\u7B2C 5 \u6863\u5BC6\u5EA6\u9AD8\u3001\u7A97\u53E3\u7A84"
        },
        // ---------------- 音乐 ----------------
        songId: {
          group: "\u97F3\u4E50",
          label: "\u66F2\u76EE",
          type: "enum",
          def: DEFAULT_SONG_ID,
          options: SONG_IDS,
          labels: SONGS.reduce((m, s) => {
            m[s.songId] = s.name + " \xB7 " + s.bpm + " BPM";
            return m;
          }, {}),
          tip: "BPM \u4E0E\u5FAA\u73AF\u957F\u5EA6\u6765\u81EA\u66F2\u76EE\u914D\u7F6E\uFF0C\u8C31\u9762\u6309 BPM \u7CBE\u786E\u751F\u6210"
        },
        musicVolume: {
          group: "\u97F3\u4E50",
          label: "\u97F3\u91CF",
          type: "num",
          unit: "",
          min: 0,
          max: 1,
          step: 0.05,
          def: 0.7,
          tip: "\u53EA\u63A7\u5236\u97F3\u4E50\uFF0C\u4E0D\u5F71\u54CD\u97F3\u6548"
        },
        syncOffsetMs: {
          group: "\u97F3\u4E50",
          label: "\u97F3\u753B\u5EF6\u8FDF\u8865\u507F",
          type: "num",
          unit: "ms",
          min: -200,
          max: 200,
          step: 5,
          def: 0,
          tip: '\u771F\u673A\u4E0A"\u542C\u5230"\u6BD4"\u770B\u5230"\u665A\u65F6\u8C03\u5927\uFF1B\u8BF7\u914D\u5408\u300C\u8BD5\u542C 8 \u62CD\u300D\u6821\u51C6'
        },
        beatPulseOn: { group: "\u97F3\u4E50", label: "\u8282\u62CD\u8109\u51B2\u63D0\u793A", type: "bool", def: true, tip: "\u5224\u5B9A\u533A\u968F\u8282\u62CD\u67D4\u548C\u547C\u5438\uFF0C\u5E2E\u52A9\u611F\u77E5\u65F6\u673A" },
        beatClickOn: { group: "\u97F3\u4E50", label: "\u8282\u62CD\u70B9\u51FB\u97F3", type: "bool", def: true, tip: "\u8BAD\u7EC3\u4E2D\u64AD\u653E\u8F7B\u5FAE\u8282\u62CD\u70B9\u51FB\uFF0C\u53EF\u5173\u95ED" },
        // ---------------- 训练目标 ----------------
        durationSec: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u8BAD\u7EC3\u65F6\u957F",
          type: "num",
          unit: "\u79D2",
          min: 30,
          max: 300,
          step: 5,
          def: 90,
          tip: "\u771F\u5B9E\u7ECF\u5386\u7684\u97F3\u4E50\u65F6\u95F4\uFF0C\u4E0D\u542B\u6682\u505C\u4E0E\u4E2D\u65AD"
        },
        prepBeats: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u9884\u5907\u62CD",
          type: "num",
          unit: "\u62CD",
          min: 2,
          max: 8,
          step: 1,
          def: 2,
          tip: "\u5F00\u59CB\u524D\u5148\u6570\u51E0\u62CD\uFF1B\u8D8A\u5927\u5F00\u5C40\u7A7A\u7B49\u8D8A\u4E45"
        },
        // ---------------- 体感输入 ----------------
        axisX: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u5DE6\u53F3\u8F74",
          type: "enum",
          def: "pitch",
          options: ["pitch", "roll"],
          tip: "\u5B9E\u6D4B\u672C\u9879\u76EE\u4F69\u6234\u65B9\u5F0F\u4E0B\u5DE6\u53F3\u79FB\u52A8\u8BFB pitch\uFF1B\u6362\u4F69\u6234\u65B9\u5411\u65F6\u6539\u8FD9\u91CC"
        },
        axisY: { group: "\u4F53\u611F\u8F93\u5165", label: "\u524D\u540E\u8F74\uFF08\u672C\u6E38\u620F\u672A\u4F7F\u7528\uFF09", type: "enum", def: "roll", options: ["roll", "pitch"] },
        invertX: { group: "\u4F53\u611F\u8F93\u5165", label: "\u5DE6\u53F3\u53CD\u5411", type: "bool", def: true, tip: "\u8EAB\u4F53\u5411\u5DE6\u5374\u5224\u5B9A\u5230\u53F3\u4FA7\u65F6\u5207\u6362" },
        invertY: { group: "\u4F53\u611F\u8F93\u5165", label: "\u524D\u540E\u53CD\u5411", type: "bool", def: false },
        sensitivity: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u63A7\u5236\u7075\u654F\u5EA6",
          type: "num",
          unit: "\u500D",
          min: 0.4,
          max: 2,
          step: 0.05,
          def: 1,
          tip: "\u8D8A\u5927\uFF0C\u540C\u6837\u7684\u8EAB\u4F53\u504F\u79FB\u8D8A\u5FEB\u8FBE\u5230\u5DE6\u53F3\u533A\u57DF"
        },
        deadzoneDeg: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u4E2D\u5FC3\u6B7B\u533A",
          type: "num",
          unit: "\xB0",
          min: 0,
          max: 8,
          step: 0.5,
          def: 1.5,
          tip: "\u5C0F\u4E8E\u8BE5\u89D2\u5EA6\u7684\u547C\u5438\u6296\u52A8\u4E0D\u4F1A\u5BFC\u81F4\u5DE6\u53F3\u72B6\u6001\u8DF3\u53D8"
        },
        smooth: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u8DDF\u624B\u5EA6",
          type: "num",
          unit: "",
          min: 0.2,
          max: 1,
          step: 0.02,
          def: 0.6,
          tip: "\u8D8A\u5927\u8D8A\u8DDF\u624B\u3001\u8D8A\u5C0F\u8D8A\u5E73\u987A"
        },
        leftLimit: { group: "\u4F53\u611F\u8F93\u5165", label: "\u5DE6\u4FA7\u8FB9\u754C", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 12 },
        rightLimit: { group: "\u4F53\u611F\u8F93\u5165", label: "\u53F3\u4FA7\u8FB9\u754C", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 12 },
        forwardLimit: { group: "\u4F53\u611F\u8F93\u5165", label: "\u524D\u4FA7\u8FB9\u754C\uFF08\u672A\u4F7F\u7528\uFF09", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 12 },
        backLimit: { group: "\u4F53\u611F\u8F93\u5165", label: "\u540E\u4FA7\u8FB9\u754C\uFF08\u672A\u4F7F\u7528\uFF09", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 12 },
        // ---------------- 左右判定 ----------------
        sideThreshold: {
          group: "\u5DE6\u53F3\u5224\u5B9A",
          label: "\u5DE6\u53F3\u533A\u57DF\u9608\u503C",
          type: "num",
          unit: "",
          min: 0.15,
          max: 0.8,
          step: 0.05,
          def: 0.35,
          tip: "|\u63A7\u5236\u91CF| \u8D85\u8FC7\u8BE5\u503C\u624D\u7B97\u771F\u6B63\u8FDB\u5165\u5DE6 / \u53F3\u533A\u57DF\uFF1B\u8D8A\u5927\u8D8A\u96BE\u89E6\u53D1"
        },
        stableMs: {
          group: "\u5DE6\u53F3\u5224\u5B9A",
          label: "\u7A33\u5B9A\u5224\u5B9A\u65F6\u95F4",
          type: "num",
          unit: "ms",
          min: 0,
          max: 400,
          step: 10,
          def: 120,
          tip: "\u8FDB\u5165\u67D0\u4E00\u4FA7\u540E\u9700\u8981\u4FDD\u6301\u591A\u4E45\u624D\u5141\u8BB8\u547D\u4E2D\uFF0C\u8FC7\u6EE4\u8DEF\u8FC7\u7684\u6296\u52A8"
        },
        sameSideGapMs: {
          group: "\u5DE6\u53F3\u5224\u5B9A",
          label: "\u540C\u5411\u91CD\u590D\u95F4\u9694",
          type: "num",
          unit: "ms",
          min: 120,
          max: 900,
          step: 20,
          def: 320,
          tip: '\u4FDD\u6301\u540C\u4E00\u4FA7\u65F6\uFF0C\u4E24\u6B21\u547D\u4E2D\u4E4B\u95F4\u81F3\u5C11\u95F4\u9694\u8FD9\u4E48\u4E45\uFF0C\u907F\u514D"\u4E00\u76F4\u7AD9\u7740\u5237\u5206"'
        },
        // ---------------- 节奏判定 ----------------
        perfectMs: { group: "\u8282\u594F\u5224\u5B9A", label: "PERFECT \u7A97\u53E3", type: "num", unit: "\xB1ms", min: 25, max: 120, step: 5, def: 60 },
        greatMs: { group: "\u8282\u594F\u5224\u5B9A", label: "GREAT \u7A97\u53E3", type: "num", unit: "\xB1ms", min: 45, max: 180, step: 5, def: 105 },
        goodMs: { group: "\u8282\u594F\u5224\u5B9A", label: "GOOD \u7A97\u53E3", type: "num", unit: "\xB1ms", min: 70, max: 260, step: 5, def: 160 },
        approachMs: {
          group: "\u8282\u594F\u5224\u5B9A",
          label: "\u97F3\u7B26\u98DE\u884C\u65F6\u95F4",
          type: "num",
          unit: "ms",
          min: 900,
          max: 4e3,
          step: 50,
          def: 2400,
          tip: "\u97F3\u7B26\u4ECE\u51FA\u73B0\u5230\u62B5\u8FBE\u5224\u5B9A\u7EBF\u7684\u65F6\u95F4\uFF0C\u8D8A\u957F\u8D8A\u5BB9\u6613\u9884\u5224"
        },
        noteStepBeats: {
          group: "\u8282\u594F\u5224\u5B9A",
          label: "\u97F3\u7B26\u95F4\u9694",
          type: "num",
          unit: "\u62CD",
          min: 0.5,
          max: 4,
          step: 0.25,
          def: 1,
          tip: "\u6BCF\u51E0\u62CD\u6765\u4E00\u4E2A\u97F3\u7B26\uFF1B1 \u62CD = \u8DDF\u7740\u97F3\u4E50\u6BCF\u62CD\u4E00\u4E2A\uFF0C\u8D8A\u5927\u7EA6\u6162"
        },
        centerRate: {
          group: "\u8282\u594F\u5224\u5B9A",
          label: "\u4E2D\u95F4\u97F3\u7B26\u6BD4\u4F8B",
          type: "num",
          unit: "",
          min: 0,
          max: 0.6,
          step: 0.05,
          def: 0.3,
          tip: "0 = \u53EA\u51FA\u5DE6\u53F3\u97F3\u7B26\uFF1B\u8C03\u9AD8\u540E\u8981\u6C42\u300C\u56DE\u5230\u4E2D\u7ACB\u4F4D\u300D\u7684\u4E2D\u95F4\u97F3\u7B26\u8D8A\u591A"
        },
        restRate: {
          group: "\u8282\u594F\u5224\u5B9A",
          label: "\u547C\u5438\u62CD\u95F4\u9694",
          type: "num",
          unit: "",
          min: 0,
          max: 0.5,
          step: 0.01,
          def: 0.13,
          tip: "\u6BCF N \u4E2A\u97F3\u7B26\u7A7A\u4E00\u62CD\uFF08\u56FA\u5B9A\u4F4D\u7F6E\uFF0C\u4E0D\u4F1A\u8FDE\u7740\u7A7A\uFF09\uFF1B0 = \u4E0D\u7559\u7A7A\u30020.13\u2248\u6BCF 8 \u4E2A\u7A7A\u4E00\u62CD"
        },
        sameSideRate: {
          group: "\u8282\u594F\u5224\u5B9A",
          label: "\u540C\u5411\u8FDE\u51FB\u6BD4\u4F8B",
          type: "num",
          unit: "",
          min: 0,
          max: 0.5,
          step: 0.05,
          def: 0.12,
          tip: "\u8FDE\u7EED\u4E24\u4E2A\u540C\u65B9\u5411\u97F3\u7B26\u7684\u6982\u7387\uFF0C\u8BAD\u7EC3\u4FDD\u6301\u80FD\u529B"
        },
        chartSeed: {
          group: "\u8282\u594F\u5224\u5B9A",
          label: "\u8C31\u9762\u79CD\u5B50",
          type: "num",
          unit: "",
          min: 1,
          max: 9999,
          step: 1,
          def: 7,
          tip: "\u540C\u66F2\u540C\u96BE\u5EA6\u540C\u79CD\u5B50 \u2192 \u5B8C\u5168\u76F8\u540C\u7684\u97F3\u7B26\u65F6\u95F4\u8868\uFF0C\u4FBF\u4E8E\u524D\u540E\u5BF9\u6BD4"
        },
        // ---------------- 计分 ----------------
        scorePerfect: { group: "\u8BA1\u5206", label: "PERFECT \u5206\u503C", type: "num", unit: "\u5206", min: 50, max: 200, step: 10, def: 100 },
        scoreGreat: { group: "\u8BA1\u5206", label: "GREAT \u5206\u503C", type: "num", unit: "\u5206", min: 20, max: 150, step: 10, def: 70 },
        scoreGood: { group: "\u8BA1\u5206", label: "GOOD \u5206\u503C", type: "num", unit: "\u5206", min: 10, max: 100, step: 5, def: 40 },
        comboStep: { group: "\u8BA1\u5206", label: "\u8FDE\u51FB\u52A0\u6210\u6B65\u957F", type: "num", unit: "", min: 0, max: 0.2, step: 0.01, def: 0.04 },
        comboMaxMul: { group: "\u8BA1\u5206", label: "\u8FDE\u51FB\u500D\u7387\u4E0A\u9650", type: "num", unit: "\u500D", min: 1, max: 3, step: 0.1, def: 1.5 },
        comboBreakOnMiss: { group: "\u8BA1\u5206", label: "\u6F0F\u63A5\u4E2D\u65AD\u8FDE\u51FB", type: "bool", def: true },
        finishBonus: { group: "\u8BA1\u5206", label: "\u5B8C\u6210\u5956\u52B1", type: "num", unit: "\u5206", min: 0, max: 500, step: 10, def: 100 },
        // ---------------- 反馈 ----------------
        sfxOn: { group: "\u53CD\u9988", label: "\u97F3\u6548", type: "bool", def: true },
        voiceOn: { group: "\u53CD\u9988", label: "\u8BED\u97F3\u64AD\u62A5", type: "bool", def: true, tip: "\u53EA\u5728\u9636\u6BB5\u5207\u6362\u65F6\u64AD\u62A5\uFF0C\u4E0D\u4F1A\u6BCF\u4E2A\u97F3\u7B26\u90FD\u5FF5" },
        vibrateOn: { group: "\u53CD\u9988", label: "\u632F\u52A8\u53CD\u9988", type: "bool", def: true },
        guideOn: { group: "\u53CD\u9988", label: "\u5F15\u5BFC\u63D0\u793A", type: "bool", def: true, tip: "\u957F\u65F6\u95F4\u6CA1\u52A8\u4F5C\u6216\u5DE6\u53F3\u660E\u663E\u5931\u8861\u65F6\u7ED9\u4E00\u53E5\u63D0\u793A" }
      };
      var GROUPS = ["\u96BE\u5EA6", "\u97F3\u4E50", "\u8BAD\u7EC3\u76EE\u6807", "\u4F53\u611F\u8F93\u5165", "\u5DE6\u53F3\u5224\u5B9A", "\u8282\u594F\u5224\u5B9A", "\u8BA1\u5206", "\u53CD\u9988"];
      var PRESETS = {
        1: {
          label: "\u5165\u95E8",
          noteStepBeats: 2,
          restRate: 0.28,
          sameSideRate: 0.05,
          perfectMs: 90,
          greatMs: 150,
          goodMs: 220,
          approachMs: 3e3,
          stableMs: 80,
          sameSideGapMs: 260,
          durationSec: 60,
          prepBeats: 2
        },
        2: {
          label: "\u8F7B\u91CF",
          noteStepBeats: 1.5,
          restRate: 0.2,
          sameSideRate: 0.08,
          perfectMs: 80,
          greatMs: 130,
          goodMs: 195,
          approachMs: 2800,
          stableMs: 100,
          sameSideGapMs: 280,
          durationSec: 75,
          prepBeats: 2
        },
        3: {
          label: "\u6807\u51C6",
          noteStepBeats: 1,
          restRate: 0.12,
          sameSideRate: 0.12,
          perfectMs: 70,
          greatMs: 115,
          goodMs: 170,
          approachMs: 2600,
          stableMs: 120,
          sameSideGapMs: 320,
          durationSec: 90,
          prepBeats: 2
        },
        4: {
          label: "\u8FDB\u9636",
          noteStepBeats: 0.75,
          restRate: 0.08,
          sameSideRate: 0.16,
          perfectMs: 60,
          greatMs: 105,
          goodMs: 155,
          approachMs: 2400,
          stableMs: 140,
          sameSideGapMs: 340,
          durationSec: 105,
          prepBeats: 2
        },
        5: {
          label: "\u6311\u6218",
          noteStepBeats: 0.5,
          restRate: 0.06,
          sameSideRate: 0.2,
          perfectMs: 52,
          greatMs: 92,
          goodMs: 140,
          approachMs: 2200,
          stableMs: 160,
          sameSideGapMs: 360,
          durationSec: 120,
          prepBeats: 2
        }
      };
      function validate(state) {
        const errors = [];
        const warnings = [];
        const s = state;
        if (!SONG_IDS.includes(s.songId)) errors.push("\u66F2\u76EE\u4E0D\u5B58\u5728\uFF1A" + s.songId);
        if (!(s.perfectMs < s.greatMs && s.greatMs < s.goodMs)) {
          errors.push("\u5224\u5B9A\u7A97\u53E3\u5FC5\u987B\u6EE1\u8DB3 PERFECT < GREAT < GOOD");
        }
        if (s.sideThreshold > 0.7) warnings.push("\u5DE6\u53F3\u533A\u57DF\u9608\u503C\u504F\u5927\uFF0C\u60A3\u8005\u53EF\u80FD\u9700\u8981\u5F88\u5927\u5E45\u5EA6\u624D\u80FD\u89E6\u53D1");
        if (s.sameSideGapMs < s.stableMs) warnings.push("\u540C\u5411\u91CD\u590D\u95F4\u9694\u5C0F\u4E8E\u7A33\u5B9A\u5224\u5B9A\u65F6\u95F4\uFF0C\u8FDE\u7EED\u540C\u5411\u97F3\u7B26\u53EF\u80FD\u5224\u4E0D\u51FA\u6765");
        if (s.approachMs < 900) warnings.push("\u97F3\u7B26\u98DE\u884C\u65F6\u95F4\u8FC7\u77ED\uFF0C\u9884\u5224\u65F6\u95F4\u4E0D\u8DB3");
        if (s.noteStepBeats <= 0.5 && s.prepBeats < 3) warnings.push("\u9AD8\u5BC6\u5EA6\u8C31\u9762\u5EFA\u8BAE\u4FDD\u7559 3 \u62CD\u4EE5\u4E0A\u9884\u5907\u62CD");
        if (s.durationSec > 240) warnings.push("\u5355\u5C40\u8D85\u8FC7 4 \u5206\u949F\uFF0C\u5EFA\u8BAE\u4E2D\u9014\u4F11\u606F");
        if (s.musicVolume <= 0) warnings.push("\u97F3\u4E50\u97F3\u91CF\u4E3A 0\uFF0C\u8282\u594F\u5C06\u53EA\u80FD\u9760\u89C6\u89C9\u4E0E\u70B9\u51FB\u97F3\u5224\u65AD");
        return { ok: errors.length === 0, errors, warnings };
      }
      var { createConfigStore } = require_config_store();
      var { ConfigStore, getStore: getStore2, coerce, DEFAULT_CONFIG } = createConfigStore({
        key: STORAGE_KEY,
        schema: SCHEMA,
        presets: PRESETS,
        validate,
        defaultDifficulty: 3,
        logTag: "rhythm-config"
      });
      module.exports = {
        RhythmConfigStore: ConfigStore,
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
        /**
         * 是否已有可用的零点。
         * 零点存在 utils/zero.js 里，全 App 共用一份：零点标定页标过、或别的游戏标过，
         * 这里都应当算数。以前各游戏只认「本次进入游戏内做过的标定」，导致已经标好的
         * 用户每进一个游戏都被要求再标一次，重复劳动。
         */
        hasZero() {
          if (this.cal && this.cal.result === "ok") return true;
          try {
            return !!zero.get().set;
          } catch (e) {
            return false;
          }
        }
        /** 当前零点偏移量（度）。界面用它说明"沿用的是哪个零点" */
        zeroInfo() {
          try {
            const z = zero.get();
            return { roll: z.roll, pitch: z.pitch, set: !!z.set };
          } catch (e) {
            return { roll: 0, pitch: 0, set: false };
          }
        }
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

  // pkgRhythm/games/rhythm/chart.js
  var require_chart = __commonJS({
    "pkgRhythm/games/rhythm/chart.js"(exports, module) {
      var { songById: songById2, beatMs } = require_rhythm_songs();
      var MAX_NOTES = 2400;
      var SIDES = ["left", "center", "right"];
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function hashSeed(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
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
      function buildChart(opts) {
        const o = opts || {};
        const song = typeof o.song === "string" ? songById2(o.song) : o.song || songById2("dawn_walk");
        const beat = beatMs(song);
        const beatsPerBar = Number(song.beatsPerBar) || 4;
        const offsetMs = Number(song.offsetMs) || 0;
        const durationSec = clamp(Number(o.durationSec) || 90, 10, 600);
        const durationMs = durationSec * 1e3;
        const step = clamp(Number(o.noteStepBeats) || 1, 0.25, 4);
        const restRate = clamp(Number(o.restRate) || 0, 0, 0.6);
        const sameSideRate = clamp(Number(o.sameSideRate) || 0, 0, 0.6);
        const centerRate = clamp(Number(o.centerRate) || 0, 0, 0.6);
        const sameSideGapMs = clamp(Number(o.sameSideGapMs) || 320, 80, 2e3);
        const prepBeats = clamp(Number(o.prepBeats) || 4, 0, 16);
        const difficulty = clamp(Number(o.difficulty) || 3, 1, 5);
        const seed = Number(o.seed) || 7;
        const version = o.chartSeedVersion || "v1";
        const rng = mulberry32(hashSeed(song.songId + "|" + difficulty + "|" + seed + "|" + version));
        const restEvery = restRate > 0 ? Math.max(4, Math.round(1 / restRate)) : 0;
        const notes = [];
        let lastSide = "right";
        let lastTime = -99999;
        let seq = 0;
        let restBeats = 0;
        let slot = 0;
        for (let b = prepBeats; b * beat + offsetMs <= durationMs; b += step) {
          if (notes.length >= MAX_NOTES) break;
          const timeMs = Math.round(b * beat) + offsetMs;
          if (timeMs > durationMs) break;
          const early = b < prepBeats + 2 * step;
          if (!early) {
            slot += 1;
            if (restEvery && slot % restEvery === 0) {
              restBeats += 1;
              continue;
            }
          }
          let side = lastSide === "left" ? "right" : "left";
          if (centerRate > 0 && rng() < centerRate) side = "center";
          const same = rng() < sameSideRate;
          if (same && timeMs - lastTime >= sameSideGapMs) side = lastSide;
          if (side === lastSide && timeMs - lastTime < sameSideGapMs) {
            side = SIDES.find((s) => s !== lastSide) || "left";
          }
          const onBar = Math.abs(b % beatsPerBar) < 1e-6;
          seq += 1;
          notes.push({
            noteId: "n" + String(seq).padStart(4, "0"),
            targetSide: side,
            beatIndex: Math.round(b * 1e3) / 1e3,
            targetTimeMs: timeMs,
            noteType: onBar ? "accent" : "normal",
            scoreValue: onBar ? 120 : 100,
            judgeStatus: "pending"
          });
          lastSide = side;
          lastTime = timeMs;
        }
        return {
          notes,
          meta: {
            songId: song.songId,
            bpm: song.bpm,
            beatMs: Math.round(beat * 1e3) / 1e3,
            beatsPerBar,
            difficulty,
            seed,
            version,
            durationSec,
            durationMs,
            noteCount: notes.length,
            restBeats,
            leftCount: notes.filter((n) => n.targetSide === "left").length,
            centerCount: notes.filter((n) => n.targetSide === "center").length,
            rightCount: notes.filter((n) => n.targetSide === "right").length,
            generatedAt: ""
          }
        };
      }
      function parseChart(raw, song) {
        const errors = [];
        let list = null;
        let bpm = song ? song.bpm : null;
        let offsetMs = song ? song.offsetMs || 0 : 0;
        if (Array.isArray(raw)) {
          list = raw;
        } else if (raw && typeof raw === "object") {
          list = Array.isArray(raw.notes) ? raw.notes : null;
          if (typeof raw.bpm === "number") bpm = raw.bpm;
          if (typeof raw.offsetMs === "number") offsetMs = raw.offsetMs;
        }
        if (!list) {
          return { notes: [], errors: ["\u8C31\u9762\u683C\u5F0F\u4E0D\u6B63\u786E\uFF1A\u9700\u8981\u6570\u7EC4\u6216 { notes: [...] }"] };
        }
        const out = [];
        const seen = {};
        list.forEach((item, i) => {
          if (!item || typeof item !== "object") {
            errors.push("\u7B2C " + (i + 1) + " \u6761\u4E0D\u662F\u5BF9\u8C61");
            return;
          }
          const side = SIDES.indexOf(item.targetSide) >= 0 ? item.targetSide : null;
          if (!side) {
            errors.push("\u7B2C " + (i + 1) + " \u6761 targetSide \u5FC5\u987B\u662F left \u6216 right");
            return;
          }
          let t = Number(item.targetTimeMs);
          if (!isFinite(t) && bpm && isFinite(Number(item.beatIndex))) {
            t = Math.round(Number(item.beatIndex) * (6e4 / bpm)) + offsetMs;
          }
          if (!isFinite(t) || t < 0) {
            errors.push("\u7B2C " + (i + 1) + " \u6761\u7F3A\u5C11\u6709\u6548\u7684 targetTimeMs \u6216 beatIndex");
            return;
          }
          const id = String(item.noteId || "n" + String(i + 1).padStart(4, "0"));
          if (seen[id]) {
            errors.push("noteId \u91CD\u590D\uFF1A" + id);
            return;
          }
          seen[id] = true;
          out.push({
            noteId: id,
            targetSide: side,
            beatIndex: isFinite(Number(item.beatIndex)) ? Number(item.beatIndex) : null,
            targetTimeMs: Math.round(t),
            noteType: item.noteType === "accent" ? "accent" : "normal",
            scoreValue: isFinite(Number(item.scoreValue)) ? Number(item.scoreValue) : 100,
            judgeStatus: "pending"
          });
        });
        out.sort((a, b) => a.targetTimeMs - b.targetTimeMs);
        return { notes: out, errors };
      }
      function chartSummary(notes) {
        const n = notes || [];
        let left = 0;
        let center = 0;
        let right = 0;
        for (let i = 0; i < n.length; i++) {
          if (n[i].targetSide === "left") left += 1;
          else if (n[i].targetSide === "center") center += 1;
          else right += 1;
        }
        return { count: n.length, left, center, right };
      }
      module.exports = { buildChart, parseChart, chartSummary, hashSeed, mulberry32 };
    }
  });

  // pkgRhythm/games/rhythm/hit-judge.js
  var require_hit_judge = __commonJS({
    "pkgRhythm/games/rhythm/hit-judge.js"(exports, module) {
      var VERDICT = {
        PERFECT: "perfect",
        GREAT: "great",
        GOOD: "good",
        MISS: "miss"
      };
      var VERDICT_STYLE = {
        perfect: { en: "PERFECT", zh: "\u5B8C\u7F8E", mark: "\u2605", color: "#FFD479" },
        great: { en: "GREAT", zh: "\u5F88\u597D", mark: "\u25C6", color: "#7BE3FF" },
        good: { en: "GOOD", zh: "\u4E0D\u9519", mark: "\u25CF", color: "#B49BFF" },
        miss: { en: "MISS", zh: "\u6F0F\u63A5", mark: "\u2715", color: "#FF7C93" }
      };
      var ACC_WEIGHT = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      var HitJudge = class {
        /**
         * @param {object} cfg 配置 store（每帧读最新窗口，治疗师改完立即生效）
         */
        constructor(cfg2) {
          this.cfg = cfg2;
        }
        get windows() {
          const p = clamp(Number(this.cfg.get("perfectMs")) || 60, 10, 300);
          const g = Math.max(p + 5, Number(this.cfg.get("greatMs")) || 105);
          const d = Math.max(g + 5, Number(this.cfg.get("goodMs")) || 160);
          return { perfect: p, great: g, good: d };
        }
        /** 只按时间误差分级，不管方向 */
        classify(deltaMs) {
          const w = this.windows;
          const a = Math.abs(deltaMs);
          if (a <= w.perfect) return VERDICT.PERFECT;
          if (a <= w.great) return VERDICT.GREAT;
          if (a <= w.good) return VERDICT.GOOD;
          return null;
        }
        /** 时间窗口是否已经彻底关闭（该记漏接了） */
        isExpired(note, nowMs) {
          return nowMs - note.targetTimeMs > this.windows.good;
        }
        /** 是否已经进入可以判定的时间窗 */
        isInWindow(note, nowMs) {
          return Math.abs(nowMs - note.targetTimeMs) <= this.windows.good;
        }
        /**
         * 判定一个音符
         * ------------------------------------------------------------------
         * 为什么"到达判定线之后才判"：
         *   玩家的输入是持续的身体位置，不是按键事件。如果音符还在半路就判，
         *   玩家提前 300ms 站好也会被当成"准"，节奏训练就失去意义。
         *   因此规则是：音符到达判定线（targetTime）那一帧起才开始判，
         *   时间误差 = 玩家"进入该侧"的时刻 − 音符目标时刻：
         *     · 正好在拍上进入 → PERFECT
         *     · 早了（提前站好并保持）→ 按提前量给 GREAT / GOOD
         *     · 晚了（进窗口后才进入）→ 按延后量给 GREAT / GOOD
         *     · 窗口内一直站在错误一侧 → 方向错误 + MISS
         *     · 窗口关闭仍未就位 → MISS
         *
         * @param {object} note 谱面音符
         * @param {number} nowMs 判定时间（音乐时间，已扣掉音画补偿）
         * @param {object} input { side, enterAt, stableMs, actionOk }
         * @returns {{verdict:string, deltaMs:number, reason:string}}
         */
        evaluate(note, nowMs, input) {
          const w = this.windows;
          const sinceLine = nowMs - note.targetTimeMs;
          const stableNeed = Number(this.cfg.get("stableMs")) || 0;
          if (sinceLine < 0) return { verdict: "pending", deltaMs: sinceLine, reason: "before-line" };
          const expired = sinceLine > w.good;
          const sideOk = input.side === note.targetSide;
          if (!sideOk) {
            const stableWrong = input.side && input.side !== "center" && input.stableMs >= stableNeed;
            if (note.targetSide !== "center" && stableWrong) {
              return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: "wrong-side", wrongSide: true };
            }
            if (expired) {
              return {
                verdict: VERDICT.MISS,
                deltaMs: sinceLine,
                reason: stableWrong ? "wrong-side" : "no-input",
                wrongSide: stableWrong
              };
            }
            return { verdict: "pending", deltaMs: sinceLine, reason: "not-in-place" };
          }
          if (input.stableMs < stableNeed) {
            if (expired) return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: "unstable" };
            return { verdict: "pending", deltaMs: sinceLine, reason: "unstable" };
          }
          if (!input.actionOk) {
            if (expired) return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: "no-new-action" };
            return { verdict: "pending", deltaMs: sinceLine, reason: "no-new-action" };
          }
          const entered = typeof input.enterAt === "number" ? input.enterAt : note.targetTimeMs;
          if (sinceLine > w.good && entered > note.targetTimeMs) {
            return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: "too-late" };
          }
          const raw = entered - note.targetTimeMs;
          const deltaMs = clamp(raw, -w.good, w.good);
          const verdict = this.classify(deltaMs);
          if (!verdict) return { verdict: "pending", deltaMs: sinceLine, reason: "out" };
          return { verdict, deltaMs, reason: raw < 0 ? "early" : "hit" };
        }
      };
      module.exports = { HitJudge, VERDICT, VERDICT_STYLE, ACC_WEIGHT };
    }
  });

  // pkgRhythm/games/rhythm/score.js
  var require_score = __commonJS({
    "pkgRhythm/games/rhythm/score.js"(exports, module) {
      var { ACC_WEIGHT, VERDICT } = require_hit_judge();
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      var ScoreManager = class {
        constructor(cfg2) {
          this.cfg = cfg2;
          this.totalNotes = 0;
          this.reset(0);
        }
        reset(totalNotes) {
          this.totalNotes = Math.max(0, Math.round(Number(totalNotes) || 0));
          this.perfect = 0;
          this.great = 0;
          this.good = 0;
          this.miss = 0;
          this.wrongDir = 0;
          this.leftHits = 0;
          this.centerHits = 0;
          this.rightHits = 0;
          this.combo = 0;
          this.maxCombo = 0;
          this.base = 0;
          this.comboBonus = 0;
          this.finishBonus = 0;
          this.settled = false;
        }
        get comboMul() {
          const step = Number(this.cfg.get("comboStep")) || 0;
          const cap = Math.max(1, Number(this.cfg.get("comboMaxMul")) || 1);
          return Math.min(cap, 1 + Math.max(0, this.combo - 1) * step);
        }
        get hits() {
          return this.perfect + this.great + this.good;
        }
        get judged() {
          return this.hits + this.miss;
        }
        /** 节奏准确率：时间维度的加权正确率 */
        get rhythmAccuracy() {
          if (!this.judged) return null;
          const w = this.perfect * ACC_WEIGHT.perfect + this.great * ACC_WEIGHT.great + this.good * ACC_WEIGHT.good + this.miss * ACC_WEIGHT.miss;
          return w / this.judged;
        }
        /** 方向准确率：方向维度（分母含方向错误） */
        get directionAccuracy() {
          const denom = this.hits + this.wrongDir;
          if (!denom) return null;
          return this.hits / denom;
        }
        /** 综合命中率：命中数 / 谱面音符总数 */
        get overallHitRate() {
          if (!this.totalNotes) return null;
          return this.hits / this.totalNotes;
        }
        get total() {
          return Math.round(this.base + this.comboBonus + this.finishBonus);
        }
        /** 命中：返回本音符实际得分与连击信息 */
        hit(verdict, opts) {
          const o = opts || {};
          const value = Number(o.value) || 100;
          const side = o.side;
          this.combo += 1;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          const mul = this.comboMul;
          const gain = Math.round(value * mul);
          if (verdict === VERDICT.PERFECT) this.perfect += 1;
          else if (verdict === VERDICT.GREAT) this.great += 1;
          else this.good += 1;
          if (side === "left") this.leftHits += 1;
          else if (side === "center") this.centerHits += 1;
          else if (side === "right") this.rightHits += 1;
          this.base += value;
          this.comboBonus += gain - value;
          return { gain, combo: this.combo, mul, total: this.total };
        }
        /** 漏接 / 方向错误：不获得命中分（方法名避开同名计数器） */
        missNote(reason) {
          this.miss += 1;
          if (reason === "wrong-side") this.wrongDir += 1;
          if (this.cfg.get("comboBreakOnMiss")) this.combo = 0;
          return { combo: this.combo };
        }
        addFinish() {
          if (this.settled) return this.finishBonus;
          this.settled = true;
          this.finishBonus = Math.max(0, Number(this.cfg.get("finishBonus")) || 0);
          return this.finishBonus;
        }
        snapshot() {
          return {
            score: this.total,
            base: Math.round(this.base),
            comboBonus: Math.round(this.comboBonus),
            finishBonus: Math.round(this.finishBonus),
            perfect: this.perfect,
            great: this.great,
            good: this.good,
            miss: this.miss,
            hits: this.hits,
            judged: this.judged,
            wrongDir: this.wrongDir,
            combo: this.combo,
            maxCombo: this.maxCombo,
            leftHits: this.leftHits,
            centerHits: this.centerHits,
            rightHits: this.rightHits,
            totalNotes: this.totalNotes,
            rhythmAccuracy: this.rhythmAccuracy,
            directionAccuracy: this.directionAccuracy,
            overallHitRate: this.overallHitRate
          };
        }
      };
      module.exports = { ScoreManager, clamp };
    }
  });

  // pkgRhythm/games/rhythm/engine.js
  var require_engine = __commonJS({
    "pkgRhythm/games/rhythm/engine.js"(exports, module) {
      var { MotionTracker } = require_motion();
      var { songById: songById2, beatMs } = require_rhythm_songs();
      var { buildChart } = require_chart();
      var { HitJudge, VERDICT } = require_hit_judge();
      var { ScoreManager } = require_score();
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
      var SENSOR_RESUME_MS = 600;
      var NOTE_TAIL_MS = 700;
      var END_TAIL_MS = 1400;
      var FEEDBACK_KEEP_MS = 900;
      var GUIDE_GAP_MS = 9e3;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function round(v, d) {
        const p = Math.pow(10, d || 0);
        return Math.round(v * p) / p;
      }
      function makeId() {
        return "rt" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      }
      var RhythmEngine2 = class {
        /**
         * @param {object} opts { cfg, clock, motion? }
         *   clock 必须实现 setSong / start / pause / resume / stop / nowMs
         */
        constructor(opts) {
          const o = opts || {};
          this.cfg = o.cfg;
          this.clock = o.clock;
          this.motion = o.motion || new MotionTracker(this.cfg);
          this.state = STATE.IDLE;
          this.events = [];
          this.simMode = false;
          this.song = songById2(this.cfg.get("songId"));
          this.chart = { notes: [], meta: null };
          this.notes = [];
          this.active = [];
          this.cursor = 0;
          this.score = new ScoreManager(this.cfg);
          this.judge = new HitJudge(this.cfg);
          this.musicMs = 0;
          this.elapsedSec = 0;
          this.countdownMs = 0;
          this.durationMs = 0;
          this.feedback = null;
          this.feedbacks = [];
          this.hitFlash = 0;
          this.missFlash = 0;
          this.beatFlash = 0;
          this.lastBeat = -1;
          this.guideAt = 0;
          this.lastJudgeAt = 0;
          this.recentSides = [];
          this.action = { seq: 0, side: "center", since: 0, consumedSeq: 0, lastHitAt: { left: -1e9, center: -1e9, right: -1e9 } };
          this.interrupted = false;
          this.interruptedMs = 0;
          this.interruptStart = 0;
          this.interruptCount = 0;
          this.sensorResumeAt = 0;
          this.startedAt = "";
          this.endedAt = "";
          this.recordId = "";
          this.summary = null;
          this.settled = false;
          this.lastFrameAt = 0;
          this.mode = "music";
          this.previewing = false;
          this.previewMs = 0;
          if (this.clock && this.clock.setSong) this.clock.setSong(this.song);
        }
        // ---------------------------------------------------------------- 基础
        get sim() {
          return this.simMode;
        }
        get isPlaying() {
          return this.state === STATE.PLAYING;
        }
        get beatMs() {
          return beatMs(this.song);
        }
        _emit(type, payload) {
          this.events.push(Object.assign({ type, at: Date.now() }, payload || {}));
        }
        drainEvents() {
          const out = this.events;
          this.events = [];
          return out;
        }
        setState(next) {
          if (this.state === next) return;
          const prev = this.state;
          this.state = next;
          this._emit("state", { state: next, prev });
        }
        setSimMode(on) {
          this.simMode = !!on;
          this.motion.setSimMode(this.simMode);
          if (!this.simMode) this.motion.centerSim();
        }
        setSimTarget(x) {
          this.motion.setSimTarget(clamp(Number(x) || 0, -1, 1), 0);
        }
        nudgeSim(dx) {
          this.motion.nudgeSim(dx || 0, 0);
        }
        centerSim() {
          this.motion.centerSim();
        }
        feedSensor(frame) {
          if (!frame) return;
          this.motion.feed(frame);
          if (this.state === STATE.SENSOR_ERROR) {
            if (!this.sensorResumeAt) this.sensorResumeAt = Date.now();
            else if (Date.now() - this.sensorResumeAt >= SENSOR_RESUME_MS) {
              this.resume();
              this._emit("sensor:resume");
            }
          }
        }
        /** 配置里的曲目被换掉时调用（介绍页/设置页返回后） */
        syncSong() {
          const next = songById2(this.cfg.get("songId"));
          if (next.songId === this.song.songId) return false;
          this.song = next;
          if (this.clock && this.clock.setSong) this.clock.setSong(next);
          return true;
        }
        // ---------------------------------------------------------------- 流程
        toIntro() {
          this.stopPreview();
          if (this.clock) this.clock.stop();
          this.settled = false;
          this.summary = null;
          this.notes = [];
          this.active = [];
          this.cursor = 0;
          this.score.reset(0);
          this.feedback = null;
          this.feedbacks = [];
          this.motion.reset();
          this.setState(STATE.IDLE);
        }
        prepare() {
          this.stopPreview();
          this.syncSong();
          this.settled = false;
          this.summary = null;
          this.notes = [];
          this.active = [];
          this.cursor = 0;
          this.score.reset(0);
          this.feedback = null;
          this.feedbacks = [];
          this.action = { seq: 0, side: "center", since: 0, consumedSeq: 0, lastHitAt: { left: -1e9, center: -1e9, right: -1e9 } };
          this.motion.reset();
          this.setState(STATE.READY);
        }
        calibrate() {
          if (this.simMode) {
            this.motion.cal.result = "ok";
            this.motion.cal.message = "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u65E0\u9700\u6807\u5B9A";
            this._emit("calibrate", { ok: true, result: "ok", simulated: true, message: "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u65E0\u9700\u6807\u5B9A" });
            return { ok: true, simulated: true };
          }
          if (!this.motion.isLive()) return { ok: false, message: "\u8BF7\u5148\u8FDE\u63A5\u4F20\u611F\u5668" };
          this.motion.beginCalibration();
          this.setState(STATE.CALIBRATING);
          return { ok: true };
        }
        cancelCalibration() {
          this.motion.cancelCalibration();
          if (this.state === STATE.CALIBRATING) this.setState(STATE.READY);
        }
        /**
         * 开始：先按配置生成谱面，再进入预备拍倒计时
         * @returns {{ok:boolean, errors?:string[], warnings?:string[]}}
         */
        startCountdown(opts) {
          const o = opts || {};
          this.stopPreview();
          this.syncSong();
          const v = this.cfg.validate();
          if (!v.ok) return { ok: false, errors: v.errors };
          const durationSec = clamp(Number(this.cfg.get("durationSec")) || 90, 20, 300);
          const chart = o.notes ? { notes: o.notes.slice(), meta: o.meta || null } : buildChart({
            song: this.song,
            durationSec,
            noteStepBeats: this.cfg.get("noteStepBeats"),
            restRate: this.cfg.get("restRate"),
            sameSideRate: this.cfg.get("sameSideRate"),
            centerRate: this.cfg.get("centerRate"),
            sameSideGapMs: this.cfg.get("sameSideGapMs"),
            prepBeats: this.cfg.get("prepBeats"),
            difficulty: this.cfg.get("difficulty"),
            seed: this.cfg.get("chartSeed"),
            chartSeedVersion: "v2"
          });
          if (!chart.notes.length) {
            return { ok: false, errors: ["\u8C31\u9762\u4E3A\u7A7A\uFF1A\u8BF7\u68C0\u67E5\u97F3\u7B26\u95F4\u9694 / \u8BAD\u7EC3\u65F6\u957F\u8BBE\u7F6E"] };
          }
          this.chart = chart;
          this.notes = chart.notes.map((n) => Object.assign({}, n, {
            judged: false,
            verdict: "",
            deltaMs: 0,
            judgedAt: 0,
            fade: 0
          }));
          this.active = [];
          this.cursor = 0;
          this.musicMs = 0;
          this.elapsedSec = 0;
          this.durationMs = Math.round(durationSec * 1e3);
          this.score.reset(this.notes.length);
          this.feedback = null;
          this.feedbacks = [];
          this.recentSides = [];
          this.lastJudgeAt = 0;
          this.guideAt = 0;
          this.hitFlash = 0;
          this.missFlash = 0;
          this.interrupted = false;
          this.interruptedMs = 0;
          this.interruptCount = 0;
          this.recordId = makeId();
          this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
          this.settled = false;
          this.summary = null;
          this.motion.resetTrajectory();
          this.action = { seq: 0, side: "center", since: 0, consumedSeq: 0, lastHitAt: { left: -1e9, center: -1e9, right: -1e9 } };
          const prep = clamp(Number(this.cfg.get("prepBeats")) || 4, 2, 8);
          this.countdownMs = prep * this.beatMs;
          this.setState(STATE.COUNTDOWN);
          this._emit("countdown", { beats: prep });
          return { ok: true, warnings: v.warnings, noteCount: this.notes.length };
        }
        beginPlay() {
          if (this.state !== STATE.COUNTDOWN) return false;
          if (this.clock) this.clock.start();
          this.mode = this.clock && this.clock.isSilent ? "silent" : "music";
          this.musicMs = 0;
          this.elapsedSec = 0;
          this.setState(STATE.PLAYING);
          this._emit("music", { mode: this.mode });
          return true;
        }
        pause() {
          if (this.state !== STATE.PLAYING) return false;
          if (this.clock) this.clock.pause();
          this.setState(STATE.PAUSED);
          return true;
        }
        resume() {
          if (this.state === STATE.PAUSED) {
            if (this.clock) this.clock.resume();
            this.setState(STATE.PLAYING);
            this._emit("resume");
            return true;
          }
          if (this.state === STATE.SENSOR_ERROR) {
            if (!this.motion.isLive() && !this.simMode) return false;
            const lostSec = this.interruptStart ? (Date.now() - this.interruptStart) / 1e3 : 0;
            this.interruptedMs += lostSec * 1e3;
            this.interruptStart = 0;
            this.sensorResumeAt = 0;
            if (this.clock) this.clock.resume();
            this.setState(STATE.PLAYING);
            this._emit("resume", { interruptedSec: round(lostSec, 1) });
            return true;
          }
          return false;
        }
        togglePause() {
          if (this.state === STATE.PLAYING) return this.pause();
          if (this.state === STATE.PAUSED) return this.resume();
          return false;
        }
        /** 断线 / 数据超时：冻结时间与判定，但不算失败 */
        enterSensorError(reason) {
          if (this.state !== STATE.PLAYING && this.state !== STATE.PAUSED) return false;
          if (this.state === STATE.PAUSED) {
            this.interruptedMs += 0;
          }
          if (this.clock) this.clock.pause();
          this.interruptStart = Date.now();
          this.interruptCount += 1;
          this.interrupted = true;
          this.state = STATE.SENSOR_ERROR;
          this._emit("state", { state: STATE.SENSOR_ERROR, prev: STATE.PLAYING });
          this._emit("sensor:lost", { reason: reason || "disconnected" });
          return true;
        }
        /** 结算：只能结算一次 */
        finish(reason) {
          if (this.settled) return this.summary;
          const musicNow = this.clock ? this.clock.nowMs() : this.musicMs;
          this.musicMs = musicNow;
          for (let i = 0; i < this.active.length; i++) {
            const n = this.active[i];
            if (n.judged) continue;
            n.judged = true;
            n.verdict = VERDICT.MISS;
            n.judgedAt = musicNow;
            this.score.missNote("aborted");
          }
          for (let i = 0; i < this.notes.length; i++) {
            if (!this.notes[i].judged) {
              this.notes[i].judged = true;
              this.notes[i].verdict = VERDICT.MISS;
              this.notes[i].judgedAt = musicNow;
              this.score.missNote("not-played");
            }
          }
          this.score.addFinish();
          const snap = this.score.snapshot();
          const traj = this.motion.getTrajectory();
          const completed = reason === "timeout";
          this.endedAt = (/* @__PURE__ */ new Date()).toISOString();
          if (this.interruptStart) {
            this.interruptedMs += Date.now() - this.interruptStart;
            this.interruptStart = 0;
          }
          this.summary = {
            recordId: this.recordId,
            gameId: "rhythm",
            songId: this.song.songId,
            songName: this.song.name,
            bpm: this.song.bpm,
            difficulty: Number(this.cfg.get("difficulty")) || 3,
            difficultyLabel: this.cfg.difficultyLabel ? this.cfg.difficultyLabel(this.cfg.get("difficulty")) : "",
            chartSeed: Number(this.cfg.get("chartSeed")) || 7,
            noteCount: snap.totalNotes,
            score: snap.score,
            breakdown: { base: snap.base, comboBonus: snap.comboBonus, finishBonus: snap.finishBonus },
            perfect: snap.perfect,
            great: snap.great,
            good: snap.good,
            miss: snap.miss,
            hits: snap.hits,
            wrongDirectionCount: snap.wrongDir,
            comboMax: snap.maxCombo,
            leftHitCount: snap.leftHits,
            centerHitCount: snap.centerHits,
            rightHitCount: snap.rightHits,
            rhythmAccuracy: snap.rhythmAccuracy,
            directionAccuracy: snap.directionAccuracy,
            overallHitRate: snap.overallHitRate,
            durationSec: round(this.musicMs / 1e3, 1),
            plannedSec: round(this.durationMs / 1e3, 1),
            syncOffsetMs: Number(this.cfg.get("syncOffsetMs")) || 0,
            controlConfig: {
              leftLimit: this.cfg.get("leftLimit"),
              rightLimit: this.cfg.get("rightLimit"),
              sideThreshold: this.cfg.get("sideThreshold"),
              stableMs: this.cfg.get("stableMs"),
              sameSideGapMs: this.cfg.get("sameSideGapMs")
            },
            pathLength: traj.pathLength,
            avgRate: traj.avgRate,
            peak: traj.peak,
            trajectorySummary: traj,
            dataSource: this.simMode ? "simulation" : "real",
            completed,
            reason: reason || "",
            interrupted: this.interrupted,
            interruptedSec: round(this.interruptedMs / 1e3, 1),
            interruptedCount: this.interruptCount,
            sensorInterrupted: this.interrupted,
            audioMode: this.mode,
            startedAt: this.startedAt,
            endedAt: this.endedAt,
            grade: this._grade(snap)
          };
          this.settled = true;
          if (this.clock) this.clock.stop();
          this.setState(completed ? STATE.RESULT : STATE.ABORTED);
          this._emit("finish", { summary: this.summary });
          return this.summary;
        }
        _grade(snap) {
          const acc = snap.rhythmAccuracy;
          if (acc === null || !snap.judged) return "-";
          if (acc >= 0.92 && snap.miss === 0) return "S";
          if (acc >= 0.82) return "A";
          if (acc >= 0.68) return "B";
          if (acc >= 0.5) return "C";
          return "D";
        }
        // ---------------------------------------------------------------- 主循环
        update(dt) {
          const step = clamp(Number(dt) || 1 / 60, 1e-3, 0.1);
          this.motion.update(step);
          if (this.previewing) {
            this.previewMs = this.clock ? this.clock.nowMs() : this.previewMs + step * 1e3;
            if (this.previewMs >= 8 * this.beatMs) this.stopPreview();
            return;
          }
          if (this.state === STATE.CALIBRATING) {
            if (this.motion.cal.active) return;
            const result = this.motion.cal.result;
            this._emit("calibrate", {
              ok: result === "ok",
              result,
              message: this.motion.cal.message,
              simulated: false
            });
            this.setState(STATE.READY);
            return;
          }
          if (this.state === STATE.COUNTDOWN) {
            this.countdownMs -= step * 1e3;
            if (this.countdownMs <= 0) {
              this.countdownMs = 0;
              this.beginPlay();
            }
            return;
          }
          if (this.state !== STATE.PLAYING) return;
          if (!this.simMode && !this.motion.isLive()) {
            this.enterSensorError("timeout");
            return;
          }
          this._tickPlaying(step);
        }
        _tickPlaying(step) {
          const now = this.clock.nowMs();
          this.musicMs = now;
          this.elapsedSec = now / 1e3;
          this.motion.tickTrajectory(step);
          const judgeNow = now - (Number(this.cfg.get("syncOffsetMs")) || 0);
          this._updateActions(now);
          this._spawn(now);
          this._judge(judgeNow, now);
          this._cleanup(now);
          if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - step * 3.2);
          if (this.missFlash > 0) this.missFlash = Math.max(0, this.missFlash - step * 2.2);
          const bIdx = Math.floor(now / this.beatMs);
          if (bIdx !== this.lastBeat) {
            this.lastBeat = bIdx;
            this.beatFlash = 1;
            this._emit("beat", { index: bIdx });
          }
          if (this.beatFlash > 0) this.beatFlash = Math.max(0, this.beatFlash - step * 2.6);
          if (this.cfg.get("guideOn") && now - this.lastJudgeAt > GUIDE_GAP_MS && now - this.guideAt > GUIDE_GAP_MS && now > 6e3) {
            this.guideAt = now;
            const side = this.motion.dir === "center" ? "center" : this.motion.dir;
            this._emit("guide", {
              kind: side === "center" ? "no-move" : "side-hint",
              side,
              text: side === "center" ? "\u8EAB\u4F53\u597D\u50CF\u6CA1\u52A8\uFF1A\u8BD5\u7740\u5411\u9700\u8981\u7684\u65B9\u5411\u504F\u79FB\u4E00\u70B9" : "\u4FDD\u6301\u4F4F\uFF0C\u8DDF\u7740\u8282\u62CD\u6162\u6162\u79FB\u52A8"
            });
          } else if (this.recentSides.length >= 8) {
            const left = this.recentSides.filter((s) => s === "left").length;
            if ((left >= 7 || left <= 1) && now - this.guideAt > GUIDE_GAP_MS) {
              this.guideAt = now;
              this._emit("guide", {
                kind: "balance",
                side: left >= 7 ? "left" : "right",
                text: left >= 7 ? "\u4E00\u76F4\u5728\u5DE6\u4FA7\uFF0C\u8BD5\u8BD5\u4E5F\u5411\u53F3\u4FA7\u79FB\u52A8" : "\u4E00\u76F4\u5728\u53F3\u4FA7\uFF0C\u8BD5\u8BD5\u4E5F\u5411\u5DE6\u4FA7\u79FB\u52A8"
              });
            }
          }
          if (now >= this.durationMs + END_TAIL_MS) {
            this.finish("timeout");
          }
        }
        _updateActions(now) {
          const side = this.motion.dir;
          const a = this.action;
          if (side !== a.side) {
            if (side !== "center") a.seq += 1;
            a.side = side;
            a.since = now;
          }
        }
        _actionOk(note, now) {
          const sameGap = Math.max(60, Number(this.cfg.get("sameSideGapMs")) || 320);
          if (this.action.seq > this.action.consumedSeq) return true;
          return now - (this.action.lastHitAt[note.targetSide] || -1e9) >= sameGap;
        }
        _spawn(now) {
          const approach = clamp(Number(this.cfg.get("approachMs")) || 2400, 900, 4e3);
          while (this.cursor < this.notes.length && this.notes[this.cursor].targetTimeMs - approach <= now) {
            this.active.push(this.notes[this.cursor]);
            this.cursor += 1;
          }
        }
        _judge(judgeNow, now) {
          const good = this.judge.windows.good;
          const offset = Number(this.cfg.get("syncOffsetMs")) || 0;
          for (let i = 0; i < this.active.length; i++) {
            const note = this.active[i];
            if (note.judged) continue;
            if (judgeNow < note.targetTimeMs) continue;
            if (judgeNow < note.targetTimeMs - good) continue;
            const res = this.judge.evaluate(note, judgeNow, {
              side: this.motion.dir,
              enterAt: this.action.since - offset,
              stableMs: now - this.action.since,
              actionOk: this._actionOk(note, now)
            });
            if (res.verdict === "pending") continue;
            this._settle(note, res, now);
          }
        }
        _settle(note, res, now) {
          note.judged = true;
          note.verdict = res.verdict;
          note.judgeStatus = res.verdict;
          note.deltaMs = Math.round(res.deltaMs);
          note.judgedAt = now;
          this.lastJudgeAt = now;
          if (res.verdict === VERDICT.MISS) {
            this.score.missNote(res.reason);
            this.missFlash = 1;
            this.feedback = {
              verdict: VERDICT.MISS,
              deltaMs: Math.round(res.deltaMs),
              side: note.targetSide,
              reason: res.reason,
              at: now
            };
            this._emit("miss", { reason: res.reason, side: note.targetSide, wrongSide: !!res.wrongSide });
            if (res.wrongSide) this._emit("wrong-side", { side: note.targetSide });
            return;
          }
          const gain = this.score.hit(res.verdict, {
            side: note.targetSide,
            value: note.scoreValue || 100
          });
          this.hitFlash = 1;
          this.action.consumedSeq = Math.max(this.action.seq, this.action.consumedSeq);
          this.action.lastHitAt[note.targetSide] = now;
          this.recentSides.push(note.targetSide);
          if (this.recentSides.length > 12) this.recentSides.shift();
          this.feedback = {
            verdict: res.verdict,
            deltaMs: Math.round(res.deltaMs),
            side: note.targetSide,
            gain: gain.gain,
            combo: gain.combo,
            at: now
          };
          this._emit("hit", {
            verdict: res.verdict,
            side: note.targetSide,
            deltaMs: Math.round(res.deltaMs),
            gain: gain.gain,
            combo: gain.combo
          });
          if (gain.combo > 0 && gain.combo % 10 === 0) {
            this._emit("combo", { value: gain.combo });
          }
        }
        _cleanup(now) {
          if (!this.active.length) return;
          const keep = [];
          for (let i = 0; i < this.active.length; i++) {
            const n = this.active[i];
            if (!n.judged) {
              keep.push(n);
              continue;
            }
            if (now - n.judgedAt <= NOTE_TAIL_MS) keep.push(n);
          }
          this.active = keep;
        }
        // ---------------------------------------------------------------- 视图数据
        /** 音符在渲染层的可见列表（含进度），渲染层不需要自己算时间 */
        visibleNotes(now) {
          const approach = clamp(Number(this.cfg.get("approachMs")) || 2400, 900, 4e3);
          const out = [];
          for (let i = 0; i < this.active.length; i++) {
            const n = this.active[i];
            const p = (now - (n.targetTimeMs - approach)) / approach;
            if (p < -0.05) continue;
            if (p > 1.6) continue;
            out.push({
              noteId: n.noteId,
              side: n.targetSide,
              type: n.noteType,
              progress: clamp(p, 0, 1.6),
              judged: n.judged,
              verdict: n.verdict,
              deltaMs: n.deltaMs,
              judgedAt: n.judgedAt
            });
          }
          return out;
        }
        getViewModel(nowArg) {
          const now = typeof nowArg === "number" ? nowArg : this.clock ? this.clock.nowMs() : this.musicMs;
          const snap = this.score.snapshot();
          const w = this.judge.windows;
          const recent = this.feedback && now - this.feedback.at < FEEDBACK_KEEP_MS ? this.feedback : null;
          return {
            state: this.state,
            song: {
              songId: this.song.songId,
              name: this.song.name,
              sub: this.song.sub,
              bpm: this.song.bpm,
              tag: this.song.tag
            },
            bpm: this.song.bpm,
            beatMs: this.beatMs,
            difficulty: Number(this.cfg.get("difficulty")) || 3,
            difficultyLabel: this.cfg.difficultyLabel ? this.cfg.difficultyLabel(this.cfg.get("difficulty")) : "",
            musicMs: now,
            elapsedSec: round(now / 1e3, 1),
            durationSec: round(this.durationMs / 1e3, 1),
            timeLeftSec: Math.max(0, round((this.durationMs - now) / 1e3, 1)),
            progress: this.durationMs > 0 ? clamp(now / this.durationMs, 0, 1) : 0,
            countdownSec: this.countdownMs / 1e3,
            countdownBeat: Math.ceil(this.countdownMs / this.beatMs),
            score: snap.score,
            perfect: snap.perfect,
            great: snap.great,
            good: snap.good,
            miss: snap.miss,
            hits: snap.hits,
            combo: snap.combo,
            maxCombo: snap.maxCombo,
            wrongDir: snap.wrongDir,
            leftHits: snap.leftHits,
            centerHits: snap.centerHits,
            rightHits: snap.rightHits,
            totalNotes: snap.totalNotes,
            rhythmAccuracy: snap.rhythmAccuracy,
            directionAccuracy: snap.directionAccuracy,
            overallHitRate: snap.overallHitRate,
            judgedCount: snap.judged,
            notes: this.visibleNotes(now),
            windows: w,
            feedback: recent,
            feedbacks: this.feedbacks,
            beatPhase: this.clock && this.clock.beatPhase ? this.clock.beatPhase() : 0,
            beatFlash: this.beatFlash,
            hitFlash: this.hitFlash,
            missFlash: this.missFlash,
            nx: this.motion.nx,
            dir: this.motion.dir,
            load: this.motion.load,
            rateHz: this.motion.rateHz,
            quality: this.motion.quality,
            stale: this.motion.stale,
            live: this.motion.isLive(),
            // 零点全 App 共用：本局标过、标定页标过、别的游戏标过，都算已标定
            calibrated: !!this.simMode || this.motion.hasZero(),
            zero: this.motion.zeroInfo(),
            calibration: this.motion.cal,
            sim: this.simMode,
            audioMode: this.mode,
            silent: this.clock ? !!this.clock.isSilent : false,
            previewing: this.previewing,
            previewBeatPhase: this.clock && this.clock.beatPhase ? this.clock.beatPhase() : 0,
            previewSec: round(this.previewMs / 1e3, 2),
            interrupted: this.interrupted,
            interruptedSec: round(this.interruptedMs / 1e3, 1),
            noteCount: this.notes.length,
            chartMeta: this.chart.meta,
            summary: this.summary
          };
        }
        // ---------------------------------------------------------------- 模拟测试入口
        /** 在音乐时间 now + leadMs 处插入一个音符（只改谱面，判定仍走真实流程） */
        debugPushNote(side, leadMs) {
          if (!this.isPlaying) return false;
          const now = this.clock.nowMs();
          const at = now + (leadMs || 1200);
          const note = {
            noteId: "dbg" + Date.now().toString(36),
            targetSide: side === "right" ? "right" : "left",
            beatIndex: at / this.beatMs,
            targetTimeMs: Math.round(at),
            noteType: "normal",
            scoreValue: 100,
            judgeStatus: "pending",
            judged: false,
            verdict: "",
            deltaMs: 0,
            judgedAt: 0,
            fade: 0
          };
          this.active.push(note);
          this.active.sort((a, b) => a.targetTimeMs - b.targetTimeMs);
          return true;
        }
        /** 调音画补偿（校准面板用） */
        setSyncOffset(ms) {
          return this.cfg.set("syncOffsetMs", ms);
        }
        /**
         * 试听 8 拍（音画校准）：
         * 只启动音乐与节拍时钟，不做判定、不生成音符，用于让患者把"看到"和"听到"对齐。
         */
        startPreview() {
          if (this.state !== STATE.READY && this.state !== STATE.IDLE) return false;
          if (!this.clock) return false;
          this.stopPreview();
          this.previewing = true;
          this.previewMs = 0;
          this.clock.start();
          this.mode = this.clock.isSilent ? "silent" : "music";
          this._emit("preview", { on: true });
          return true;
        }
        stopPreview() {
          if (!this.previewing) return false;
          this.previewing = false;
          this.previewMs = 0;
          if (this.clock) this.clock.stop();
          this._emit("preview", { on: false });
          return true;
        }
      };
      module.exports = { RhythmEngine: RhythmEngine2, STATE };
    }
  });

  // utils/scene/depth.js
  var require_depth = __commonJS({
    "utils/scene/depth.js"(exports, module) {
      var TAU = Math.PI * 2;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      function finite() {
        for (let i = 0; i < arguments.length; i++) {
          const v = arguments[i];
          if (typeof v !== "number" || !isFinite(v)) return false;
        }
        return true;
      }
      function depthT(y, hz, h) {
        if (!finite(y, hz, h) || h - hz <= 0) return 0;
        return clamp((y - hz) / (h - hz), 0, 1);
      }
      function fillEllipse(ctx, x, y, rx, ry, style) {
        if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      function ringEllipse(ctx, x, y, rx, ry, style, lw) {
        if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, TAU);
        ctx.strokeStyle = style;
        ctx.lineWidth = lw || 1;
        ctx.stroke();
        ctx.restore();
      }
      function softShadow(ctx, x, y, rx, ry, alpha, color) {
        if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return;
        const a = clamp(alpha, 0, 1);
        if (a <= 4e-3) return;
        const c = color || "0,0,0";
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(0.5, "rgba(" + c + "," + (a * 0.55).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      function haze(ctx, o) {
        if (!o || !finite(o.cx, o.y, o.rx)) return;
        const ry = o.ry || 0.07;
        const a = o.alpha === void 0 ? 0.22 : o.alpha;
        if (o.rx <= 0 || a <= 4e-3) return;
        const c = o.color || "255,246,220";
        ctx.save();
        ctx.translate(o.cx, o.y);
        ctx.scale(1, ry);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.rx);
        g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(0.55, "rgba(" + c + "," + (a * 0.4).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, o.rx, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (o.lineAlpha && o.lineAlpha > 4e-3) {
          const w = o.w || o.rx * 2;
          const x0 = o.cx - w / 2;
          const lg = ctx.createLinearGradient(x0, 0, x0 + w, 0);
          lg.addColorStop(0, "rgba(" + c + ",0)");
          lg.addColorStop(0.34, "rgba(" + c + "," + (o.lineAlpha * 0.55).toFixed(3) + ")");
          lg.addColorStop(0.5, "rgba(" + c + "," + o.lineAlpha.toFixed(3) + ")");
          lg.addColorStop(0.66, "rgba(" + c + "," + (o.lineAlpha * 0.55).toFixed(3) + ")");
          lg.addColorStop(1, "rgba(" + c + ",0)");
          ctx.fillStyle = lg;
          ctx.fillRect(x0, o.y - 0.5, w, 1);
        }
      }
      function ridge(ctx, o) {
        if (!o || !finite(o.w, o.hz)) return;
        const w = o.w;
        const hz = o.hz;
        const bands = o.bands || [];
        for (let L = 0; L < bands.length; L++) {
          const p = bands[L];
          const amp = p.amp === void 0 ? 0.1 : p.amp;
          const rise = p.rise === void 0 ? 0.05 : p.rise;
          const freq = p.freq || 6.1;
          const seed = p.seed || 1.3;
          const a = p.alpha === void 0 ? 0.6 : p.alpha;
          ctx.beginPath();
          ctx.moveTo(-4, hz + 2);
          const step = o.step || 6;
          for (let x = -4; x <= w + 4; x += step) {
            const u = x / w;
            const wave = Math.sin(u * freq + seed) * 0.5 + Math.sin(u * freq * 2.24 + seed * 2) * 0.3 + Math.sin(u * freq * 4.8 + seed * 3) * 0.14;
            const y = hz - (wave + 0.9) * w * amp * 0.5 + w * rise * 0.5;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w + 4, hz + 2);
          ctx.closePath();
          ctx.fillStyle = "rgba(" + (p.color || "40,70,90") + "," + a + ")";
          ctx.fill();
        }
      }
      function perspectiveFloor(ctx, o) {
        if (!o || !finite(o.w, o.h, o.hz, o.cx)) return;
        const w = o.w;
        const h = o.h;
        const hz = o.hz;
        const cx = o.cx;
        const floorH = h - hz;
        if (floorH <= 0) return;
        const rows = o.rows || 10;
        const phase = o.phase || 0;
        const col = o.color || "255,255,255";
        const nearA = o.nearAlpha === void 0 ? 0.14 : o.nearAlpha;
        const farA = o.farAlpha === void 0 ? 0.05 : o.farAlpha;
        const lw = o.lineWidth || 1;
        const ys = [];
        for (let i = 1; i <= rows + 1; i++) {
          const u = i - phase % 1;
          if (u < 0.06) {
            ys.push(null);
            continue;
          }
          const y = hz + floorH / u;
          ys.push(y > h + 4 ? null : y);
        }
        if (o.stripe) {
          const sc = o.stripe.color || "255,255,255";
          const sa = o.stripe.alpha === void 0 ? 0.05 : o.stripe.alpha;
          for (let i = 0; i < ys.length - 1; i++) {
            const y0 = ys[i + 1];
            const y1 = ys[i];
            if (y0 === null || y1 === null || y1 - y0 < 1) continue;
            const t = depthT((y0 + y1) * 0.5, hz, h);
            ctx.fillStyle = "rgba(" + sc + "," + (sa * (0.35 + t * 0.9)).toFixed(3) + ")";
            ctx.fillRect(0, Math.max(hz, y0), w, Math.min(h, y1) - Math.max(hz, y0));
          }
        }
        if (o.cols) {
          const spread = o.spread === void 0 ? 0.17 : o.spread;
          const topSpread = o.topSpread === void 0 ? 0.012 : o.topSpread;
          ctx.beginPath();
          for (let i = -o.cols; i <= o.cols; i++) {
            const bx = cx + i * (w * spread);
            const tx = cx + i * (w * topSpread);
            if (bx < -w || bx > w * 2) continue;
            ctx.moveTo(tx, hz);
            ctx.lineTo(bx, h);
          }
          ctx.strokeStyle = "rgba(" + col + "," + (farA * 1.1).toFixed(3) + ")";
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        const bands = [
          { lo: 5.5, hi: 999, k: 0 },
          { lo: 2.6, hi: 5.5, k: 0.55 },
          { lo: 0, hi: 2.6, k: 1 }
        ];
        for (let b = 0; b < bands.length; b++) {
          const band = bands[b];
          ctx.beginPath();
          let drew = false;
          for (let i = 0; i < ys.length; i++) {
            const y = ys[i];
            if (y === null) continue;
            const u = i + 1 - phase % 1;
            if (u < band.lo || u >= band.hi) continue;
            if (y < hz + 1) continue;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            drew = true;
          }
          if (!drew) continue;
          const a = lerp(farA, nearA, band.k);
          ctx.strokeStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
          ctx.lineWidth = lw * (1 + band.k * 0.9);
          ctx.stroke();
        }
        if (o.fadeSide) {
          const sc = o.fadeColor || "0,0,0";
          const k = o.fadeSide;
          const side = ctx.createLinearGradient(0, 0, w, 0);
          side.addColorStop(0, "rgba(" + sc + "," + (0.9 * k).toFixed(3) + ")");
          side.addColorStop(0.2, "rgba(" + sc + "," + (0.55 * k).toFixed(3) + ")");
          side.addColorStop(0.42, "rgba(" + sc + "," + (0.08 * k).toFixed(3) + ")");
          side.addColorStop(0.5, "rgba(" + sc + ",0)");
          side.addColorStop(0.58, "rgba(" + sc + "," + (0.08 * k).toFixed(3) + ")");
          side.addColorStop(0.8, "rgba(" + sc + "," + (0.55 * k).toFixed(3) + ")");
          side.addColorStop(1, "rgba(" + sc + "," + (0.9 * k).toFixed(3) + ")");
          ctx.fillStyle = side;
          ctx.fillRect(0, hz, w, floorH);
        }
        if (o.fadeBottom) {
          const sc = o.fadeColor || "0,0,0";
          const bh = floorH * 0.34;
          const bottom = ctx.createLinearGradient(0, h - bh, 0, h);
          bottom.addColorStop(0, "rgba(" + sc + ",0)");
          bottom.addColorStop(1, "rgba(" + sc + "," + o.fadeBottom.toFixed(3) + ")");
          ctx.fillStyle = bottom;
          ctx.fillRect(0, h - bh, w, bh);
        }
      }
      function cloudSea(ctx, o) {
        if (!o || !finite(o.w, o.y)) return;
        const w = o.w;
        const y = o.y;
        const c = o.color || "255,255,255";
        const a = o.alpha === void 0 ? 0.6 : o.alpha;
        const n = o.count || 7;
        const h = o.h || 22;
        const seed = o.seed || 3.1;
        const jitter = o.jitter || 0;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const jx = Math.sin(i * 2.7 + seed) * w * 0.035;
          const jy = jitter ? Math.sin(i * 5.3 + seed * 1.7) * jitter : 0;
          const x = w * u + jx + (o.drift || 0);
          const r = w * (0.09 + i * 37 % 11 / 11 * 0.09) * (o.scale || 1);
          const ry = h * (0.5 + i * 53 % 7 / 7 * 0.5);
          const yy = y + jy;
          fillEllipse(ctx, x, yy, r, ry, "rgba(" + c + "," + (a * 0.85).toFixed(3) + ")");
          fillEllipse(
            ctx,
            x - r * 0.3,
            yy - ry * 0.55,
            r * 0.55,
            ry * 0.78,
            "rgba(" + c + "," + (a * 0.72).toFixed(3) + ")"
          );
          fillEllipse(
            ctx,
            x + r * 0.28,
            yy - ry * 0.4,
            r * 0.46,
            ry * 0.62,
            "rgba(" + c + "," + (a * 0.58).toFixed(3) + ")"
          );
        }
      }
      function cloudBank(ctx, o) {
        if (!o || !finite(o.w, o.y, o.h)) return;
        const w = o.w;
        const y = o.y;
        const h = o.h;
        if (h <= 0) return;
        const c = o.color || "255,255,255";
        const a = o.alpha === void 0 ? 0.5 : o.alpha;
        if (a <= 4e-3) return;
        const wave = o.wave === void 0 ? 10 : o.wave;
        const freq = o.freq || 5.4;
        const seed = o.seed || 1.9;
        const step = o.step || 7;
        ctx.beginPath();
        ctx.moveTo(-4, y + h);
        for (let x = -4; x <= w + 4; x += step) {
          const u = x / w;
          const yy = y + Math.sin(u * freq + seed) * wave + Math.sin(u * freq * 2.3 + seed * 2.1) * wave * 0.45 + Math.sin(u * freq * 4.7 + seed * 3.3) * wave * 0.18;
          if (x <= -4) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.lineTo(w + 4, y + h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, y - wave, 0, y + h);
        g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(0.55, "rgba(" + c + "," + (a * 0.66).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g;
        ctx.fill();
        if (o.rimAlpha && o.rimAlpha > 4e-3) {
          ctx.beginPath();
          for (let x = -4; x <= w + 4; x += step) {
            const u = x / w;
            const yy = y + Math.sin(u * freq + seed) * wave + Math.sin(u * freq * 2.3 + seed * 2.1) * wave * 0.45 + Math.sin(u * freq * 4.7 + seed * 3.3) * wave * 0.18;
            if (x <= -4) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
          }
          ctx.strokeStyle = "rgba(" + c + "," + o.rimAlpha.toFixed(3) + ")";
          ctx.lineWidth = o.rimWidth || 1.4;
          ctx.stroke();
        }
      }
      function rimLight(ctx, o) {
        if (!o || !finite(o.x, o.y, o.rx, o.ry)) return;
        const a = o.alpha === void 0 ? 0.34 : o.alpha;
        if (a <= 4e-3 || o.rx <= 0 || o.ry <= 0) return;
        const c = o.color || "255,255,255";
        const from = o.from === void 0 ? -2.3 : o.from;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(1, o.ry / o.rx);
        ctx.beginPath();
        ctx.arc(0, 0, o.rx, from - 1.15, from + 1.15);
        const g = ctx.createLinearGradient(
          Math.cos(from - 1.15) * o.rx,
          Math.sin(from - 1.15) * o.rx,
          Math.cos(from + 1.15) * o.rx,
          Math.sin(from + 1.15) * o.rx
        );
        g.addColorStop(0, "rgba(" + c + ",0)");
        g.addColorStop(0.5, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = o.lw || 1.6;
        ctx.stroke();
        ctx.restore();
      }
      function buildDust(w, h, top, bottom, n, seedBase) {
        const list = [];
        const s = seedBase || 0;
        for (let i = 0; i < n; i++) {
          const r1 = (Math.sin((i + 1) * 12.9898 + s) * 43758.5453 % 1 + 1) % 1;
          const r2 = (Math.sin((i + 1) * 78.233 + s) * 12345.6789 % 1 + 1) % 1;
          const r3 = (Math.sin((i + 1) * 39.425 + s) * 9876.5432 % 1 + 1) % 1;
          list.push({
            x: w * r1,
            y: top + (bottom - top) * r2,
            r: 0.7 + r3 * 1.9,
            a: 0.08 + r2 * 0.2,
            sp: 3 + r1 * 8,
            p: r3 * TAU
          });
        }
        return list;
      }
      function drawDust(ctx, list, t, o) {
        if (!list || !list.length) return;
        const opt = o || {};
        const top = opt.top === void 0 ? 0 : opt.top;
        const bottom = opt.bottom === void 0 ? 0 : opt.bottom;
        const span = bottom - top;
        const c = opt.color || "255,255,255";
        const amp = opt.alpha === void 0 ? 1 : opt.alpha;
        ctx.save();
        for (let i = 0; i < list.length; i++) {
          const d = list[i];
          let y = d.y - t * d.sp % (span > 0 ? span : 1);
          if (span > 0 && y < top) y = bottom - (top - y);
          const a = d.a * amp * (0.5 + 0.5 * Math.sin(t * 1.6 + d.p));
          if (a <= 0.01) continue;
          ctx.fillStyle = "rgba(" + c + "," + a.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(d.x + Math.sin(t * 0.5 + d.p) * 4, y, d.r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      function vignette(ctx, o) {
        if (!o || !finite(o.w, o.h)) return;
        const w = o.w;
        const h = o.h;
        const a = o.alpha === void 0 ? 0.5 : o.alpha;
        if (a <= 4e-3) return;
        const c = o.color || "0,0,0";
        const cy = o.cy === void 0 ? 0.5 : o.cy;
        const inner = o.inner === void 0 ? 0.34 : o.inner;
        const outer = o.outer === void 0 ? 0.78 : o.outer;
        const g = ctx.createRadialGradient(
          w * 0.5,
          h * cy,
          Math.min(w, h) * inner,
          w * 0.5,
          h * (cy + 0.04),
          Math.max(w, h) * outer
        );
        g.addColorStop(0, "rgba(" + c + ",0)");
        g.addColorStop(0.7, "rgba(" + c + "," + (a * 0.31).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + "," + a.toFixed(3) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      module.exports = {
        TAU,
        clamp,
        lerp,
        finite,
        depthT,
        fillEllipse,
        ringEllipse,
        softShadow,
        haze,
        ridge,
        perspectiveFloor,
        cloudSea,
        cloudBank,
        rimLight,
        buildDust,
        drawDust,
        vignette
      };
    }
  });

  // pkgRhythm/games/rhythm/renderer.js
  var require_renderer = __commonJS({
    "pkgRhythm/games/rhythm/renderer.js"(exports, module) {
      var { songById: songById2 } = require_rhythm_songs();
      var { VERDICT_STYLE } = require_hit_judge();
      var C = {
        ink: "#3F4A5A",
        // 主文字：深蓝灰（白底可读）
        inkSoft: "rgba(63,74,90,0.84)",
        inkMute: "rgba(63,74,90,0.66)",
        cyan: "#54C7E8",
        // 天空蓝
        cyanDeep: "#2A9DBD",
        pink: "#FF8FB1",
        // 草莓粉
        pinkDeep: "#EF6C96",
        violet: "#B49BFF",
        // 淡紫
        mint: "#5ED3B8",
        // 薄荷绿
        mintDeep: "#33B296",
        gold: "#F7B955",
        // 蜂蜜黄
        lemon: "#FFD98A",
        danger: "#F2687E",
        card: "rgba(255,255,255,0.95)",
        cardLight: "rgba(255,255,255,0.72)",
        line: "rgba(120,145,175,0.22)",
        shadow: "rgba(92,116,148,0.16)",
        page: "#EAF7FF"
      };
      var depth = require_depth();
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      function rr(ctx, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
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
      function diamond(ctx, x, y, r) {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.78, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.78, y);
        ctx.closePath();
      }
      function hash(i, seed) {
        const s = Math.sin(i * 127.1 + (seed || 1) * 311.7) * 43758.5453;
        return s - Math.floor(s);
      }
      var FONT = '"PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
      var VERDICT_INK = {
        perfect: "#E8942A",
        great: "#2A9DBD",
        good: "#8A6FE0",
        miss: "#E2556E"
      };
      var RhythmRenderer2 = class {
        constructor(opts) {
          const o = opts || {};
          this.canvas = o.canvas;
          this.ctx = o.ctx;
          this.engine = o.engine;
          this.cfg = o.cfg;
          this.W = 390;
          this.H = 844;
          this.dpr = 2;
          this.clock = 0;
          this.nowMs = 0;
          this.buttons = [];
          this.bg = null;
          this.bgKey = "";
          this.pressed = {};
          this.hint = null;
          this.simOpen = false;
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
          const pillY = safeTop + 4;
          const pillH = short ? 30 : 34;
          const statY = pillY + pillH + 8;
          const statH = short ? 68 : 72;
          const btnH = short ? 38 : 44;
          const btnY = H - (short ? 8 : 10) - btnH;
          const posH = short ? 44 : 50;
          const posY = btnY - 8 - posH;
          const stageTop = statY + statH + 10;
          const stageBottom = posY - 8;
          const stageH = Math.max(150, stageBottom - stageTop);
          this.L = {
            W,
            H,
            short,
            safeTop,
            pillY,
            pillH,
            statY,
            statH,
            hudY: pillY,
            hudH: statY + statH - pillY,
            hudBottom: statY + statH,
            posY,
            posH,
            btnY,
            btnH,
            stageTop,
            stageBottom,
            stageH,
            horizonY: stageTop + stageH * (short ? 0.14 : 0.12),
            judgeY: stageTop + stageH * 0.84,
            cx: W / 2,
            roadTopHalf: Math.max(16, W * 0.05),
            roadBottomHalf: W * 0.47,
            padHalfW: clamp(W * 0.085, 26, 42),
            padH: short ? 24 : 28
          };
          this.L.laneHalf = this.L.roadBottomHalf * 0.46;
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
            this._drawBottomBar(vm);
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
        // ---------------------------------------------------------------- 背景
        _drawBackground() {
          const ctx = this.ctx;
          const key = this.W + "x" + this.H + "@" + this.dpr;
          if (this.bg && this.bgKey === key) {
            ctx.drawImage(this.bg, 0, 0, this.W, this.H);
            return;
          }
          this.bgKey = key;
          this.bg = null;
          let target = null;
          try {
            if (typeof wx !== "undefined" && wx.createOffscreenCanvas) {
              target = wx.createOffscreenCanvas({
                type: "2d",
                width: Math.round(this.W * this.dpr),
                height: Math.round(this.H * this.dpr)
              });
            }
          } catch (e) {
            target = null;
          }
          if (!target) {
            this._paintBg(ctx);
            return;
          }
          const g = target.getContext("2d");
          g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          g.clearRect(0, 0, this.W, this.H);
          this._paintBg(g);
          this.bg = target;
          ctx.drawImage(this.bg, 0, 0, this.W, this.H);
        }
        _paintBg(g) {
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const sky = g.createLinearGradient(0, 0, 0, H);
          sky.addColorStop(0, "#DFF1FF");
          sky.addColorStop(0.4, "#EFF9FF");
          sky.addColorStop(0.76, "#FFF8EC");
          sky.addColorStop(1, "#FFF1DE");
          g.fillStyle = sky;
          g.fillRect(0, 0, W, H);
          const sunX = W * 0.84;
          const sunY = L.stageTop - 6;
          const sun = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.32);
          sun.addColorStop(0, "rgba(255,232,160,0.90)");
          sun.addColorStop(0.28, "rgba(255,226,150,0.34)");
          sun.addColorStop(1, "rgba(255,226,150,0)");
          g.fillStyle = sun;
          g.fillRect(0, 0, W, Math.max(1, sunY + W * 0.32));
          const cloud = (cx, cy, r, a) => {
            g.fillStyle = "rgba(255,255,255," + a.toFixed(2) + ")";
            const puffs = [[-1.05, 0.1, 0.66], [0, 0, 1], [1, 0.14, 0.62]];
            puffs.forEach((p) => {
              g.beginPath();
              g.arc(cx + p[0] * r, cy + p[1] * r, r * 0.62 * p[2], 0, Math.PI * 2);
              g.fill();
            });
            g.beginPath();
            g.ellipse(cx, cy + r * 0.3, r * 1.5, r * 0.48, 0, 0, Math.PI * 2);
            g.fill();
          };
          cloud(W * 0.2, L.stageTop + 40, 24, 0.92);
          cloud(W * 0.74, L.stageTop + 96, 18, 0.72);
          cloud(W * 0.38, L.stageTop + 152, 13, 0.5);
          for (let i = 0; i < 40; i++) {
            const x = hash(i, 1) * W;
            const y = hash(i, 2) * H;
            const r = 1.1 + hash(i, 3) * 2.4;
            g.fillStyle = "rgba(255,255,255," + (0.3 + hash(i, 4) * 0.45).toFixed(2) + ")";
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
          }
          const hillY = L.horizonY;
          const range = (col, h1, h2, lift) => {
            g.beginPath();
            g.moveTo(0, hillY + 3 + lift);
            g.lineTo(W * 0.14, hillY - h1 * 0.55 + lift);
            g.lineTo(W * 0.22, hillY - h1 + lift);
            g.lineTo(W * 0.31, hillY - h2 * 0.5 + lift);
            g.lineTo(W * 0.4, hillY - h2 + lift);
            g.lineTo(W * 0.5, hillY - h1 * 0.45 + lift);
            g.lineTo(W * 0.6, hillY - h2 * 0.85 + lift);
            g.lineTo(W * 0.7, hillY - h1 * 0.4 + lift);
            g.lineTo(W * 0.8, hillY - h2 * 0.95 + lift);
            g.lineTo(W * 0.9, hillY - h1 * 0.55 + lift);
            g.lineTo(W, hillY - h2 * 0.6 + lift);
            g.lineTo(W, hillY + 6 + lift);
            g.lineTo(0, hillY + 6 + lift);
            g.closePath();
            g.fillStyle = col;
            g.fill();
          };
          range("rgba(150,196,214,0.75)", 66, 44, 0);
          range("rgba(112,170,190,0.85)", 44, 30, 10);
          const lake = g.createLinearGradient(0, hillY, 0, hillY + 74);
          lake.addColorStop(0, "rgba(146,214,226,0.95)");
          lake.addColorStop(1, "rgba(186,232,238,0.85)");
          g.fillStyle = lake;
          g.fillRect(0, hillY - 2, W, 76);
          g.save();
          g.strokeStyle = "rgba(255,255,255,0.45)";
          g.lineWidth = 1;
          for (let i = 0; i < 5; i++) {
            const wy = hillY + 8 + i * 13;
            g.beginPath();
            g.moveTo(W * 0.02, wy);
            g.quadraticCurveTo(W * 0.2, wy - 2, W * 0.38, wy);
            g.stroke();
            g.beginPath();
            g.moveTo(W * 0.62, wy + 3);
            g.quadraticCurveTo(W * 0.8, wy + 1, W * 0.98, wy + 3);
            g.stroke();
          }
          g.restore();
          const blossom = (tx, ty, r, alpha) => {
            g.save();
            g.globalAlpha = alpha;
            g.fillStyle = "rgba(140,108,92,0.9)";
            g.fillRect(tx - r * 0.09, ty - r * 0.9, r * 0.18, r * 0.95);
            const grd = g.createRadialGradient(tx - r * 0.3, ty - r * 1.5, r * 0.1, tx, ty - r * 1.1, r * 1.15);
            grd.addColorStop(0, "#FFD3E2");
            grd.addColorStop(0.65, "#FFB4CE");
            grd.addColorStop(1, "#F58FB4");
            g.fillStyle = grd;
            [[0, -1.1, 0.72], [-0.72, -0.86, 0.52], [0.74, -0.9, 0.5], [0.34, -1.42, 0.46], [-0.4, -1.36, 0.44]].forEach((p) => {
              g.beginPath();
              g.arc(tx + p[0] * r, ty + p[1] * r, r * p[2], 0, Math.PI * 2);
              g.fill();
            });
            g.restore();
          };
          blossom(W * 0.055, hillY + 34, 24, 0.95);
          blossom(W * 0.155, hillY + 26, 17, 0.9);
          blossom(W * 0.945, hillY + 36, 24, 0.95);
          blossom(W * 0.845, hillY + 26, 17, 0.9);
          this._paintRoad(g);
          this._paintGrid(g);
          depth.haze(g, {
            cx: L.cx,
            y: L.horizonY + 1,
            rx: W * 0.52,
            ry: 0.055,
            color: "255,251,235",
            alpha: 0.62
          });
          const fogH = (L.stageBottom - L.horizonY) * 0.22;
          const span = L.stageBottom + 20 - L.horizonY;
          const halfAt = (y) => lerp(
            L.roadTopHalf,
            L.roadBottomHalf,
            clamp((y - L.horizonY) / span, 0, 1)
          );
          const hTop = halfAt(L.horizonY) * 1.02;
          const hBot = halfAt(L.horizonY + fogH) * 1.02;
          const fog = g.createLinearGradient(0, L.horizonY, 0, L.horizonY + fogH);
          fog.addColorStop(0, "rgba(255,251,238,0.92)");
          fog.addColorStop(0.45, "rgba(255,251,238,0.42)");
          fog.addColorStop(1, "rgba(255,251,238,0)");
          g.beginPath();
          g.moveTo(L.cx - hTop, L.horizonY);
          g.lineTo(L.cx + hTop, L.horizonY);
          g.lineTo(L.cx + hBot, L.horizonY + fogH);
          g.lineTo(L.cx - hBot, L.horizonY + fogH);
          g.closePath();
          g.fillStyle = fog;
          g.fill();
        }
        _paintRoad(g) {
          const L = this.L;
          const cx = L.cx;
          const topY = L.horizonY;
          const botY = L.stageBottom + 20;
          g.beginPath();
          g.moveTo(cx - L.roadTopHalf, topY);
          g.lineTo(cx + L.roadTopHalf, topY);
          g.lineTo(cx + L.roadBottomHalf, botY);
          g.lineTo(cx - L.roadBottomHalf, botY);
          g.closePath();
          const rg = g.createLinearGradient(0, topY, 0, botY);
          rg.addColorStop(0, "rgba(255,253,247,0.97)");
          rg.addColorStop(0.6, "rgba(255,250,240,0.98)");
          rg.addColorStop(1, "rgba(255,244,229,0.99)");
          g.fillStyle = rg;
          g.fill();
          const laneBand = (a, b, col) => {
            g.beginPath();
            g.moveTo(cx + a * L.roadTopHalf, topY);
            g.lineTo(cx + b * L.roadTopHalf, topY);
            g.lineTo(cx + b * L.roadBottomHalf, botY);
            g.lineTo(cx + a * L.roadBottomHalf, botY);
            g.closePath();
            g.fillStyle = col;
            g.fill();
          };
          laneBand(-1, -0.23, "rgba(255,175,201,0.55)");
          laneBand(-0.23, 0.23, "rgba(255,226,158,0.52)");
          laneBand(0.23, 1, "rgba(140,226,198,0.55)");
          const hg = g.createLinearGradient(cx - L.roadTopHalf, 0, cx + L.roadTopHalf, 0);
          hg.addColorStop(0, "rgba(255,255,255,0)");
          hg.addColorStop(0.5, "rgba(255,255,255,0.85)");
          hg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = hg;
          g.fillRect(cx - L.roadTopHalf, topY - 1.5, L.roadTopHalf * 2, 3);
          const edge = (dir, col) => {
            g.beginPath();
            g.moveTo(cx + dir * L.roadTopHalf, topY);
            g.lineTo(cx + dir * L.roadBottomHalf, botY);
            g.lineWidth = 4.5;
            g.strokeStyle = col;
            g.stroke();
            g.beginPath();
            g.moveTo(cx + dir * L.roadTopHalf, topY);
            g.lineTo(cx + dir * L.roadBottomHalf, botY);
            g.lineWidth = 2;
            g.strokeStyle = "rgba(255,255,255,0.96)";
            g.stroke();
          };
          edge(-1, "rgba(239,108,150,0.75)");
          edge(1, "rgba(52,176,203,0.75)");
          [-1, 1].forEach((k) => {
            g.lineCap = "round";
            for (let i = 0; i < 16; i++) {
              const t0 = i / 16;
              const t1 = t0 + 0.042;
              const y0 = lerp(topY, botY, Math.pow(t0, 1.8));
              const y1 = lerp(topY, botY, Math.pow(t1, 1.8));
              const h0 = lerp(L.roadTopHalf, L.roadBottomHalf, Math.pow(t0, 1.8)) * 0.23;
              const h1 = lerp(L.roadTopHalf, L.roadBottomHalf, Math.pow(t1, 1.8)) * 0.23;
              g.beginPath();
              g.moveTo(cx + k * h0, y0);
              g.lineTo(cx + k * h1, y1);
              g.lineWidth = 1.2 + t0 * 2.2;
              g.strokeStyle = "rgba(255,255,255," + (0.55 + t0 * 0.4).toFixed(2) + ")";
              g.stroke();
            }
            g.lineCap = "butt";
          });
        }
        _paintGrid(g) {
          const L = this.L;
          const cx = L.cx;
          const topY = L.horizonY;
          const botY = L.stageBottom + 20;
          g.strokeStyle = "rgba(120,160,200,0.10)";
          g.lineWidth = 1;
          for (let i = 1; i <= 10; i++) {
            const t = Math.pow(i / 10, 2.1);
            const y = lerp(topY, botY, t);
            const half2 = lerp(L.roadTopHalf, L.roadBottomHalf, t);
            g.beginPath();
            g.moveTo(cx - half2, y);
            g.lineTo(cx + half2, y);
            g.stroke();
          }
          const jy = L.judgeY;
          const half = lerp(L.roadTopHalf, L.roadBottomHalf, (jy - topY) / (botY - topY));
          const band = g.createLinearGradient(cx - half, jy, cx + half, jy);
          band.addColorStop(0, "rgba(239,108,150,0.9)");
          band.addColorStop(0.12, "rgba(255,255,255,0.98)");
          band.addColorStop(0.88, "rgba(255,255,255,0.98)");
          band.addColorStop(1, "rgba(52,176,203,0.9)");
          g.beginPath();
          g.moveTo(cx - half, jy);
          g.lineTo(cx + half, jy);
          g.lineWidth = 5;
          g.lineCap = "round";
          g.strokeStyle = band;
          g.stroke();
          g.lineCap = "butt";
        }
        // ---------------------------------------------------------------- 舞台
        _laneX(side, t) {
          const L = this.L;
          const half = lerp(L.roadTopHalf, L.roadBottomHalf, t);
          const dir = side === "left" ? -1 : side === "right" ? 1 : 0;
          return L.cx + dir * half * 0.46;
        }
        _noteY(p) {
          const L = this.L;
          const t = Math.pow(clamp(p, 0, 1), 1.15);
          return lerp(L.horizonY, L.judgeY, t);
        }
        _drawWorld(vm, screen) {
          const ctx = this.ctx;
          const L = this.L;
          if (this.cfg.get("beatPulseOn") && screen === "play") {
            const pulse = (1 - vm.beatPhase) * 0.5;
            const g = ctx.createRadialGradient(L.cx, L.judgeY, 10, L.cx, L.judgeY, L.W * 0.55);
            g.addColorStop(0, "rgba(150,190,255," + (0.1 * pulse).toFixed(3) + ")");
            g.addColorStop(1, "rgba(150,190,255,0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, L.stageTop, L.W, L.stageBottom - L.stageTop);
          }
          if (screen === "play") {
            this._drawPetals();
            this._drawJudgeGlow(vm);
            this._drawBeatLines(vm);
            this._drawTargetLane(vm);
            this._drawNotes(vm);
            this._drawPads(vm);
            this._drawPlayer(vm);
            this._drawFx(vm);
            this._drawJudgeText(vm);
          } else if (screen === "intro") {
            this._drawIntroNotes(vm);
          }
          depth.vignette(ctx, {
            w: L.W,
            h: L.H,
            color: "54,74,96",
            alpha: 0.15,
            cy: 0.52,
            inner: 0.44,
            outer: 0.98
          });
        }
        /** 飘落的小花瓣：让画面"活"起来，成本很低 */
        _drawPetals() {
          const ctx = this.ctx;
          const L = this.L;
          const cols = ["rgba(255,183,206,0.85)", "rgba(255,226,160,0.85)", "rgba(178,236,218,0.85)"];
          ctx.save();
          for (let i = 0; i < 9; i++) {
            const sp = 0.05 + i % 3 * 0.018;
            const ph = (this.clock * sp + i * 0.13) % 1;
            const x0 = hash(i, 7) * L.W;
            const x = x0 + Math.sin(this.clock * 0.9 + i) * 12;
            const y = L.stageTop + ph * (L.stageBottom - L.stageTop);
            const r = 3.2 + i % 3 * 1.1;
            ctx.globalAlpha = 0.55 + 0.35 * Math.sin(ph * Math.PI);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(this.clock * 0.6 + i);
            ctx.beginPath();
            ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
            ctx.fillStyle = cols[i % 3];
            ctx.fill();
            ctx.restore();
          }
          ctx.restore();
        }
        /** 判定线：随节拍亮起的一道柔光（不闪屏） */
        _drawJudgeGlow(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const pulse = this.cfg.get("beatPulseOn") ? 1 - (vm.beatPhase || 0) : 0.4;
          const t = (L.judgeY - L.horizonY) / (L.stageBottom + 20 - L.horizonY);
          const half = lerp(L.roadTopHalf, L.roadBottomHalf, t);
          ctx.save();
          ctx.globalAlpha = 0.16 + pulse * 0.22;
          const g = ctx.createLinearGradient(L.cx - half, 0, L.cx + half, 0);
          g.addColorStop(0, "rgba(255,143,177,0)");
          g.addColorStop(0.5, "rgba(255,255,255,0.95)");
          g.addColorStop(1, "rgba(94,211,184,0)");
          ctx.fillStyle = g;
          ctx.fillRect(L.cx - half, L.judgeY - 3, half * 2, 6);
          ctx.restore();
        }
        /** 节拍横线：每一拍一条，顺着跑道流向判定线（也在提示"这一拍"的位置） */
        _drawBeatLines(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const beat = vm.beatMs || 500;
          if (!beat) return;
          const approach = clamp(Number(this.cfg.get("approachMs")) || 2400, 900, 4e3);
          const now = vm.musicMs || 0;
          const phase = now % beat / beat;
          const count = Math.ceil(approach / beat) + 2;
          ctx.save();
          for (let j = 0; j <= count; j++) {
            const p = 1 - (j - phase) * beat / approach;
            if (p < 0 || p > 1.02) continue;
            const t = Math.pow(clamp(p, 0, 1), 1.15);
            const y = lerp(L.horizonY, L.judgeY, t);
            const half = lerp(L.roadTopHalf, L.roadBottomHalf, t);
            const a = 0.14 + 0.2 * p;
            ctx.beginPath();
            ctx.moveTo(L.cx - half, y);
            ctx.lineTo(L.cx + half, y);
            ctx.lineWidth = 1.4 + t * 3;
            ctx.strokeStyle = "rgba(126,158,190," + a.toFixed(3) + ")";
            ctx.stroke();
          }
          ctx.restore();
        }
        /** 下一颗音符快到时，把它的车道按透视点亮一段：视线自动跟过去 */
        _drawTargetLane(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const notes = vm.notes || [];
          let next = null;
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (n.judged) continue;
            if (!next || n.progress < next.progress) next = n;
          }
          if (!next || next.progress < 0.55) return;
          const k = clamp((next.progress - 0.55) / 0.45, 0, 1);
          const t0 = Math.pow(0.55, 1.15);
          const t1 = 1;
          const y0 = lerp(L.horizonY, L.judgeY, t0);
          const y1 = L.judgeY;
          const half0 = lerp(L.roadTopHalf, L.roadBottomHalf, t0) * 0.23;
          const half1 = lerp(L.roadTopHalf, L.roadBottomHalf, t1) * 0.23;
          const x0 = this._laneX(next.side, t0);
          const x1 = this._laneX(next.side, t1);
          const col = next.side === "left" ? "255,143,177" : next.side === "center" ? "247,185,85" : "94,211,184";
          const g = ctx.createLinearGradient(0, y0, 0, y1);
          g.addColorStop(0, "rgba(" + col + ",0)");
          g.addColorStop(0.72, "rgba(" + col + "," + (0.1 + k * 0.12).toFixed(3) + ")");
          g.addColorStop(1, "rgba(" + col + "," + (0.2 + k * 0.18).toFixed(3) + ")");
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x0 - half0 * 1.15, y0);
          ctx.lineTo(x0 + half0 * 1.15, y0);
          ctx.lineTo(x1 + half1 * 1.55, y1 + 6);
          ctx.lineTo(x1 - half1 * 1.55, y1 + 6);
          ctx.closePath();
          ctx.fillStyle = g;
          ctx.fill();
          ctx.restore();
        }
        _drawNotes(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const notes = vm.notes || [];
          const tint = { left: C.pink, center: "#FFC46B", right: C.mint };
          const tintDeep = { left: C.pinkDeep, center: "#EFA13C", right: C.mintDeep };
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            const p = n.progress;
            if (p < 0 || p > 1.15) continue;
            const t = Math.pow(clamp(p, 0, 1), 1.15);
            const y = this._noteY(p);
            const x = this._laneX(n.side, t);
            const scale = 0.68 + 0.5 * Math.pow(clamp(p, 0, 1), 1.2);
            const R = (n.type === "accent" ? 25 : 21) * scale;
            const color = tint[n.side] || C.pink;
            const deep = tintDeep[n.side] || C.pinkDeep;
            let alpha = 1;
            if (n.judged) {
              const age = (vm.musicMs - n.judgedAt) / 700;
              alpha = n.verdict === "miss" ? Math.max(0, 1 - age) * 0.5 : Math.max(0, 1 - age);
            }
            if (!n.judged && p < 0.08) alpha *= clamp(p / 0.08, 0, 1);
            if (alpha <= 0.01) continue;
            ctx.save();
            ctx.globalAlpha = alpha;
            if (!n.judged && p > 0.08) {
              for (let k = 1; k <= 2; k++) {
                const pk = p - k * 0.05;
                if (pk <= 5e-3) break;
                const tx = this._laneX(n.side, Math.pow(pk, 1.15));
                const ty = this._noteY(pk);
                ctx.globalAlpha = alpha * (0.22 - k * 0.08);
                rr(ctx, tx - R * 0.8, ty - R * 0.8, R * 1.6, R * 1.6, R * 0.55);
                ctx.fillStyle = color;
                ctx.fill();
              }
              ctx.globalAlpha = alpha;
            }
            if (p > 0.78 && !n.judged) {
              const k = (p - 0.78) / 0.22;
              ctx.globalAlpha = alpha * 0.32 * k;
              const g = ctx.createRadialGradient(x, L.judgeY, 2, x, L.judgeY, 30 * k + 8);
              g.addColorStop(0, color);
              g.addColorStop(1, "rgba(255,255,255,0)");
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.ellipse(x, L.judgeY, 22 * k + 8, 8 * k + 3, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = alpha;
            }
            ctx.shadowColor = C.shadow;
            ctx.shadowBlur = 8 * scale;
            ctx.shadowOffsetY = 3 * scale;
            rr(ctx, x - R, y - R, R * 2, R * 2, R * 0.5);
            const grad = ctx.createLinearGradient(x, y - R, x, y + R);
            grad.addColorStop(0, "#FFFFFF");
            grad.addColorStop(0.34, color);
            grad.addColorStop(1, deep);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.lineWidth = Math.max(1.2, R * 0.16);
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.8;
            ctx.beginPath();
            ctx.ellipse(x - R * 0.3, y - R * 0.44, R * 0.4, R * 0.2, -0.5, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.fill();
            ctx.globalAlpha = alpha;
            this._musicGlyph(x, y, R * 0.62, "rgba(255,255,255,0.97)");
            if (n.type === "accent") {
              ctx.globalAlpha = alpha * 0.55;
              ctx.beginPath();
              ctx.arc(x, y, R * 1.34, 0, Math.PI * 2);
              ctx.lineWidth = Math.max(1, R * 0.09);
              ctx.strokeStyle = "rgba(255,255,255,0.9)";
              ctx.stroke();
              ctx.globalAlpha = alpha;
            }
            ctx.restore();
          }
        }
        /** 双雪佛龙：表示方向，但不会读成"播放键" */
        _chevron(x, y, r, dir, color, lw) {
          const ctx = this.ctx;
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (let i = 0; i < 2; i++) {
            const ox = x + dir * (i * r * 0.62 - r * 0.2);
            ctx.beginPath();
            ctx.moveTo(ox - dir * r * 0.28, y - r * 0.42);
            ctx.lineTo(ox + dir * r * 0.22, y);
            ctx.lineTo(ox - dir * r * 0.28, y + r * 0.42);
            ctx.stroke();
          }
          ctx.restore();
        }
        _arrow(x, y, r, dir, color) {
          const ctx = this.ctx;
          ctx.beginPath();
          ctx.moveTo(x + dir * r, y);
          ctx.lineTo(x - dir * r * 0.7, y - r * 0.85);
          ctx.lineTo(x - dir * r * 0.7, y + r * 0.85);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
        _drawPads(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const beatOn = this.cfg.get("beatPulseOn");
          const pulse = beatOn ? 1 - (vm.beatPhase || 0) : 0;
          const armed = vm.dir;
          const r = (L.padH || 26) * 1.05;
          ["left", "center", "right"].forEach((side) => {
            const x = this._laneX(side, 1);
            const y = L.judgeY;
            const isLeft = side === "left";
            const color = isLeft ? C.pink : side === "center" ? C.gold : C.mint;
            const deep = isLeft ? C.pinkDeep : side === "center" ? "#E8942A" : C.mintDeep;
            const active = armed === side;
            const lift = active ? 2.5 : 0;
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(x, y + 6, r * 0.92, r * 0.34, 0, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(120,145,175,0.14)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y - lift, r, 0, Math.PI * 2);
            const g = ctx.createLinearGradient(x, y - lift - r, x, y - lift + r);
            g.addColorStop(0, "#FFFFFF");
            g.addColorStop(1, active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.94)");
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineWidth = active ? 3.2 : 2.4;
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y - lift, r * 0.74, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = active ? "rgba(255,255,255,0.95)" : "rgba(120,145,175,0.14)";
            ctx.stroke();
            if (active && pulse > 0.01) {
              ctx.beginPath();
              ctx.arc(x, y - lift, r + (1 - pulse) * r * 0.35, 0, Math.PI * 2);
              ctx.globalAlpha = 0.35 * pulse;
              ctx.lineWidth = 3;
              ctx.strokeStyle = color;
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
            if (side === "center") {
              this._text("\u4E2D", x, y + 5 - lift, { size: 14, weight: "800", color: deep, align: "center" });
            } else {
              this._chevron(x - r * 0.42, y - lift, 7, isLeft ? -1 : 1, deep, 2.2);
              this._text(isLeft ? "\u5DE6" : "\u53F3", x + r * 0.26, y + 5 - lift, {
                size: 14,
                weight: "800",
                color: deep,
                align: "center"
              });
            }
            ctx.restore();
          });
        }
        _drawPlayer(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const xL = this._laneX("left", 1);
          const xR = this._laneX("right", 1);
          const nx = clamp(vm.nx || 0, -1, 1);
          const x = lerp(xL, xR, (nx + 1) / 2);
          const y = L.judgeY + L.padH + 24;
          ctx.save();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(120,145,175,0.22)";
          ctx.setLineDash([2, 5]);
          ctx.beginPath();
          ctx.moveTo(xL, y);
          ctx.lineTo(xR, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ["left", "center", "right"].forEach((sd) => {
            const tx = this._laneX(sd, 1);
            ctx.beginPath();
            ctx.moveTo(tx, y - 4);
            ctx.lineTo(tx, y + 4);
            ctx.lineWidth = 2;
            ctx.strokeStyle = sd === "left" ? "rgba(255,143,177,0.7)" : sd === "center" ? "rgba(247,185,85,0.7)" : "rgba(94,211,184,0.7)";
            ctx.stroke();
          });
          ctx.shadowColor = C.shadow;
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
          ctx.beginPath();
          ctx.ellipse(x, y, 15, 14, 0, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(120,145,175,0.35)";
          ctx.stroke();
          ctx.fillStyle = "#43506A";
          ctx.beginPath();
          ctx.arc(x - 4.2, y - 1.6, 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + 4.2, y - 1.6, 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,150,172,0.5)";
          ctx.beginPath();
          ctx.ellipse(x - 7.4, y + 3, 2.6, 1.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x + 7.4, y + 3, 2.6, 1.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y + 2.2, 3, Math.PI * 0.18, Math.PI * 0.82);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "#43506A";
          ctx.stroke();
          ctx.restore();
        }
        _drawFx(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const now = vm.musicMs;
          const notes = vm.notes || [];
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (!n.judged || n.verdict === "miss") continue;
            const age = (now - n.judgedAt) / 560;
            if (age < 0 || age > 1) continue;
            const x = this._laneX(n.side, 1);
            const y = L.judgeY;
            const color = n.side === "left" ? "#FF8FB1" : n.side === "center" ? "#B49BFF" : "#5ED3B8";
            ctx.save();
            ctx.globalAlpha = 1 - age;
            ctx.beginPath();
            ctx.ellipse(x, y, 18 + age * 52, (18 + age * 52) * 0.42, 0, 0, Math.PI * 2);
            ctx.lineWidth = 2.4 * (1 - age);
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.restore();
            ctx.save();
            for (let k = 0; k < 7; k++) {
              const a = hash(k, i) * Math.PI * 2;
              const sp = 40 + hash(k + 9, i) * 70;
              const px = x + Math.cos(a) * sp * age;
              const py = y + Math.sin(a) * sp * age * 0.55 - 34 * age * age;
              ctx.globalAlpha = (1 - age) * 0.9;
              ctx.fillStyle = k % 3 === 0 ? "#FFFFFF" : color;
              ctx.beginPath();
              ctx.arc(px, py, Math.max(0.7, 3.2 * (1 - age)), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
          if (vm.missFlash > 0.02) {
            ctx.save();
            ctx.globalAlpha = vm.missFlash * 0.4;
            ctx.beginPath();
            ctx.moveTo(L.cx - L.roadBottomHalf * 0.9, L.judgeY);
            ctx.lineTo(L.cx + L.roadBottomHalf * 0.9, L.judgeY);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(255,124,147,0.9)";
            ctx.stroke();
            ctx.restore();
          }
        }
        _drawJudgeText(vm) {
          const f = vm.feedback;
          if (!f) return;
          const ctx = this.ctx;
          const L = this.L;
          const age = (vm.musicMs - f.at) / 900;
          if (age < 0 || age > 1) return;
          const style = VERDICT_STYLE[f.verdict] || VERDICT_STYLE.good;
          const alpha = age < 0.12 ? age / 0.12 : 1 - Math.max(0, (age - 0.62) / 0.38);
          const scale = 1 + Math.max(0, 0.16 - age) * 1.4;
          const y = L.judgeY - 106 - age * 14;
          ctx.save();
          ctx.globalAlpha = clamp(alpha, 0, 1);
          ctx.translate(L.cx, y);
          ctx.scale(scale, scale);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = style.mark + " " + style.en;
          ctx.font = "800 20px " + FONT;
          const tw = ctx.measureText(label).width;
          rr(ctx, -tw / 2 - 12, -15, tw + 24, 30, 15);
          ctx.fillStyle = "rgba(255,255,255,0.82)";
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.strokeText(label, 0, 0);
          const ink = VERDICT_INK[f.verdict] || VERDICT_INK.good;
          ctx.shadowColor = "rgba(92,116,148,0.25)";
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = ink;
          ctx.fillText(label, 0, 0);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.font = "600 10px " + FONT;
          ctx.fillStyle = "rgba(63,74,90,0.85)";
          const sub = style.zh + (f.deltaMs !== void 0 ? "  " + (f.deltaMs > 0 ? "+" : "") + f.deltaMs + "ms" : "");
          ctx.fillText(sub, 0, 20);
          ctx.restore();
        }
        // ---------------------------------------------------------------- 连击
        _drawCombo(vm) {
          const combo = vm.combo || 0;
          if (combo < 2) return;
          const ctx = this.ctx;
          const L = this.L;
          const pop = vm.feedback && vm.musicMs - vm.feedback.at < 180 ? 1.08 : 1;
          const y = L.stageTop + 24;
          ctx.save();
          ctx.translate(L.cx, y);
          ctx.scale(pop, pop);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tier = combo >= 30 ? "#E8942A" : combo >= 15 ? C.cyanDeep : "#8A6FE0";
          ctx.font = "800 15px " + FONT;
          ctx.fillStyle = "rgba(63,74,90,0.55)";
          ctx.fillText("COMBO", 0, -12);
          ctx.font = "800 34px " + FONT;
          ctx.lineWidth = 5;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.strokeText("\xD7" + combo, 0, 16);
          ctx.fillStyle = tier;
          ctx.fillText("\xD7" + combo, 0, 16);
          ctx.restore();
        }
        // ---------------------------------------------------------------- HUD
        /** 蓝色胶囊（顶部标题 / 曲目） */
        _pill(x, y, w, h) {
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(58,84,200,0.28)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
          rr(ctx, x, y, w, h, h / 2);
          const g = ctx.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, "#6C8AF5");
          g.addColorStop(1, "#3E5BD8");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, h / 2);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.38)";
          ctx.stroke();
        }
        /** 数据卡里的小图标（杯子 / 准星 / 火苗 / 时钟） */
        _statIcon(name, x, y, r, color) {
          const ctx = this.ctx;
          ctx.save();
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = Math.max(1.2, r * 0.16);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (name === "trophy") {
            ctx.beginPath();
            ctx.moveTo(x - r * 0.55, y - r * 0.6);
            ctx.lineTo(x + r * 0.55, y - r * 0.6);
            ctx.lineTo(x + r * 0.32, y + r * 0.12);
            ctx.lineTo(x - r * 0.32, y + r * 0.12);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y + r * 0.12);
            ctx.lineTo(x, y + r * 0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - r * 0.42, y + r * 0.62);
            ctx.lineTo(x + r * 0.42, y + r * 0.62);
            ctx.stroke();
          } else if (name === "target") {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
            ctx.fill();
          } else if (name === "flame") {
            ctx.beginPath();
            ctx.moveTo(x, y - r * 0.72);
            ctx.quadraticCurveTo(x + r * 0.62, y - r * 0.05, x + r * 0.28, y + r * 0.5);
            ctx.quadraticCurveTo(x, y + r * 0.72, x - r * 0.28, y + r * 0.5);
            ctx.quadraticCurveTo(x - r * 0.62, y - r * 0.05, x, y - r * 0.72);
            ctx.closePath();
            ctx.fill();
          } else if (name === "clock") {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y - r * 0.34);
            ctx.lineTo(x, y);
            ctx.lineTo(x + r * 0.3, y + r * 0.14);
            ctx.stroke();
          } else if (name === "note") {
            this._musicGlyph(x, y, r * 0.9, color);
          }
          ctx.restore();
        }
        /** 八分音符：音符上的图标，比实心三角更好认 */
        _musicGlyph(x, y, size, color) {
          const ctx = this.ctx;
          const k = size / 10;
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.ellipse(-k * 2.2, k * 2.6, k * 3, k * 2.2, -0.36, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(k * 0.7, k * 2.2);
          ctx.lineTo(k * 0.7, -k * 5.2);
          ctx.lineWidth = Math.max(1.4, k * 1.7);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(k * 0.7, -k * 5.2);
          ctx.quadraticCurveTo(k * 4.6, -k * 4.2, k * 3.4, -k * 0.6);
          ctx.lineWidth = Math.max(1.4, k * 2.1);
          ctx.stroke();
          ctx.restore();
        }
        _fmtClock(sec) {
          const s = Math.max(0, Math.round(sec || 0));
          const mm = Math.floor(s / 60);
          const ss = s % 60;
          return (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
        }
        _drawHud(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const short = L.short;
          const py = L.pillY;
          const ph = L.pillH;
          const title = "\u8282\u594F\u8BAD\u7EC3";
          const chip = "\u7B2C " + vm.difficulty + " \u6863";
          const tf = short ? 12 : 12.5;
          const tw = this._measure(title, tf, "800");
          const chipW = this._measure(chip, 9, "700") + 16;
          const leftW = Math.min(W * 0.58, 13 + 18 + 2 + tw + 10 + chipW + 10);
          this._pill(12, py, leftW, ph);
          this._musicGlyph(12 + 22, py + ph / 2, 9, "#FFFFFF");
          this._text(title, 12 + 34, py + ph / 2 + 4.5, { size: tf, weight: "800", color: "#FFFFFF" });
          rr(ctx, 12 + leftW - chipW - 7, py + (ph - 18) / 2, chipW, 18, 9);
          ctx.fillStyle = "rgba(255,255,255,0.26)";
          ctx.fill();
          this._text(chip, 12 + leftW - chipW / 2 - 7, py + ph / 2 + 3.4, {
            size: 9,
            weight: "700",
            color: "#FFFFFF",
            align: "center"
          });
          const songName = vm.song.name;
          const timeStr = this._fmtClock(vm.timeLeftSec) + " / " + this._fmtClock(vm.durationSec);
          const nameW = this._measure(songName, 10.5, "700");
          const timeW = this._measure(timeStr, 9, "600");
          const rightW = Math.min(W * 0.4, 13 + 18 + 3 + Math.max(nameW, timeW) + 12);
          const rx = W - 12 - rightW;
          this._pill(rx, py, rightW, ph);
          this._musicGlyph(rx + 21, py + ph / 2, 8.5, "rgba(255,255,255,0.95)");
          this._text(songName, rx + 33, py + ph / 2 - 1.5, { size: 10.5, weight: "700", color: "#FFFFFF" });
          this._text(timeStr, rx + 33, py + ph / 2 + 10, { size: 9, weight: "600", color: "rgba(255,255,255,0.82)" });
          const gap = 8;
          const baseX = 12;
          const cardW = (W - 24 - gap * 3) / 4;
          const cy = L.statY;
          const ch = L.statH;
          const acc = vm.rhythmAccuracy === null ? "\u2014" : Math.round(vm.rhythmAccuracy * 100) + "%";
          const cards = [
            { icon: "trophy", tint: "rgba(253,186,116,0.28)", color: "#E8701A", label: "\u5F53\u524D\u5F97\u5206", value: String(vm.score) },
            { icon: "target", tint: "rgba(147,197,253,0.30)", color: "#2F6BE8", label: "\u8282\u594F\u51C6\u786E\u7387", value: acc },
            { icon: "flame", tint: "rgba(253,186,116,0.28)", color: "#E8701A", label: "\u8FDE\u51FB\u6570", value: "\xD7" + (vm.combo || 0) },
            { icon: "clock", tint: "rgba(167,243,208,0.34)", color: "#0E9E76", label: "\u5269\u4F59\u65F6\u95F4", value: this._fmtClock(vm.timeLeftSec), bar: true }
          ];
          cards.forEach((c, i) => {
            const x = baseX + i * (cardW + gap);
            ctx.save();
            ctx.shadowColor = "rgba(92,116,148,0.16)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 3;
            rr(ctx, x, cy, cardW, ch, 14);
            ctx.fillStyle = "rgba(255,255,255,0.97)";
            ctx.fill();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(x + 17, cy + 18, 10, 0, Math.PI * 2);
            ctx.fillStyle = c.tint;
            ctx.fill();
            this._statIcon(c.icon, x + 17, cy + 18, 8, c.color);
            this._text(c.label, x + 9, cy + 38, { size: 8, weight: "600", color: C.inkMute });
            this._text(c.value, x + 9, cy + (short ? 54 : 58), { size: short ? 15 : 17, weight: "800", color: c.color });
            if (c.bar) {
              const ratio = clamp((vm.timeLeftSec || 0) / Math.max(1, vm.durationSec || 1), 0, 1);
              rr(ctx, x + 9, cy + ch - 8, cardW - 18, 3.5, 1.75);
              ctx.fillStyle = "rgba(120,145,175,0.14)";
              ctx.fill();
              if (ratio > 0.02) {
                rr(ctx, x + 9, cy + ch - 8, Math.max(4, (cardW - 18) * ratio), 3.5, 1.75);
                ctx.fillStyle = "#2BC79B";
                ctx.fill();
              }
            }
          });
          const iw = 88;
          const ih = 72;
          const ix = W - 12 - iw;
          const iy = L.stageTop + 6;
          rr(ctx, ix, iy, iw, ih, 12);
          ctx.fillStyle = "rgba(62,91,216,0.82)";
          ctx.fill();
          rr(ctx, ix, iy, iw, ih, 12);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.stroke();
          this._text("\u97F3\u7B26 " + (vm.judgedCount || 0) + " / " + (vm.totalNotes || 0), ix + 10, iy + 18, {
            size: 9,
            weight: "700",
            color: "rgba(255,255,255,0.95)"
          });
          this._dot(ix + 13, iy + 32, 3.5, "#5BE3A6");
          this._text("\u6210\u529F " + (vm.hits || 0), ix + 21, iy + 35, { size: 9, weight: "600", color: "rgba(255,255,255,0.92)" });
          this._dot(ix + 13, iy + 50, 3.5, "#FF8FA8");
          this._text("\u6F0F\u63A5 " + (vm.miss || 0), ix + 21, iy + 53, { size: 9, weight: "600", color: "rgba(255,255,255,0.92)" });
          if ((vm.combo || 0) >= 2) {
            const cxx = 22;
            const cyy = L.stageTop + 56;
            const pop = 1 + Math.max(0, 0.18 - (vm.comboFlash || 0) * 0.3);
            ctx.save();
            ctx.translate(cxx, cyy);
            ctx.rotate(-0.12);
            ctx.scale(pop, pop);
            const cw = 62;
            const chh = 40;
            ctx.shadowColor = "rgba(240,140,40,0.35)";
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
            rr(ctx, 0, -chh / 2, cw, chh, 12);
            const g = ctx.createLinearGradient(0, -chh / 2, 0, chh / 2);
            g.addColorStop(0, "#FFC24D");
            g.addColorStop(1, "#F5871F");
            ctx.fillStyle = g;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            this._text("\xD7" + vm.combo, cw / 2, -1, { size: 17, weight: "800", color: "#FFFFFF", align: "center" });
            this._text("\u8FDE\u51FB", cw / 2, 13, { size: 8.5, weight: "700", color: "rgba(255,255,255,0.95)", align: "center" });
            ctx.restore();
          }
        }
        _drawBottomBar(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const y = L.posY;
          const h = L.posH;
          ctx.save();
          ctx.shadowColor = "rgba(92,116,148,0.18)";
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 5;
          rr(ctx, 12, y, W - 24, h, 16);
          ctx.fillStyle = "rgba(255,255,255,0.97)";
          ctx.fill();
          ctx.restore();
          this._text("\u8EAB\u4F53\u4F4D\u7F6E", 22, y + h * 0.42, { size: 9, weight: "700", color: C.inkSoft });
          const tx0 = 84;
          const tx1 = W - 26;
          const tw = tx1 - tx0;
          const ty = y + h * 0.42;
          const g = ctx.createLinearGradient(tx0, 0, tx1, 0);
          g.addColorStop(0, "#FFB3CB");
          g.addColorStop(0.45, "#FFD98A");
          g.addColorStop(1, "#8FE0CB");
          rr(ctx, tx0, ty - 4, tw, 8, 4);
          ctx.fillStyle = g;
          ctx.fill();
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(tx0 + tw * (i / 4), ty, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.fill();
          }
          const nx = clamp(vm.nx || 0, -1, 1);
          const px = tx0 + tw * (nx + 1) / 2;
          ctx.save();
          ctx.shadowColor = "rgba(92,116,148,0.28)";
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;
          ctx.beginPath();
          ctx.arc(px, ty, 11, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(px, ty, 11, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#FF9DBB";
          ctx.stroke();
          ctx.fillStyle = "#4A5568";
          ctx.beginPath();
          ctx.arc(px - 3.4, ty - 1.4, 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px + 3.4, ty - 1.4, 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,150,172,0.55)";
          ctx.beginPath();
          ctx.ellipse(px - 6, ty + 2.6, 2, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(px + 6, ty + 2.6, 2, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px, ty + 1.8, 2.4, Math.PI * 0.2, Math.PI * 0.8);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = "#4A5568";
          ctx.stroke();
          const ly = y + h - 7;
          this._text("\u5411\u5DE6", tx0, ly, { size: 7.5, weight: "600", color: C.inkMute });
          this._text("\u4E2D\u5FC3", tx0 + tw / 2, ly, { size: 7.5, weight: "600", color: C.inkMute, align: "center" });
          this._text("\u5411\u53F3", tx1, ly, { size: 7.5, weight: "600", color: C.inkMute, align: "right" });
          const gap = 8;
          const bw = (W - 24 - gap * 3) / 4;
          const by = L.btnY;
          const bh = L.btnH;
          const beatOn = this.cfg.get("beatPulseOn");
          const vol = Math.round((Number(this.cfg.get("musicVolume")) || 0) * 100);
          this._button("pause", 12, by, bw, bh, vm.state === "PAUSED" ? "\u7EE7\u7EED" : "\u6682\u505C", {
            variant: "panel",
            icon: vm.state === "PAUSED" ? "play" : "pause",
            size: 10.5,
            radius: 14
          });
          this._button("vol", 12 + (bw + gap), by, bw, bh, vol + "%", {
            variant: "panel",
            icon: "volume",
            size: 10.5,
            radius: 14
          });
          this._button("beat", 12 + (bw + gap) * 2, by, bw, bh, "\u8282\u62CD" + (beatOn ? "\u5F00" : "\u5173"), {
            variant: beatOn ? "panelOn" : "panel",
            icon: "wave",
            size: 10.5,
            radius: 14
          });
          this._button("quit", 12 + (bw + gap) * 3, by, bw, bh, "\u9000\u51FA", {
            variant: "panel",
            icon: "exit",
            size: 10.5,
            radius: 14
          });
        }
        _drawCountdown(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const n = Math.max(1, vm.countdownBeat);
          const frac = vm.countdownSec % (vm.beatMs / 1e3) / (vm.beatMs / 1e3);
          const scale = 1 + (1 - frac) * 0.25;
          ctx.save();
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillRect(0, L.stageTop, L.W, L.stageBottom - L.stageTop);
          ctx.translate(L.cx, L.stageTop + (L.stageBottom - L.stageTop) * 0.42);
          ctx.scale(scale, scale);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "800 76px " + FONT;
          ctx.lineWidth = 8;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.strokeText(String(n), 0, 0);
          ctx.fillStyle = C.pink;
          ctx.fillText(String(n), 0, 0);
          ctx.font = "700 13px " + FONT;
          ctx.fillStyle = C.inkSoft;
          ctx.fillText("\u9884\u5907\u62CD \xB7 \u7AD9\u597D\u6216\u5750\u7A33", 0, 62);
          ctx.restore();
        }
        // ---------------------------------------------------------------- 遮罩
        _dim(alpha) {
          const ctx = this.ctx;
          const L = this.L;
          ctx.save();
          ctx.fillStyle = "rgba(255,255,255," + (alpha === void 0 ? 0.6 : alpha) + ")";
          ctx.fillRect(0, 0, L.W, L.H);
          ctx.restore();
        }
        _drawPauseOverlay(vm) {
          const ctx = this.ctx;
          const L = this.L;
          this._dim(0.62);
          const w = L.W - 64;
          const h = 244;
          const x = 32;
          const y = (L.H - h) / 2 - 20;
          this._glass(x, y, w, h);
          this._text("\u5DF2\u6682\u505C", L.cx, y + 44, { size: 20, weight: "800", color: C.ink, align: "center" });
          this._text("\u97F3\u4E50\u3001\u97F3\u7B26\u3001\u5224\u5B9A\u90FD\u505C\u5728\u539F\u5730", L.cx, y + 68, { size: 10, weight: "500", color: C.inkMute, align: "center" });
          this._text("\u5DF2\u547D\u4E2D " + vm.hits + " \xB7 \u6F0F\u63A5 " + vm.miss, L.cx, y + 92, {
            size: 11,
            weight: "600",
            color: C.inkSoft,
            align: "center"
          });
          this._button("resume", x + 20, y + 112, w - 40, 46, "\u7EE7\u7EED\u8BAD\u7EC3", { variant: "primary", icon: "play", size: 14 });
          this._button("quit", x + 20, y + 170, w - 40, 40, "\u7ED3\u675F\u672C\u5C40\u5E76\u67E5\u770B\u6210\u7EE9", { variant: "ghost", icon: "check", size: 11 });
        }
        _drawSensorOverlay(vm) {
          const L = this.L;
          this._dim(0.68);
          const w = L.W - 64;
          const h = 250;
          const x = 32;
          const y = (L.H - h) / 2 - 20;
          this._glass(x, y, w, h);
          this._text("\u4F20\u611F\u5668\u6570\u636E\u4E2D\u65AD", L.cx, y + 42, { size: 17, weight: "800", color: C.danger, align: "center" });
          this._text("\u5DF2\u505C\u6B62\u5224\u5B9A\u4E0E\u8BA1\u65F6\uFF0C\u672C\u5C40\u4E0D\u4F1A\u56E0\u6B64\u6389\u5206", L.cx, y + 66, {
            size: 10,
            weight: "500",
            color: C.inkMute,
            align: "center"
          });
          this._text("\u4E2D\u65AD " + vm.interruptedSec + " \u79D2", L.cx, y + 88, {
            size: 10.5,
            weight: "600",
            color: "#E8942A",
            align: "center"
          });
          this._button("reconnect", x + 20, y + 108, w - 40, 44, "\u53BB\u91CD\u65B0\u8FDE\u63A5", { variant: "primary", icon: "wave", size: 13 });
          this._button("resume", x + 20, y + 162, w - 40, 38, "\u6570\u636E\u5DF2\u6062\u590D\uFF0C\u7EE7\u7EED", { variant: "ghost", icon: "check", size: 11 });
          this._button("quit", x + 20, y + 206, w - 40, 30, "\u7ED3\u675F\u672C\u5C40", { variant: "link", size: 10 });
        }
        // ---------------------------------------------------------------- 介绍页
        _drawIntro(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(255,255,255,0.30)");
          scrim.addColorStop(0.45, "rgba(255,255,255,0.22)");
          scrim.addColorStop(1, "rgba(255,251,244,0.70)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          const top = L.safeTop + 16;
          this._text("\u8282\u594F\u8BAD\u7EC3", 24, top + 36, {
            size: 30,
            weight: "800",
            color: C.ink
          });
          this._text("\u8DDF\u7740\u8282\u62CD\uFF0C\u7528\u8EAB\u4F53\u5DE6\u53F3\u79FB\u52A8\u63A5\u97F3\u7B26", 25, top + 60, {
            size: 11,
            weight: "500",
            color: C.inkSoft
          });
          let cx = 24;
          const chips = [];
          chips.push({
            t: vm.sim ? "\u6A21\u62DF\u6570\u636E" : vm.live ? "\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5" : "\u4F20\u611F\u5668\u672A\u8FDE\u63A5",
            bg: vm.sim ? "rgba(255,226,150,0.95)" : vm.live ? "rgba(206,242,232,0.95)" : "rgba(224,230,240,0.9)",
            fg: vm.sim ? "#6B4A12" : vm.live ? "#1F6E80" : "#5A6478"
          });
          chips.push({ t: "BPM " + vm.bpm, bg: "rgba(255,255,255,0.85)", fg: "#5A6478" });
          chips.push({ t: "\u7B2C " + vm.difficulty + " \u6863", bg: "rgba(255,255,255,0.85)", fg: "#5A6478" });
          chips.forEach((c) => {
            const w = this._measure(c.t, 10, "700") + 18;
            rr(ctx, cx, top + 74, w, 22, 11);
            ctx.fillStyle = c.bg;
            ctx.fill();
            this._text(c.t, cx + w / 2, top + 89, { size: 10, weight: "700", color: c.fg, align: "center" });
            cx += w + 6;
          });
          const cardX = 16;
          const cardW = W - 32;
          const btnBlock = 158;
          const wantH = 466;
          const maxH = H - (L.safeTop + 16) - 150;
          let cardH = Math.max(320, Math.min(wantH, maxH));
          const cardY = H - 16 - cardH;
          this._glass(cardX, cardY, cardW, cardH);
          const avail = cardH - btnBlock - 20;
          const showSteps = avail >= 214;
          const showParams = avail >= 286;
          let y = cardY + 22;
          this._text("\u9009\u62E9\u66F2\u76EE", cardX + 20, y + 8, { size: 11, weight: "700", color: C.ink });
          y += 20;
          const songs = require_rhythm_songs().SONGS;
          const rowW = (cardW - 40 - 10) / 2;
          songs.slice(0, 2).forEach((s, i) => {
            const sx = cardX + 20 + i * (rowW + 10);
            const on = s.songId === vm.song.songId;
            rr(ctx, sx, y, rowW, 62, 12);
            ctx.fillStyle = on ? "rgba(84,199,232,0.14)" : "rgba(120,145,175,0.06)";
            ctx.fill();
            ctx.lineWidth = on ? 1.6 : 1;
            ctx.strokeStyle = on ? "rgba(84,199,232,0.7)" : C.line;
            ctx.stroke();
            this._text(s.name, sx + 12, y + 24, { size: 12, weight: "700", color: C.ink });
            this._text(s.bpm + " BPM \xB7 " + s.tag, sx + 12, y + 42, { size: 9, weight: "500", color: C.inkMute });
            if (on) this._dot(sx + rowW - 14, y + 14, 4, C.cyan);
            this.buttons.push({ id: "song:" + s.songId, x: sx, y, w: rowW, h: 62 });
          });
          y += 74;
          this._text("\u96BE\u5EA6", cardX + 20, y + 15, { size: 10, weight: "700", color: C.inkMute });
          const dw = (cardW - 40 - 44 - 6 * 4) / 5;
          for (let i = 1; i <= 5; i++) {
            const dx = cardX + 20 + 44 + (i - 1) * (dw + 6);
            const on = i === vm.difficulty;
            rr(ctx, dx, y, dw, 30, 9);
            ctx.fillStyle = on ? "rgba(180,155,255,0.28)" : "rgba(120,145,175,0.06)";
            ctx.fill();
            ctx.lineWidth = on ? 1.4 : 1;
            ctx.strokeStyle = on ? "rgba(150,120,240,0.75)" : C.line;
            ctx.stroke();
            this._text(String(i), dx + dw / 2, y + 20, {
              size: 12,
              weight: "800",
              color: on ? "#7B5FD6" : C.inkMute,
              align: "center"
            });
            this.buttons.push({ id: "lv:" + i, x: dx, y, w: dw, h: 30 });
          }
          y += 46;
          if (showSteps) {
            const steps = [
              "\u7AD9\u597D\u6216\u5750\u7A33\uFF0C\u5B8C\u6210\u96F6\u70B9\u6807\u5B9A",
              "\u542C\u97F3\u4E50\u7684\u62CD\u5B50\uFF0C\u5411\u5DE6 / \u56DE\u6B63 / \u5411\u53F3\u79FB\u52A8\u8EAB\u4F53",
              "\u97F3\u7B26\u5230\u8FBE\u5224\u5B9A\u7EBF\u65F6\u4FDD\u6301\u5728\u6B63\u786E\u4E00\u4FA7"
            ];
            steps.forEach((s, i) => {
              const sy = y + i * 22 + 4;
              ctx.beginPath();
              ctx.arc(cardX + 26, sy - 3.5, 7.5, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(84,199,232,0.16)";
              ctx.fill();
              this._text(String(i + 1), cardX + 26, sy - 0.5, {
                size: 9.5,
                weight: "700",
                color: C.cyanDeep,
                align: "center"
              });
              this._text(s, cardX + 40, sy, { size: 10, weight: "500", color: C.inkSoft });
            });
            y += steps.length * 22 + 8;
          }
          if (showParams) {
            const beatSec = 60 / Math.max(30, vm.bpm || 90);
            const stepBeats = Math.max(0.25, Number(this.cfg.get("noteStepBeats")) || 1);
            const est = Math.max(1, Math.round((Number(this.cfg.get("durationSec")) || 90) / (beatSec * stepBeats)));
            const params2 = [
              { k: "\u65F6\u957F", v: (Number(this.cfg.get("durationSec")) || 90) + " \u79D2" },
              { k: "\u97F3\u7B26\u95F4\u9694", v: stepBeats + " \u62CD" },
              { k: "\u5224\u5B9A\u7A97\u53E3", v: "\xB1" + (Number(this.cfg.get("goodMs")) || 160) + "ms" },
              { k: "\u9884\u4F30\u97F3\u7B26", v: "\u7EA6 " + est + " \u4E2A" }
            ];
            const cellW = (cardW - 40) / 2;
            params2.forEach((p, i) => {
              const px = cardX + 20 + i % 2 * cellW;
              const py = y + Math.floor(i / 2) * 34;
              rr(ctx, px, py, cellW - 8, 30, 8);
              ctx.fillStyle = "rgba(120,145,175,0.06)";
              ctx.fill();
              this._text(p.k, px + 9, py + 12, { size: 9.5, weight: "500", color: C.inkMute });
              this._text(String(p.v), px + 9, py + 25, { size: 10, weight: "700", color: C.ink });
            });
          }
          const btnH = 48;
          const startY = cardY + cardH - btnH - 14;
          this._button("start", cardX + 18, startY, cardW - 36, btnH, "\u5F00\u59CB\u8BAD\u7EC3", {
            variant: "primary",
            icon: "play",
            size: 15
          });
          const halfW = (cardW - 46) / 2;
          this._button("settings", cardX + 18, startY - 44, halfW, 36, "\u8BAD\u7EC3\u8BBE\u7F6E", { variant: "ghost", icon: "gear", size: 11 });
          this._button("records", cardX + 28 + halfW, startY - 44, halfW, 36, "\u8BAD\u7EC3\u8BB0\u5F55", { variant: "ghost", icon: "list", size: 11 });
          const swY = startY - 74;
          this._text(vm.sim ? "\u6A21\u62DF\u6570\u636E\uFF1A\u5F00\uFF08\u4EC5\u7528\u4E8E\u6D4B\u8BD5\uFF09" : "\u7528\u6A21\u62DF\u6570\u636E\u6D4B\u8BD5\uFF08\u65E0\u4F20\u611F\u5668\u4E5F\u80FD\u7EC3\uFF09", cardX + 18, swY + 14, {
            size: 9.5,
            weight: "600",
            color: vm.sim ? C.gold : C.inkMute
          });
          const swW = 44;
          const swH = 24;
          const swX = cardX + cardW - 18 - swW;
          rr(ctx, swX, swY, swW, swH, swH / 2);
          ctx.fillStyle = vm.sim ? "rgba(255,180,80,0.95)" : "rgba(255,255,255,0.16)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(swX + (vm.sim ? swW - swH / 2 : swH / 2), swY + swH / 2, swH / 2 - 3, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          this.buttons.push({ id: vm.sim ? "sim:off" : "sim:on", x: swX - 90, y: swY - 6, w: swW + 96, h: swH + 12 });
        }
        /** 介绍页背景里飘的几个音符（纯装饰，不代表判定） */
        _drawIntroNotes(vm) {
          const ctx = this.ctx;
          const L = this.L;
          for (let i = 0; i < 3; i++) {
            const t = (this.clock * 0.12 + i * 0.33) % 1;
            const y = lerp(L.horizonY, L.stageBottom, t);
            const side = i % 2 === 0 ? "left" : "right";
            const x = this._laneX(side, t);
            const r = 6 + t * 10;
            ctx.save();
            ctx.globalAlpha = 0.18 + t * 0.25;
            diamond(ctx, x, y, r);
            ctx.fillStyle = side === "left" ? C.pink : C.cyan;
            ctx.fill();
            ctx.restore();
          }
        }
        // ---------------------------------------------------------------- 准备页
        _drawPrepare(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(255,255,255,0.22)");
          scrim.addColorStop(0.5, "rgba(255,255,255,0.28)");
          scrim.addColorStop(1, "rgba(255,251,244,0.68)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          this._text("\u51C6\u5907\u5F00\u59CB", 22, L.safeTop + 34, {
            size: 24,
            weight: "800",
            color: C.ink
          });
          this._text("\u6234\u597D\u80F8\u5E26 \u2192 \u97F3\u753B\u6821\u51C6 \u2192 \u5F00\u59CB", 23, L.safeTop + 56, {
            size: 10.5,
            weight: "500",
            color: C.inkSoft
          });
          this._button("back", W - 66, L.safeTop + 12, 52, 34, "\u8FD4\u56DE", { variant: "link", size: 11 });
          const cardX = 16;
          const cardW = W - 32;
          const cardNeed = 500;
          let cardH = Math.min(cardNeed, H - (L.safeTop + 76) - 20);
          cardH = Math.max(400, cardH);
          const cardY = H - 18 - cardH;
          this._glass(cardX, cardY, cardW, cardH);
          let cx = cardX + 18;
          const connected = vm.live;
          const chips = [
            { t: vm.sim ? "\u6A21\u62DF\u6A21\u5F0F" : connected ? "\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5" : "\u4F20\u611F\u5668\u672A\u8FDE\u63A5", bg: vm.sim ? "rgba(255,226,150,0.95)" : connected ? "rgba(206,242,232,0.95)" : "rgba(224,230,240,0.9)", fg: vm.sim || !connected ? "#6B4A12" : "#1F6E80" },
            { t: vm.sim ? "\u6A21\u62DF\u8F93\u5165" : (vm.rateHz || 0) + " Hz", bg: "rgba(255,255,255,0.85)", fg: "#5A6478" }
          ];
          chips.forEach((c) => {
            const w = this._measure(c.t, 10, "700") + 18;
            rr(ctx, cx, cardY + 16, w, 22, 11);
            ctx.fillStyle = c.bg;
            ctx.fill();
            this._text(c.t, cx + w / 2, cardY + 31, { size: 10, weight: "700", color: c.fg, align: "center" });
            cx += w + 6;
          });
          if (!connected && !vm.sim) {
            this._button("connect", cardX + cardW - 92, cardY + 12, 78, 30, "\u53BB\u8FDE\u63A5", {
              variant: "primary",
              size: 11,
              icon: "wave"
            });
          }
          const infoY = cardY + 58;
          this._text(vm.song.name + " \xB7 " + vm.bpm + " BPM", cardX + 18, infoY + 10, {
            size: 14,
            weight: "800",
            color: C.ink
          });
          this._text("\u7B2C " + vm.difficulty + " \u6863 \xB7 " + vm.difficultyLabel + " \xB7 " + (Number(this.cfg.get("durationSec")) || 90) + " \u79D2", cardX + 18, infoY + 28, {
            size: 9.5,
            weight: "500",
            color: C.inkMute
          });
          const waveY = infoY + 44;
          for (let i = 0; i < 26; i++) {
            const h = 4 + Math.abs(Math.sin(i * 1.7)) * 14;
            const bx = cardX + 18 + i * ((cardW - 36) / 26);
            rr(ctx, bx, waveY + 18 - h / 2, 2.5, h, 1.25);
            ctx.fillStyle = i % 4 === 0 ? "rgba(255,143,177,0.8)" : "rgba(84,199,232,0.45)";
            ctx.fill();
          }
          const steps = [
            { t: "\u4F20\u611F\u5668\u5361\u5728\u80F8\u5E26\u4E0A", d: "\u80F8\u5E26\u4ECE\u814B\u4E0B\u6700\u9AD8\u70B9\u7ED5\u4E00\u5708\u56FA\u5B9A" },
            { t: "\u5750\u7A33\u6216\u7AD9\u7A33", d: "\u53CC\u624B\u81EA\u7136\u653E\u4E0B\uFF0C\u8EAB\u4F53\u4FDD\u6301\u4E2D\u7ACB\u4F4D" },
            { t: "\u542C " + (Number(this.cfg.get("prepBeats")) || 2) + " \u62CD\u9884\u5907\u97F3", d: "\u97F3\u4E50\u5F00\u59CB\u540E\u8DDF\u7740\u62CD\u5B50\u5DE6\u53F3\u79FB\u52A8" }
          ];
          const stepTop = waveY + 46;
          steps.forEach((s, i) => {
            const sy = stepTop + i * 40;
            ctx.beginPath();
            ctx.arc(cardX + 27, sy, 9, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 ? "rgba(84,199,232,0.18)" : "rgba(120,145,175,0.08)";
            ctx.fill();
            this._text(String(i + 1), cardX + 27, sy + 3.5, {
              size: 9.5,
              weight: "700",
              color: C.cyanDeep,
              align: "center"
            });
            this._text(s.t, cardX + 44, sy + 2, { size: 11, weight: "600", color: C.ink });
            this._text(s.d, cardX + 44, sy + 16, { size: 9, weight: "500", color: C.inkMute });
          });
          const calY = stepTop + steps.length * 40 + 2;
          const z = vm.zero || { roll: 0, pitch: 0, set: false };
          const fDeg = (v) => (v >= 0 ? "+" : "") + (Math.round(v * 10) / 10).toFixed(1) + "\xB0";
          if (z.set) {
            this._text("\u5F53\u524D\u96F6\u70B9 " + fDeg(z.roll) + " / " + fDeg(z.pitch), cardX + 18, calY + 10, {
              size: 10,
              weight: "600",
              color: C.mintDeep
            });
          } else {
            this._text("\u8FD8\u6CA1\u8BBE\u7F6E\u96F6\u70B9\uFF0C\u8BFB\u6570\u6309\u4F20\u611F\u5668\u539F\u59CB\u89D2\u5EA6\u7B97", cardX + 18, calY + 10, {
              size: 9.5,
              weight: "600",
              color: C.danger
            });
          }
          this._button("zero:set", cardX + cardW - 92, calY, 74, 26, z.set ? "\u91CD\u8BBE" : "\u53BB\u6807\u5B9A", {
            variant: "ghost",
            size: 10
          });
          const btnH = 46;
          const by = cardY + cardH - btnH - 14;
          const ghostTop = by - 44;
          const calibBlockH = 76;
          const calibTop = ghostTop - 14 - calibBlockH;
          if (calibTop > calY + 28) {
            rr(ctx, cardX + 16, calibTop, cardW - 32, calibBlockH, 12);
            ctx.fillStyle = "rgba(120,145,175,0.06)";
            ctx.fill();
            this._text("\u97F3\u753B\u5EF6\u8FDF\u8865\u507F", cardX + 28, calibTop + 18, { size: 9.5, weight: "700", color: C.inkSoft });
            const off = Number(this.cfg.get("syncOffsetMs")) || 0;
            this._text((off > 0 ? "+" : "") + off + " ms", cardX + 28, calibTop + 40, {
              size: 14,
              weight: "800",
              color: C.cyan
            });
            this._text("\u70B9\u300C\u8BD5\u542C\u300D\u8DDF\u7740\u62CD\u624B\uFF0C\u8BA9\u95EA\u70C1\u4E0E\u542C\u5230\u7684\u58F0\u97F3\u91CD\u5408", cardX + 28, calibTop + 58, {
              size: 9.5,
              weight: "500",
              color: C.inkMute
            });
            const bw = 30;
            this._button("calib:minus", cardX + cardW - 32 - bw * 2 - 8 - 62, calibTop + 26, bw, 26, "\u2212", { variant: "ghost", size: 13 });
            this._button("calib:plus", cardX + cardW - 32 - bw - 62, calibTop + 26, bw, 26, "+", { variant: "ghost", size: 13 });
            this._button(
              "calib:play",
              cardX + cardW - 32 - 56,
              calibTop + 26,
              56,
              26,
              vm.previewing ? "\u505C\u6B62" : "\u8BD5\u542C",
              {
                variant: vm.previewing ? "ghostOn" : "ghost",
                size: 10
              }
            );
          }
          if (vm.previewing) {
            const phase = clamp(vm.previewBeatPhase || 0, 0, 1);
            const py = L.stageTop + (L.stageBottom - L.stageTop) * 0.34;
            ctx.save();
            ctx.globalAlpha = 1 - phase;
            ctx.beginPath();
            ctx.arc(L.cx, py, 24 + phase * 46, 0, Math.PI * 2);
            ctx.lineWidth = 3 * (1 - phase) + 1;
            ctx.strokeStyle = C.cyan;
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = 0.9 - phase * 0.4;
            ctx.beginPath();
            ctx.arc(L.cx, py, 12, 0, Math.PI * 2);
            ctx.fillStyle = C.cyan;
            ctx.fill();
            ctx.restore();
            this._text('\u8DDF\u7740\u95EA\u70C1\u62CD\u624B\uFF1A\u542C\u5230\u7684"\u54D2"\u548C\u770B\u5230\u7684\u95EA\u662F\u540C\u4E00\u65F6\u523B', L.cx, py + 74, {
              size: 9.5,
              weight: "600",
              color: C.inkSoft,
              align: "center"
            });
          }
          this._button("enter", cardX + 18, by, cardW - 36, btnH, "\u8FDB\u5165\u6E38\u620F", {
            variant: "primary",
            icon: "play",
            size: 15
          });
          this._button(
            vm.sim ? "sim:off" : "sim:on",
            cardX + 18,
            ghostTop,
            cardW - 36,
            38,
            vm.sim ? "\u5173\u95ED\u6A21\u62DF" : "\u4F7F\u7528\u6A21\u62DF\u6570\u636E",
            { variant: "ghost", icon: "check", size: 11 }
          );
        }
        // ---------------------------------------------------------------- 结算页
        _drawResult(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const W = L.W;
          const H = L.H;
          const s = this.engine.summary || {};
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(255,255,255,0.55)");
          scrim.addColorStop(0.5, "rgba(255,252,246,0.62)");
          scrim.addColorStop(1, "rgba(255,248,236,0.72)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          const px = 16;
          const pw = W - 32;
          const py = Math.max(L.safeTop + 8, H * 0.05);
          const ph = H - py - 16;
          this._glass(px, py, pw, ph);
          const tight = ph < 600;
          const gx = px + 20;
          const gw = pw - 40;
          const bh = tight ? 42 : 46;
          const btnBlockH = bh + 14 + (tight ? 40 : 44) + 10;
          const topPad = tight ? 24 : 52;
          let y = py + topPad;
          this._text(s.completed ? "\u8BAD\u7EC3\u5B8C\u6210" : "\u672C\u5C40\u5DF2\u7ED3\u675F", gx, y + 16, {
            size: 16,
            weight: "800",
            color: C.ink
          });
          this._text((s.songName || "") + " \xB7 " + (s.bpm || 0) + " BPM \xB7 \u7B2C " + (s.difficulty || 0) + " \u6863", gx, y + 34, {
            size: 9,
            weight: "500",
            color: C.inkMute
          });
          this._text(s.dataSource === "simulation" ? "\u6A21\u62DF\u6570\u636E \xB7 \u4E0D\u8BA1\u5165\u771F\u5B9E\u8BAD\u7EC3" : "\u771F\u5B9E\u4F20\u611F\u5668\u6570\u636E", gx, y + 50, {
            size: 9,
            weight: "500",
            color: s.dataSource === "simulation" ? "#C98A1E" : C.mintDeep
          });
          const ringR = tight ? 22 : 25;
          this._gradeRing(px + pw - 34 - ringR, y + 34, ringR, s.grade || "-");
          const scoreStr = String(s.score || 0);
          const resScore = ctx.createLinearGradient(0, y + (tight ? 56 : 60), 0, y + (tight ? 92 : 98));
          resScore.addColorStop(0, "#FF8FB1");
          resScore.addColorStop(0.6, "#FB9F7E");
          resScore.addColorStop(1, "#F5A03A");
          ctx.save();
          ctx.font = "800 " + (tight ? 36 : 40) + "px " + FONT;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = resScore;
          ctx.fillText(scoreStr, gx, y + (tight ? 84 : 90));
          ctx.restore();
          const sw = this._measure(scoreStr, tight ? 36 : 40, "800");
          this._text("\u5206", gx + sw + 5, y + (tight ? 84 : 90), { size: 11, weight: "600", color: C.inkMute });
          this._text(
            "\u547D\u4E2D " + (s.hits || 0) + " / " + (s.noteCount || 0) + " \u4E2A\u97F3\u7B26 \xB7 \u8FDE\u51FB\u6700\u9AD8 \xD7" + (s.comboMax || 0),
            gx,
            y + (tight ? 104 : 110),
            { size: 9.5, weight: "500", color: C.inkSoft }
          );
          const tileY = y + (tight ? 116 : 122);
          const tileH = 44;
          const tiles = [
            { k: "PERFECT", v: s.perfect || 0, c: VERDICT_INK.perfect },
            { k: "GREAT", v: s.great || 0, c: VERDICT_INK.great },
            { k: "GOOD", v: s.good || 0, c: VERDICT_INK.good },
            { k: "MISS", v: s.miss || 0, c: VERDICT_INK.miss }
          ];
          const tileGap = 8;
          const tileW = (gw - tileGap * 3) / 4;
          tiles.forEach((t, i) => {
            const tx = gx + i * (tileW + tileGap);
            rr(ctx, tx, tileY, tileW, tileH, 10);
            ctx.fillStyle = "rgba(120,145,175,0.07)";
            ctx.fill();
            this._text(String(t.v), tx + tileW / 2, tileY + 22, {
              size: 16,
              weight: "800",
              color: t.c,
              align: "center"
            });
            this._text(t.k, tx + tileW / 2, tileY + 36, {
              size: 9,
              weight: "700",
              color: C.inkMute,
              align: "center"
            });
          });
          const distY = tileY + tileH + (tight ? 12 : 16);
          const distTotal = Math.max(1, (s.perfect || 0) + (s.great || 0) + (s.good || 0) + (s.miss || 0));
          const dist = [
            { v: s.perfect || 0, c: VERDICT_STYLE.perfect.color },
            { v: s.great || 0, c: VERDICT_STYLE.great.color },
            { v: s.good || 0, c: VERDICT_STYLE.good.color },
            { v: s.miss || 0, c: VERDICT_STYLE.miss.color }
          ];
          let dx2 = gx;
          const distW = gw;
          rr(ctx, gx, distY, distW, 8, 4);
          ctx.fillStyle = "rgba(120,145,175,0.07)";
          ctx.fill();
          ctx.save();
          rr(ctx, gx, distY, distW, 8, 4);
          ctx.clip();
          dist.forEach((d) => {
            const w = distW * (d.v / distTotal);
            if (w <= 0) return;
            ctx.fillStyle = d.c;
            ctx.fillRect(dx2, distY, Math.max(1, w), 8);
            dx2 += w;
          });
          ctx.restore();
          y = distY + (tight ? 18 : 22);
          const accs = [
            { k: "\u8282\u594F\u51C6\u786E\u7387", v: s.rhythmAccuracy, tip: "\u52A0\u6743\u65F6\u95F4\u7CBE\u5EA6" },
            { k: "\u65B9\u5411\u51C6\u786E\u7387", v: s.directionAccuracy, tip: "\u5DE6\u53F3\u65B9\u5411\u662F\u5426\u6B63\u786E" },
            { k: "\u7EFC\u5408\u547D\u4E2D\u7387", v: s.overallHitRate, tip: "\u547D\u4E2D / \u97F3\u7B26\u603B\u6570" }
          ];
          const accW = gw / 3;
          accs.forEach((a, i) => {
            const ax = gx + i * accW;
            this._text(a.k, ax, y + 9, { size: 9.5, weight: "600", color: C.inkMute });
            const txt = a.v === null || a.v === void 0 ? "\u6682\u65E0\u6570\u636E" : Math.round(a.v * 100) + "%";
            this._text(txt, ax, y + 27, {
              size: a.v === null || a.v === void 0 ? 10 : 15,
              weight: "800",
              color: a.v === null || a.v === void 0 ? C.inkMute : C.ink
            });
          });
          y += 42;
          const rows = [
            ["\u5DE6 / \u4E2D / \u53F3\u547D\u4E2D", (s.leftHitCount || 0) + " / " + (s.centerHitCount || 0) + " / " + (s.rightHitCount || 0)],
            ["\u65B9\u5411\u9519\u8BEF", (s.wrongDirectionCount || 0) + " \u6B21"],
            ["\u8BAD\u7EC3\u65F6\u957F", (s.durationSec || 0).toFixed(1) + " / " + (s.plannedSec || 0).toFixed(0) + " \u79D2"],
            ["\u97F3\u753B\u8865\u507F", (s.syncOffsetMs > 0 ? "+" : "") + (s.syncOffsetMs || 0) + " ms"],
            ["\u6570\u636E\u4E2D\u65AD", (s.interruptedSec || 0).toFixed(1) + " \u79D2"],
            ["\u8C31\u9762\u79CD\u5B50", String(s.chartSeed || "-")]
          ];
          const rowGap = tight ? 30 : 38;
          rows.forEach((r, i) => {
            const ry = y + Math.floor(i / 2) * rowGap;
            const col = i % 2;
            const rx = gx + col * (gw / 2);
            this._text(r[0], rx, ry + 8, { size: 9.5, weight: "500", color: C.inkMute });
            this._text(r[1], rx, ry + 24, { size: 11, weight: "700", color: C.ink });
          });
          y += Math.ceil(rows.length / 2) * rowGap + 10;
          if (!tight) {
            const lh = s.leftHitCount || 0;
            const ch = s.centerHitCount || 0;
            const rh = s.rightHitCount || 0;
            const maxHits = Math.max(1, lh, ch, rh);
            this._text("\u5DE6 / \u4E2D / \u53F3\u547D\u4E2D\u5BF9\u6BD4", gx, y + 8, { size: 9.5, weight: "600", color: C.inkMute });
            const barY = y + 18;
            const barW = gw - 46;
            [
              { k: "\u5DE6", v: lh, c: C.pink },
              { k: "\u4E2D", v: ch, c: C.violet },
              { k: "\u53F3", v: rh, c: C.cyan }
            ].forEach((b, i) => {
              const ry = barY + i * 19;
              this._text(b.k, gx, ry + 9, { size: 9, weight: "700", color: b.c });
              rr(ctx, gx + 16, ry, barW, 7, 3.5);
              ctx.fillStyle = "rgba(120,145,175,0.07)";
              ctx.fill();
              const wpx = barW * (b.v / maxHits);
              if (wpx > 1) {
                rr(ctx, gx + 16, ry, wpx, 7, 3.5);
                ctx.fillStyle = b.c;
                ctx.fill();
              }
              this._text(b.v + " \u6B21", gx + gw, ry + 9, {
                size: 9,
                weight: "700",
                color: C.inkSoft,
                align: "right"
              });
            });
            y = barY + 44;
            if (maxHits >= 6 && Math.min(lh, rh) / maxHits < 0.3) {
              this._text("\u5DE6\u53F3\u5DEE\u522B\u8F83\u5927\uFF0C\u5EFA\u8BAE\u4E0B\u6B21\u523B\u610F\u5411" + (lh < rh ? "\u5DE6" : "\u53F3") + "\u4FA7\u591A\u79FB\u52A8", gx, y + 4, {
                size: 9.5,
                weight: "600",
                color: C.gold
              });
              y += 14;
            }
          }
          const by = py + ph - bh - 14;
          const ghostTop = by - (tight ? 40 : 44);
          const tips = this._tips(s);
          const tipH = 34 + Math.min(2, tips.length) * 15;
          const tipTop = ghostTop - 12 - tipH;
          if (tipTop > y) {
            rr(ctx, gx - 4, tipTop, gw + 8, tipH, 10);
            ctx.fillStyle = "rgba(53,230,255,0.06)";
            ctx.fill();
            this._text("\u8BAD\u7EC3\u5EFA\u8BAE", gx + 8, tipTop + 17, { size: 9.5, weight: "700", color: C.cyanDeep });
            tips.slice(0, 2).forEach((t, i) => {
              this._text(t, gx + 8, tipTop + 33 + i * 15, { size: 9, weight: "500", color: C.inkSoft });
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
        _tips(s) {
          const out = [];
          const acc = s.rhythmAccuracy;
          if (acc === null || acc === void 0) {
            out.push("\u672C\u5C40\u6CA1\u6709\u6709\u6548\u5224\u5B9A\u6837\u672C\uFF0C\u5148\u786E\u8BA4\u4F20\u611F\u5668\u4E0E\u97F3\u4E50\u662F\u5426\u6B63\u5E38");
          } else if (acc >= 0.8) {
            out.push("\u8282\u594F\u8DDF\u5F97\u5F88\u7A33\uFF0C\u53EF\u4EE5\u8BD5\u8BD5\u63D0\u9AD8\u4E00\u6863\u96BE\u5EA6\u6216\u6362\u66F4\u5FEB\u7684\u66F2\u76EE");
          } else if (acc >= 0.6) {
            out.push("\u8282\u594F\u57FA\u672C\u8DDF\u4E0A\uFF0C\u6CE8\u610F\u5728\u97F3\u7B26\u5230\u8FBE\u5224\u5B9A\u7EBF\u7684\u77AC\u95F4\u4FDD\u6301\u4E0D\u52A8");
          } else {
            out.push("\u5148\u628A\u901F\u5EA6\u653E\u6162\uFF1A\u52A0\u5927\u5224\u5B9A\u7A97\u53E3\u6216\u5EF6\u957F\u97F3\u7B26\u98DE\u884C\u65F6\u95F4");
          }
          if ((s.wrongDirectionCount || 0) >= Math.max(3, (s.noteCount || 10) * 0.2)) {
            out.push("\u65B9\u5411\u9519\u5F97\u6BD4\u8F83\u591A\uFF0C\u53EF\u4EE5\u5728\u8BBE\u7F6E\u91CC\u8C03\u300C\u5DE6\u53F3\u53CD\u5411\u300D\u6216\u653E\u5927\u8EAB\u4F53\u5E45\u5EA6");
          } else if ((s.miss || 0) > (s.hits || 0)) {
            out.push("\u6F0F\u63A5\u504F\u591A\uFF0C\u5EFA\u8BAE\u964D\u4F4E\u97F3\u7B26\u5BC6\u5EA6\u6216\u5EF6\u957F\u5224\u5B9A\u7A97\u53E3");
          } else if ((s.comboMax || 0) >= 10) {
            out.push("\u8FDE\u51FB\u4E0D\u9519\uFF0C\u4FDD\u6301\u8FD9\u4E2A\u8282\u594F\u7EE7\u7EED\u7EC3");
          }
          return out;
        }
        _gradeRing(x, y, r, grade) {
          const ctx = this.ctx;
          const color = grade === "S" ? "#E8942A" : grade === "A" ? C.cyanDeep : grade === "B" ? "#8A6FE0" : grade === "C" ? "#5E86B8" : C.inkMute;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(120,145,175,0.07)";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = color;
          ctx.stroke();
          this._text(grade, x, y + r * 0.34, { size: r * 0.95, weight: "800", color, align: "center" });
          this._text("\u8BC4\u7EA7", x, y + r + 12, { size: 9, weight: "600", color: C.inkMute, align: "center" });
          ctx.restore();
        }
        // ---------------------------------------------------------------- 模拟面板
        _drawSimPad(vm) {
          const ctx = this.ctx;
          const L = this.L;
          const x = 12;
          const y = L.stageTop + 1;
          const w = this.simOpen ? L.W - 24 : 46;
          const rowH = 26;
          const h = this.simOpen ? 26 + rowH * 2 : 18;
          rr(ctx, x, y, w, h, 9);
          ctx.fillStyle = "rgba(255,226,150,0.55)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(232,148,42,0.45)";
          ctx.stroke();
          this._text("\u6A21\u62DF" + (this.simOpen ? " \u25B4" : " \u25BE"), x + 8, y + (this.simOpen ? 17 : 13), {
            size: 8.5,
            weight: "700",
            color: "#B57A1E"
          });
          this.buttons.push({ id: "sim:toggle", x, y, w: this.simOpen ? 74 : w, h: this.simOpen ? 26 : 18 });
          if (!this.simOpen) return;
          const items = [
            { id: "sim:left", t: "\u5DE6\u79FB" },
            { id: "sim:center", t: "\u56DE\u4E2D" },
            { id: "sim:right", t: "\u53F3\u79FB" },
            { id: "sim:force-left", t: "\u8865\u5DE6\u97F3\u7B26" },
            { id: "sim:force-right", t: "\u8865\u53F3\u97F3\u7B26" },
            { id: "sim:lost", t: "\u6A21\u62DF\u65AD\u7EBF" }
          ];
          const bw = (w - 24 - 8 * 2) / 3;
          items.forEach((it, i) => {
            const bx = x + 12 + i % 3 * (bw + 8);
            const by = y + 30 + Math.floor(i / 3) * rowH;
            this._button(it.id, bx, by, bw, rowH - 4, it.t, { variant: "mini", size: 9.5 });
          });
        }
        // ---------------------------------------------------------------- 基础控件
        _text(str, x, y, o) {
          const opt = o || {};
          const ctx = this.ctx;
          ctx.save();
          ctx.font = (opt.weight || "400") + " " + (opt.size || 12) + "px " + FONT;
          ctx.textAlign = opt.align || "left";
          ctx.textBaseline = opt.baseline || "alphabetic";
          if (opt.alpha !== void 0) ctx.globalAlpha = opt.alpha;
          if (opt.shadow) {
            ctx.shadowColor = "rgba(2,4,12,0.7)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 2;
          }
          if (opt.glow) {
            ctx.shadowColor = opt.glow;
            ctx.shadowBlur = 14;
          }
          ctx.fillStyle = opt.color || C.ink;
          ctx.fillText(String(str), x, y);
          ctx.restore();
        }
        _measure(str, size, weight) {
          const ctx = this.ctx;
          ctx.save();
          ctx.font = (weight || "400") + " " + size + "px " + FONT;
          const w = ctx.measureText(String(str)).width;
          ctx.restore();
          return w;
        }
        _dot(x, y, r, color) {
          const ctx = this.ctx;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        _glass(x, y, w, h, r) {
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = C.shadow;
          ctx.shadowBlur = 24;
          ctx.shadowOffsetY = 10;
          rr(ctx, x, y, w, h, r || 20);
          ctx.fillStyle = "rgba(255,255,255,0.97)";
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, r || 20);
          ctx.lineWidth = 1;
          ctx.strokeStyle = C.line;
          ctx.stroke();
        }
        _button(id, x, y, w, h, label, o) {
          const opt = o || {};
          const ctx = this.ctx;
          const pressed = this.pressed[id] && this.nowMs - this.pressed[id] < 120;
          const scale = pressed ? 0.97 : 1;
          const variant = opt.variant || "ghost";
          const disabled = !!opt.disabled;
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.scale(scale, scale);
          ctx.translate(-(x + w / 2), -(y + h / 2));
          if (disabled) ctx.globalAlpha = 0.45;
          let bg = "rgba(255,255,255,0.92)";
          let fg = C.ink;
          let border = C.line;
          let shadow = "rgba(92,116,148,0.18)";
          if (variant === "primary") {
            const g = ctx.createLinearGradient(x, y, x + w, y + h);
            g.addColorStop(0, "#FFA6C0");
            g.addColorStop(0.55, "#FFB98A");
            g.addColorStop(1, "#FF9E7A");
            bg = g;
            fg = "#FFFFFF";
            border = "rgba(255,255,255,0.6)";
            shadow = "rgba(255,150,150,0.35)";
          } else if (variant === "glass") {
            bg = "rgba(255,255,255,0.95)";
            fg = C.ink;
            border = "rgba(120,145,175,0.28)";
          } else if (variant === "ghostOn") {
            bg = "rgba(206,242,232,0.85)";
            fg = C.mintDeep;
            border = "rgba(94,211,184,0.7)";
          } else if (variant === "panel") {
            bg = "rgba(255,255,255,0.97)";
            fg = C.ink;
            border = "rgba(120,145,175,0.22)";
          } else if (variant === "panelOn") {
            bg = "rgba(214,247,236,0.98)";
            fg = C.mintDeep;
            border = "rgba(94,211,184,0.55)";
          } else if (variant === "mini") {
            bg = "rgba(255,255,255,0.85)";
            fg = C.inkSoft;
            border = C.line;
          } else if (variant === "link") {
            bg = "rgba(0,0,0,0)";
            fg = C.inkMute;
            border = "rgba(0,0,0,0)";
            shadow = "";
          }
          if (shadow) {
            ctx.shadowColor = shadow;
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
          }
          rr(ctx, x, y, w, h, opt.radius || h / 2);
          ctx.fillStyle = bg;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          if (border !== "rgba(0,0,0,0)") {
            ctx.lineWidth = 1;
            ctx.strokeStyle = border;
            ctx.stroke();
          }
          const size = opt.size || 12;
          const hasIcon = !!opt.icon;
          const iconW = hasIcon ? size + 7 : 0;
          const labelW = this._measure(label, size, "700");
          const startX = x + w / 2 - (labelW + iconW) / 2;
          const cyp = y + h / 2;
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
          } else if (name === "check") {
            ctx.moveTo(5, 12.5);
            ctx.lineTo(10, 17.5);
            ctx.lineTo(19, 7);
            ctx.stroke();
          } else if (name === "wave") {
            ctx.moveTo(3, 12);
            ctx.lineTo(6, 12);
            ctx.lineTo(8.5, 6);
            ctx.lineTo(11.5, 18);
            ctx.lineTo(14, 9);
            ctx.lineTo(16.5, 15);
            ctx.lineTo(21, 15);
            ctx.stroke();
          } else if (name === "volume") {
            ctx.moveTo(4, 9.5);
            ctx.lineTo(8, 9.5);
            ctx.lineTo(13, 5);
            ctx.lineTo(13, 19);
            ctx.lineTo(8, 14.5);
            ctx.lineTo(4, 14.5);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.arc(13, 12, 6, -0.9, 0.9);
            ctx.stroke();
          }
          ctx.restore();
        }
        // ---------------------------------------------------------------- 提示
        showHint(text, color) {
          this.hint = { text, color: color || C.ink, at: this.nowMs || Date.now() };
        }
        _drawTransient() {
          const h = this.hint;
          if (!h) return;
          const age = (this.nowMs || Date.now()) - h.at;
          if (age > 2e3) {
            this.hint = null;
            return;
          }
          const alpha = age < 1600 ? 1 : 1 - (age - 1600) / 400;
          const ctx = this.ctx;
          const w = this._measure(h.text, 11.5, "600") + 30;
          const x = (this.W - w) / 2;
          const y = this.L.hudBottom + 8;
          ctx.save();
          ctx.globalAlpha = clamp(alpha, 0, 1);
          rr(ctx, x, y, w, 30, 15);
          ctx.fillStyle = "rgba(10,14,34,0.92)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(120,150,255,0.35)";
          ctx.stroke();
          this._text(h.text, this.W / 2, y + 19, {
            size: 11.5,
            weight: "600",
            color: h.color,
            align: "center"
          });
          ctx.restore();
        }
        // ---------------------------------------------------------------- 交互
        hitTest(x, y) {
          for (let i = this.buttons.length - 1; i >= 0; i--) {
            const b = this.buttons[i];
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
          }
          return "";
        }
        markPress(id) {
          if (id === "sim:toggle") {
            this.simOpen = !this.simOpen;
            return;
          }
          this.pressed[id] = this.nowMs || Date.now();
        }
      };
      module.exports = { RhythmRenderer: RhythmRenderer2, C };
    }
  });

  // tools/rhythm-preview/wx-stub.js
  function installWx() {
    if (typeof window === "undefined") return;
    const read = (k) => {
      try {
        const raw = window.localStorage.getItem("rhythmprev:" + k);
        return raw === null ? "" : JSON.parse(raw);
      } catch (e) {
        return "";
      }
    };
    const write = (k, v) => {
      try {
        window.localStorage.setItem("rhythmprev:" + k, JSON.stringify(v));
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

  // tools/rhythm-preview/main.js
  installWx();
  var { getStore } = require_rhythm_config();
  var { songById } = require_rhythm_songs();
  var { RhythmEngine } = require_engine();
  var { RhythmRenderer } = require_renderer();
  var params = new URLSearchParams(window.location.search);
  var CSS_W = Math.max(280, Number(params.get("w")) || 390);
  var CSS_H = Math.max(480, Number(params.get("h")) || 844);
  var FROZEN = /[?&]freeze=1/.test(window.location.search);
  var canvas = document.getElementById("stage");
  var dpr = Math.min(window.devicePixelRatio || 2, 2);
  var screenEl = document.querySelector(".screen");
  if (screenEl && /[?&]bare=1/.test(window.location.search)) {
    document.body.classList.add("bare");
    screenEl.style.width = CSS_W + "px";
    screenEl.style.height = CSS_H + "px";
  }
  canvas.width = Math.round(CSS_W * dpr);
  canvas.height = Math.round(CSS_H * dpr);
  canvas.style.width = CSS_W + "px";
  canvas.style.height = CSS_H + "px";
  var PreviewClock = class {
    constructor(song) {
      this.song = song;
      this.t = 0;
      this.state = "idle";
      this.pausedAt = 0;
      this.isSilent = false;
      this.beatMs = song ? 6e4 / song.bpm : 500;
    }
    setSong(song) {
      this.song = song;
      if (song) this.beatMs = 6e4 / song.bpm;
      return this;
    }
    start() {
      this.state = "playing";
      this.t = 0;
      return this;
    }
    pause() {
      if (this.state === "playing") {
        this.pausedAt = this.t;
        this.state = "paused";
      }
      return this;
    }
    resume() {
      if (this.state === "paused") this.state = "playing";
      return this;
    }
    stop() {
      this.state = "idle";
      this.t = 0;
      return this;
    }
    nowMs() {
      return this.state === "paused" ? this.pausedAt : this.t;
    }
    beatPhase() {
      const m = (this.t % this.beatMs + this.beatMs) % this.beatMs;
      return m / this.beatMs;
    }
    syncVolume() {
    }
    destroyAudio() {
    }
    advance(ms) {
      if (this.state === "playing") this.t += ms;
      return this.t;
    }
  };
  var cfg = getStore();
  cfg.reset();
  var clock = new PreviewClock(songById(cfg.get("songId")));
  var engine = new RhythmEngine({ cfg, clock });
  engine.setSimMode(true);
  var renderer = new RhythmRenderer({
    canvas,
    ctx: canvas.getContext("2d"),
    engine,
    cfg
  });
  renderer.resize(CSS_W, CSS_H, dpr);
  var DT = 1 / 60;
  function simulate(ms, each) {
    const steps = Math.max(1, Math.round(ms / (DT * 1e3)));
    for (let i = 0; i < steps; i++) {
      clock.advance(DT * 1e3);
      if (each) each(i);
      engine.update(DT);
      engine.drainEvents();
    }
  }
  function runCountdown() {
    let guard = 0;
    while (engine.state === "COUNTDOWN" && guard < 2e3) {
      engine.update(DT);
      engine.drainEvents();
      guard += 1;
    }
  }
  function autoTarget() {
    const next = engine.active.find((n) => !n.judged);
    if (!next) return;
    if (clock.t >= next.targetTimeMs - 160) {
      engine.setSimTarget(next.targetSide === "left" ? -1 : next.targetSide === "right" ? 1 : 0);
    }
  }
  var scenario = (params.get("screen") || "").toLowerCase();
  var frozen = FROZEN;
  if (scenario === "prepare") {
    engine.prepare();
  } else if (scenario === "calib") {
    engine.prepare();
    engine.startPreview();
    simulate(700);
  } else if (scenario === "play" || scenario === "combo") {
    engine.prepare();
    engine.startCountdown();
    runCountdown();
    const targetHits = scenario === "combo" ? 18 : 6;
    let guard = 0;
    while (engine.state === "PLAYING" && engine.score.hits < targetHits && guard < 6e3) {
      autoTarget();
      clock.advance(DT * 1e3);
      engine.update(DT);
      engine.drainEvents();
      guard += 1;
    }
    simulate(180);
  } else if (scenario === "pause") {
    engine.prepare();
    engine.startCountdown();
    runCountdown();
    simulate(6e3, autoTarget);
    engine.pause();
  } else if (scenario === "sensor") {
    engine.prepare();
    engine.startCountdown();
    runCountdown();
    simulate(5e3, autoTarget);
    engine.enterSensorError("preview");
  } else if (scenario === "result") {
    cfg.patch({ durationSec: 30 }, "preview");
    engine.prepare();
    engine.startCountdown();
    runCountdown();
    simulate(26e3, autoTarget);
    engine.finish("timeout");
    frozen = true;
  }
  var last = 0;
  function loop(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1e3) : 1 / 60;
    last = ts;
    if (!frozen) {
      clock.advance(dt * 1e3);
      if (engine.state === "PLAYING") autoTarget();
      engine.update(dt);
      engine.drainEvents();
    }
    renderer.render(frozen ? 0 : dt, Date.now());
    updateStateText();
    window.requestAnimationFrame(loop);
  }
  var STATE_TEXT = {
    IDLE: "\u4ECB\u7ECD\u9875",
    READY: "\u51C6\u5907\u9875",
    CALIBRATING: "\u6807\u5B9A\u4E2D",
    COUNTDOWN: "\u9884\u5907\u62CD",
    PLAYING: "\u6E38\u620F\u4E2D",
    PAUSED: "\u5DF2\u6682\u505C",
    SENSOR_ERROR: "\u4FE1\u53F7\u4E2D\u65AD",
    RESULT: "\u7ED3\u7B97\u9875",
    ABORTED: "\u5DF2\u4E2D\u6B62"
  };
  function updateStateText() {
    const el = document.getElementById("state");
    if (el) el.textContent = (frozen ? "\uFF08\u5DF2\u5B9A\u683C\uFF09" : "") + (STATE_TEXT[engine.state] || engine.state);
    const live = document.getElementById("live");
    if (live) {
      live.textContent = "\u5F97\u5206 " + engine.score.total + " \xB7 P " + engine.score.perfect + " / G " + engine.score.great + " / GD " + engine.score.good + " \xB7 MISS " + engine.score.miss + " \xB7 \u8FDE\u51FB " + engine.score.combo + " \xB7 \u97F3\u7B26 " + engine.active.length + " \xB7 \u65F6\u95F4 " + (clock.t / 1e3).toFixed(1) + "s";
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
  });
  bind("btn-play", () => {
    frozen = false;
    engine.prepare();
    engine.startCountdown();
  });
  bind("btn-fast", () => {
    if (engine.state === "COUNTDOWN") runCountdown();
    simulate(4e3, autoTarget);
  });
  bind("btn-pause", () => {
    frozen = false;
    engine.togglePause();
  });
  bind("btn-sensor", () => {
    frozen = false;
    engine.enterSensorError("preview");
  });
  bind("btn-result", () => {
    frozen = false;
    if (engine.state === "PLAYING" || engine.state === "PAUSED") engine.finish("timeout");
  });
  bind("btn-freeze", () => {
    frozen = true;
  });
  var simX = document.getElementById("sim-x");
  if (simX) {
    simX.addEventListener("input", () => {
      engine.setSimTarget(Number(simX.value));
      const lx = document.getElementById("sim-x-val");
      if (lx) lx.textContent = Number(simX.value).toFixed(2);
    });
  }
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
      engine.startCountdown();
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
      engine.startCountdown();
      return;
    }
    if (id === "calib:play") {
      engine.previewing ? engine.stopPreview() : engine.startPreview();
      return;
    }
    if (id === "calib:minus") {
      cfg.set("syncOffsetMs", (Number(cfg.get("syncOffsetMs")) || 0) - 5);
      return;
    }
    if (id === "calib:plus") {
      cfg.set("syncOffsetMs", (Number(cfg.get("syncOffsetMs")) || 0) + 5);
      return;
    }
    if (id === "beat") {
      cfg.set("beatPulseOn", !cfg.get("beatPulseOn"));
      return;
    }
    if (id === "vol") {
      cfg.set("musicVolume", ((Number(cfg.get("musicVolume")) || 0.7) + 0.3) % 1.1);
      return;
    }
    if (id.indexOf("song:") === 0) {
      cfg.set("songId", id.slice(5));
      engine.syncSong();
      clock.setSong(engine.song);
      return;
    }
    if (id.indexOf("lv:") === 0) {
      cfg.applyDifficulty(Number(id.slice(3)));
      return;
    }
    if (id === "sim:left") {
      engine.nudgeSim(-0.45);
      return;
    }
    if (id === "sim:right") {
      engine.nudgeSim(0.45);
      return;
    }
    if (id === "sim:center") {
      engine.centerSim();
      return;
    }
    if (id === "sim:force-left") {
      engine.debugPushNote("left", 1400);
      return;
    }
    if (id === "sim:force-right") {
      engine.debugPushNote("right", 1400);
      return;
    }
    if (id === "sim:lost") {
      engine.enterSensorError("sim");
      return;
    }
    if (id === "quit" || id === "exit" || id === "home") {
      engine.finish("aborted");
      return;
    }
    renderer.showHint("\u9884\u89C8\u9875\u4E0D\u8DF3\u8F6C\uFF1A" + id, "#B9F4FF");
  }
  if (scenario !== "bg") window.requestAnimationFrame(loop);
})();
