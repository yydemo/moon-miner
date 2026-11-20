'use strict';
/* core.js — 通用工具、存档、声音、输入、画布 / shared utilities, save data, sound, input, canvas */

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = Math.PI * 2;
// 角度归一化到 (-π, π] / wrap an angle to (-π, π]
const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
// 可设种子的随机数 / seeded RNG
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let q = Math.imul(a ^ a >>> 15, 1 | a); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }
const fmtInt = n => Math.round(n).toLocaleString('en-US');
// 距离格式化 / distance formatting
function fmtDist(m) { const a = Math.abs(m); return a >= 1e6 ? (m / 1000).toFixed(0) + ' km' : a >= 1e4 ? (m / 1000).toFixed(1) + ' km' : a >= 1000 ? (m / 1000).toFixed(2) + ' km' : m.toFixed(0) + ' m'; }
function fmtTime(s) { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = Math.floor(s % 60); return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + (d ? '' : m + 'm ') + (d || h ? '' : ss + 's'); }

// ===== 存档（localStorage，v2，可从 v1 迁移）/ Save data (localStorage, v2, migrates from v1) =====
const SAVE_KEY = 'moonMiner.save.v2', SAVE_KEY_V1 = 'moonMiner.save.v1';
function defaultSave() {
  return { v: 2, funds: 0, high: 0, lang: 'zh', muted: false, up: { tool: 0, bay: 0, power: 0, sic: 0, ai: 0, shell: 0 },
    unlocked: {}, ms: {}, rocket: DEFAULT_ROCKET.slice(), stats: { runs: 0, lots: 0, sold: 0 }, migrated: 0 };
}
let migrateNote = 0;
function loadSave() {
  const d = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') {
      const out = Object.assign(d, s, { up: Object.assign(d.up, s.up), unlocked: Object.assign({}, s.unlocked), ms: Object.assign({}, s.ms), stats: Object.assign(d.stats, s.stats) });
      if (!Array.isArray(out.rocket) || !out.rocket.every(p => PARTS[p])) out.rocket = DEFAULT_ROCKET.slice();
      return out;
    }
    // 旧版 v1 存档迁移：积分 ×100 → 资金（¥），保留语言/静音/局数
    // Migrate a v1 save: credits ×100 → funds (¥); keep language / mute / run count
    const o = JSON.parse(localStorage.getItem(SAVE_KEY_V1));
    if (o && typeof o === 'object') {
      d.funds = Math.max(0, Math.round((o.credits || 0) * 100)); d.lang = o.lang === 'en' ? 'en' : 'zh'; d.muted = !!o.muted;
      d.stats.runs = (o.stats && o.stats.runs) || 0; d.migrated = Date.now(); migrateNote = d.funds;
      return d;
    }
  } catch (e) { /* 存档损坏则重置 / reset on a corrupt save */ }
  return d;
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 隐私模式可能失败 / may fail in private mode */ } }
if (migrateNote) persist();
const isUnlocked = id => PARTS[id].cost === 0 || !!save.unlocked[id];

// 取当前语言文本，支持 {0} 占位 / text in the current language with {0} placeholders
function t(key, ...args) {
  let s = (I18N[save.lang] && I18N[save.lang][key]) ?? I18N.zh[key] ?? key;
  if (typeof s === 'string') args.forEach((a, i) => { s = s.split('{' + i + '}').join(a); });
  return s;
}
const L2 = o => o[save.lang] || o.zh; // 取 {zh,en} 对象的当前语言 / pick from a {zh,en} object

// ===== SHA-256（区块链账本用，纯 JS 原创实现）/ SHA-256 (for the ledger; original pure-JS implementation) =====
const sha256 = (() => {
  const K = new Uint32Array(64);
  // 前 64 个质数立方根的小数部分 / fractional parts of cube roots of the first 64 primes
  for (let n = 2, i = 0; i < 64; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) { K[i++] = (Math.cbrt(n) % 1) * 4294967296 >>> 0; } }
  const H0 = []; for (let n = 2, i = 0; i < 8; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) { H0[i++] = (Math.sqrt(n) % 1) * 4294967296 >>> 0; } }
  const enc = new TextEncoder(), Wt = new Uint32Array(64);
  return function (str) {
    const msg = enc.encode(str), l = msg.length, nb = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(nb);
    b.set(msg); b[l] = 0x80; const bits = l * 8; const dv = new DataView(b.buffer);
    dv.setUint32(nb - 4, bits >>> 0); dv.setUint32(nb - 8, Math.floor(bits / 4294967296));
    const h = H0.slice();
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) Wt[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = Wt[i - 15], c = Wt[i - 2];
        const s0 = (a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ (a >>> 3), s1 = (c >>> 17 | c << 15) ^ (c >>> 19 | c << 13) ^ (c >>> 10);
        Wt[i] = (Wt[i - 16] + s0 + Wt[i - 7] + s1) >>> 0;
      }
      let [A, B, C, D, E, F, G, Hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = (E >>> 6 | E << 26) ^ (E >>> 11 | E << 21) ^ (E >>> 25 | E << 7), ch = (E & F) ^ (~E & G);
        const t1 = (Hh + S1 + ch + K[i] + Wt[i]) >>> 0;
        const S0 = (A >>> 2 | A << 30) ^ (A >>> 13 | A << 19) ^ (A >>> 22 | A << 10), mj = (A & B) ^ (A & C) ^ (B & C);
        const t2 = (S0 + mj) >>> 0;
        Hh = G; G = F; F = E; E = (D + t1) >>> 0; D = C; C = B; B = A; A = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + A) >>> 0; h[1] = (h[1] + B) >>> 0; h[2] = (h[2] + C) >>> 0; h[3] = (h[3] + D) >>> 0;
      h[4] = (h[4] + E) >>> 0; h[5] = (h[5] + F) >>> 0; h[6] = (h[6] + G) >>> 0; h[7] = (h[7] + Hh) >>> 0;
    }
    return h.map(x => x.toString(16).padStart(8, '0')).join('');
  };
})();

// ===== 画布与高清屏适配 / Canvas & devicePixelRatio =====
const cv = $('game'), mainCtx = cv.getContext('2d');
let ctx = mainCtx; // 当前绘图上下文（可临时切换到小画布）/ current drawing context (can switch to small canvases)
function withCtx(c, fn) { const old = ctx; ctx = c; try { fn(); } finally { ctx = old; } }
let W = 0, H = 0, DPR = 1, TS = 40; // TS = 采矿格子像素 / mining tile size in CSS px
let tileCache = {};
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2); // 手机上限 2 倍以保性能 / cap at 2× for phone performance
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  mainCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  TS = Math.round(clamp(Math.min(W, H) / 10, 30, 60));
  tileCache = {};
  if (typeof onResize === 'function') onResize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
const STARS = (() => { const r = mulberry32(42), a = []; for (let i = 0; i < 160; i++) a.push({ x: r(), y: r(), s: r() * 1.4 + 0.3, p: r() * 6.28 }); return a; })();
let clock = 0;

// ===== 声音（WebAudio 合成）/ Sound (synthesised with WebAudio) =====
const audio = {
  ac: null, engGain: null, noiseBuf: null,
  unlock() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const len = this.ac.sampleRate, buf = this.ac.createBuffer(1, len, this.ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const src = this.ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      this.engGain = this.ac.createGain(); this.engGain.gain.value = 0;
      src.connect(f); f.connect(this.engGain); this.engGain.connect(this.ac.destination); src.start();
    }
    if (this.ac.state === 'suspended') this.ac.resume();
  },
  engine(level) { if (this.engGain) this.engGain.gain.setTargetAtTime(save.muted ? 0 : level * 0.22, this.ac.currentTime, 0.05); },
  tone(freq, dur, type = 'square', vol = 0.06, slide = 0, delay = 0) {
    if (!this.ac || save.muted) return;
    const t0 = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  boom(vol = 0.35, dur = 0.8) {
    if (!this.ac || save.muted) return;
    const s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain(), t0 = this.ac.currentTime;
    s.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(60, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.ac.destination); s.start(t0); s.stop(t0 + dur);
  },
  dig() { this.tone(90 + Math.random() * 60, 0.05, 'sawtooth', 0.03); },
  coin() { this.tone(880, 0.08, 'square', 0.05); this.tone(1320, 0.12, 'square', 0.05, 0, 0.07); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, 0, i * 0.11)); },
  click() { this.tone(660, 0.05, 'triangle', 0.05); }
};

// ===== 输入：键盘 + 多点触控按键 / Input: keyboard + multi-touch buttons =====
// 持续键 / held keys: left right up down thrust ; 单击键 / tap keys via taps set
const input = { left: false, right: false, up: false, down: false, thrust: false };
const taps = new Set();
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'stage', KeyZ: 'full', KeyX: 'cut', KeyM: 'map', Comma: 'warpDown', Period: 'warpUp', KeyT: 'sas', KeyP: 'pause', Escape: 'pause', KeyN: 'mute', KeyE: 'mint', Enter: 'stage' };
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault(); audio.unlock();
  if (k in input) { if (!input[k]) taps.add(k); input[k] = true; } else if (!e.repeat) taps.add(k);
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k && k in input) input[k] = false; });
// 带 data-k 的按钮：按住型或单击型 / buttons with data-k: hold-type or tap-type
function bindButtons(root) {
  root.querySelectorAll('[data-k]').forEach(b => {
    if (b._bound) return; b._bound = true;
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); audio.unlock(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 / ignore */ } if (k in input) input[k] = true; taps.add(k); b.classList.add('down'); };
    const off = () => { if (k in input) input[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
}
document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
function clearInput() { for (const k in input) input[k] = false; document.querySelectorAll('[data-k].down').forEach(b => b.classList.remove('down')); }

// ===== 界面工具 / UI helpers =====
function toast(msg) {
  const box = $('toasts'); while (box.children.length >= 3) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; box.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
const toastTimes = {};
function toastOnce(key, msg, gap = 3) { const now = performance.now() / 1000; if (now - (toastTimes[key] || -99) < gap) return; toastTimes[key] = now; toast(msg); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
// 里程碑 / milestones
function awardMilestone(id) {
  if (save.ms[id]) return 0;
  const m = MILESTONES.find(x => x.id === id); if (!m) return 0;
  save.ms[id] = Date.now(); save.funds += m.reward; persist();
  toast(t('msReward', msName(id), fmtInt(m.reward))); audio.win();
  if (typeof run === 'object' && run) run.ms += m.reward;
  return m.reward;
}
function msName(id) { return t('ms_' + id, (BODIES.earth.atmo / 1000).toFixed(0), (BODIES.earth.atmo / 1000).toFixed(0)); }

// ===== 共享绘图 / Shared drawing =====
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawStars(alpha, dx = 0, dy = 0) {
  if (alpha <= 0) return;
  ctx.fillStyle = '#fff';
  for (const s of STARS) {
    ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(clock * 2 + s.p));
    ctx.fillRect(((s.x * W + dx * s.s) % W + W) % W, ((s.y * H + dy * s.s) % H + H) % H, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}
function drawEarthIcon(x, y, r) {
  ctx.fillStyle = '#2a6fc9'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (r > 3) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip(); ctx.fillStyle = '#3fae5a';
    [[-0.3, -0.2, 0.35], [0.25, 0.15, 0.3], [-0.05, 0.45, 0.2], [0.45, -0.4, 0.18]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, rr * r, rr * r * 0.7, dx * 3, 0, TAU); ctx.fill(); });
    ctx.restore();
    ctx.strokeStyle = 'rgba(140,200,255,.45)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.beginPath(); ctx.arc(x, y, r * 1.04, 0, TAU); ctx.stroke();
  }
}
function drawMoonIcon(x, y, r) {
  ctx.fillStyle = '#b9b6ae'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (r > 3) { ctx.fillStyle = 'rgba(90,88,84,.45)'; [[-0.3, -0.25, 0.18], [0.3, 0.1, 0.22], [-0.1, 0.4, 0.13], [0.35, -0.45, 0.1]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, TAU); ctx.fill(); }); }
}
// CMR 机器人（原创矢量画：圆盘形扫地机底盘 + 激光雷达 + 不锈钢壳 + 钻探臂）
// CMR rover (original vector art: disc robot-vacuum chassis + LiDAR + stainless shell + drill arm)
// size = 宽度像素 / width in px；(x,y) = 轮子底部中心 / bottom centre of wheels
function drawRover(x, y, size, face = 1, armAng = 0, digging = false, dead = false) {
  const s = size / 40;
  ctx.save(); ctx.translate(x, y); ctx.scale(face * s, s);
  ctx.fillStyle = '#25272c'; // 差速轮 / differential wheels
  ctx.beginPath(); ctx.arc(-11, -4.5, 4.5, 0, TAU); ctx.arc(11, -4.5, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#80868f'; ctx.beginPath(); ctx.arc(-11, -4.5, 1.8, 0, TAU); ctx.arc(11, -4.5, 1.8, 0, TAU); ctx.fill();
  // 圆盘机身（316L 不锈钢）/ disc body (316L stainless)
  const g = ctx.createLinearGradient(0, -20, 0, -6); g.addColorStop(0, dead ? '#6b6b6b' : '#e9edf2'); g.addColorStop(1, dead ? '#4a4a4a' : '#9aa3ae');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -12, 18, 7.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#5d6672'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(0, -12, 18, 7.5, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#4b5563'; ctx.fillRect(-17, -12, 34, 1.2);
  // 太阳能板 / solar panel
  ctx.fillStyle = '#25427f'; ctx.fillRect(-14, -21, 11, 3); ctx.strokeStyle = '#7fa6ff'; ctx.lineWidth = 0.4; for (let i = -13; i < -3; i += 2.5) { ctx.beginPath(); ctx.moveTo(i, -21); ctx.lineTo(i, -18); ctx.stroke(); }
  // 激光雷达塔 / LiDAR turret
  ctx.fillStyle = '#30343b'; roundRect(1, -24, 7, 5, 1.5); ctx.fill();
  ctx.fillStyle = dead ? '#444' : (Math.sin(clock * 8) > 0 ? '#5cff8a' : '#1f8f4a'); ctx.fillRect(2.2, -22.4, 4.6, 1.4);
  // 天线 / antenna
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-6, -19); ctx.lineTo(-7, -29); ctx.stroke();
  ctx.fillStyle = dead ? '#555' : '#ffd166'; ctx.beginPath(); ctx.arc(-7, -29.5, 1.4, 0, TAU); ctx.fill();
  // 钻探臂 / drill arm
  ctx.save(); ctx.translate(13, -12); ctx.rotate(armAng);
  ctx.fillStyle = '#c99a2e'; roundRect(0, -2, 10, 4, 1.8); ctx.fill();
  ctx.translate(10, 0);
  ctx.fillStyle = '#b8bec9'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(9, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7d8592'; ctx.lineWidth = 0.9;
  const sp = digging ? (clock * 40) % 3 : 0;
  for (let i = 0; i < 3; i++) { const xx = i * 3 + sp; ctx.beginPath(); ctx.moveTo(xx, -4 + xx * 0.45); ctx.lineTo(xx + 1.5, 4 - xx * 0.45); ctx.stroke(); }
  ctx.restore();
  ctx.restore();
}
