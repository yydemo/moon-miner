'use strict';
/* flight.js — 二维飞行物理、时间加速、地图视图与自动驾驶（原创）
 * 2D flight physics, time warp, map view and autopilot (original code)
 * 物理：拼接圆锥曲线（只受当前引力体作用），地球有指数大气与自转；高倍加速时走开普勒解析轨道。
 * Physics: patched conics (only the current body pulls), Earth has an exponential atmosphere and rotation;
 * high time warp switches to analytic Kepler propagation ("on rails"). */

const WARPS = [1, 2, 4, 10, 50, 100, 1000, 10000, 100000];
const PHYS_WARP_MAX = 4; // 物理积分允许的最高倍率 / highest warp integrated with physics
const EARTH_W = TAU / BODIES.earth.rotP;
let F = null; // 当前飞行 / current flight

// 月面地形（米）/ lunar terrain (m)
function moonTerrain(th) { return 150 * Math.sin(23 * th + 1) + 60 * Math.sin(71 * th + 2) + 25 * Math.sin(203 * th); }
function surfR(body, th) { return body === 'moon' ? BODIES.moon.R + moonTerrain(th) : BODIES.earth.R; }

function newFlight(parts) {
  const E = BODIES.earth, th = Math.PI / 2;
  moonA0 = Math.random() * TAU;
  F = { t: 0, parts: parts.slice(), segs: null, body: 'earth', x: E.R * Math.cos(th), y: E.R * Math.sin(th), vx: 0, vy: 0,
    ang: th, av: 0, thr: 0, ignited: false, landed: true, warpIdx: 0, rails: null, sas: 'hold', auto: null, autoMem: {},
    map: false, zoom: 0, mapScale: 0, mapFocus: 'vessel', mapPan: [0, 0], debris: [], fx: [], maxAlt: 0, crashed: false, crashT: 0,
    over: false, pred: null, predT: 0, snapMoon: null, launchParts: parts.slice(), thrusting: false, lastStageT: -9 };
  F.vx = -EARTH_W * F.y; F.vy = EARTH_W * F.x;
  rebuildSegs();
  F.zoom = defaultZoom();
  return F;
}
function rebuildSegs(old) {
  const segs = splitSegments(F.parts);
  segs.forEach(s => { s.fuelMax = s.fuel; });
  if (old) { // 保留各级（自下而上对齐）的燃料 / keep each stage's fuel (aligned from the bottom)
    for (let k = 1; k <= segs.length; k++) { const o = old[old.length - k]; if (o) segs[segs.length - k].fuel = Math.min(segs[segs.length - k].fuelMax, o.fuel); }
  }
  F.segs = segs;
}
const hasPart = id => F.parts.includes(id);
const legsTol = () => F.parts.reduce((m, id) => PARTS[id].kind === 'legs' ? Math.max(m, PARTS[id].tol) : m, 0) || 2;
function stackHeight() { let h = 0; for (const id of F.parts) h += PARTS[id].h; return h; }
function stackWidth() { let w = 0; for (const id of F.parts) w = Math.max(w, PARTS[id].w); return w; }
function defaultZoom() { return clamp(Math.min(W, H) * 0.55 / Math.max(6, stackHeight()), 2, 60); }
function vesselMass() { let m = 0; for (const s of F.segs) m += s.dry + s.fuel; if (hasPart('bay')) m += roverMassKg(save.up) / 1000; return m; }
function activeSeg() { return F.segs[F.segs.length - 1]; }
function totalFuel() { return F.segs.reduce((a, s) => a + s.fuel, 0); }
function altitude() { const r = Math.hypot(F.x, F.y); return r - surfR(F.body, Math.atan2(F.y, F.x)); }
function pressure() { return F.body === 'earth' ? Math.exp(-Math.max(0, altitude()) / BODIES.earth.H) : 0; }
function maxThrust() { const s = activeSeg(); return s && s.fuel > 0 && F.ignited ? engineStats(s.engines, pressure()).thrust : 0; }
// 相对地面速度 / surface-relative velocity
function surfVel() { return F.body === 'earth' ? [F.vx + EARTH_W * F.y, F.vy - EARTH_W * F.x] : [F.vx, F.vy]; }

// ===== 分级 / Staging =====
function doStage() {
  if (F.crashed || F.over) return;
  if (!F.ignited) { F.ignited = true; if (F.thr === 0) F.thr = 1; toast(t('ignite')); audio.boom(0.15, 0.5); F.lastStageT = F.t; return; }
  if (F.segs.length <= 1) return;
  const seg = F.segs[F.segs.length - 1], cut = seg.idx[0];
  const dropped = F.parts.slice(cut);
  const mass = seg.dry + seg.fuel;
  F.debris.push({ parts: dropped, x: F.x, y: F.y, vx: F.vx, vy: F.vy, ang: F.ang, av: (Math.random() - 0.5) * 0.4, life: 12, mass });
  // 新的底部：向上移到被分离部分的顶端 / new bottom point: move up to the top of the dropped part
  let hh = 0; for (const id of dropped) hh += PARTS[id].h;
  F.x += Math.cos(F.ang) * hh; F.y += Math.sin(F.ang) * hh;
  const old = F.segs; F.parts = F.parts.slice(0, cut); F.segs = old.slice(0, -1);
  // 被分离部分轻推一下 / give the dropped part a small push
  const dbr = F.debris[F.debris.length - 1]; dbr.vx -= Math.cos(F.ang) * 2; dbr.vy -= Math.sin(F.ang) * 2;
  F.lastStageT = F.t; F.rails = null;
  toast(t('staged')); audio.boom(0.2, 0.4);
  for (let i = 0; i < 24; i++) addFx(F.x, F.y, F.vx + (Math.random() - 0.5) * 8, F.vy + (Math.random() - 0.5) * 8, 0.8, '#ffffff', 0.4);
}
function jettisonFairing() {
  const i = F.parts.indexOf('fairing'); if (i < 0) return;
  F.debris.push({ parts: ['fairing'], x: F.x + Math.cos(F.ang) * stackHeight(), y: F.y + Math.sin(F.ang) * stackHeight(), vx: F.vx + Math.cos(F.ang + 0.5) * 4, vy: F.vy + Math.sin(F.ang + 0.5) * 4, ang: F.ang, av: 0.8, life: 8, mass: 0.15 });
  const old = F.segs; F.parts = F.parts.filter((_, k) => k !== i); rebuildSegs(old);
  toast(t('fairingOff'));
}

// ===== 粒子 / Particles =====
function addFx(x, y, vx, vy, life, color, size) { if (F.fx.length < 260) F.fx.push({ x, y, vx, vy, life, max: life, color, size }); }

// ===== 物理一步 / One physics step =====
function physStep(h) {
  const B = BODIES[F.body], r = Math.hypot(F.x, F.y), ux = F.x / r, uy = F.y / r;
  let ax = -B.mu * F.x / (r * r * r), ay = -B.mu * F.y / (r * r * r);
  const m = vesselMass(), seg = activeSeg(), p = pressure();
  F.thrusting = false;
  if (F.ignited && seg && seg.engines.length && seg.fuel > 0 && F.thr > 0) {
    const es = engineStats(seg.engines, p), T = es.thrust * F.thr, mdot = T / (es.isp * G0);
    seg.fuel = Math.max(0, seg.fuel - mdot * h);
    ax += Math.cos(F.ang) * T / m; ay += Math.sin(F.ang) * T / m;
    F.thrusting = true;
    if (seg.fuel <= 0 && !F.auto) toastOnce('nofuel', t('noFuel'));
  }
  // 大气阻力 / atmospheric drag
  if (F.body === 'earth') {
    const alt = r - B.R;
    if (alt < B.atmo) {
      const rho = B.rho0 * Math.exp(-alt / B.H), [rx, ry] = surfVel(), vr = Math.hypot(rx, ry);
      if (vr > 0.01) {
        const wd = stackWidth(), A = Math.PI * wd * wd / 4, cd = hasPart('fairing') ? 0.35 : 0.6;
        const fd = 0.5 * rho * vr * vr * cd * A / (m * 1000);
        ax -= rx / vr * fd; ay -= ry / vr * fd;
      }
    }
  }
  if (F.landed) {
    const radial = ax * ux + ay * uy;
    if (radial > 0.05) F.landed = false; // 推力大于重力 → 起飞 / thrust beats gravity → lift-off
    else { pinToSurface(h); return; }
  }
  F.vx += ax * h; F.vy += ay * h; F.x += F.vx * h; F.y += F.vy * h;
}
// 着陆时固定在地面（地球随自转）/ pinned to the ground while landed (rotating with Earth)
function pinToSurface(h) {
  if (F.body === 'earth') {
    const c = Math.cos(EARTH_W * h), s = Math.sin(EARTH_W * h), x = F.x * c - F.y * s, y = F.x * s + F.y * c;
    F.x = x; F.y = y; F.ang += EARTH_W * h; F.vx = -EARTH_W * F.y; F.vy = EARTH_W * F.x;
  } else { F.vx = 0; F.vy = 0; }
}
// 姿态控制（反作用轮）/ attitude control (reaction wheels)
function attitude(dt, wantDir) {
  const m = vesselMass(), maxRate = clamp(1.4 / Math.sqrt(Math.max(1, m) / 3), 0.12, 1.4), acc = maxRate * 2.5;
  let target = 0;
  const manual = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (manual) { target = manual * maxRate; if (F.auto) { F.auto = null; toast(t('auto') + ' ✕'); } }
  else if (wantDir !== null) target = clamp(wrapPi(wantDir - F.ang) * 2.2, -maxRate, maxRate);
  else if (F.sas === 'off') target = F.av;
  const d = target - F.av; F.av += clamp(d, -acc * dt, acc * dt);
  if (F.landed && !F.thrusting) F.av = 0;
  F.ang += F.av * dt;
}
function sasDir() {
  if (F.sas === 'pro' || F.sas === 'retro') {
    const [vx, vy] = altitude() < 30000 && F.body === 'earth' ? surfVel() : [F.vx, F.vy];
    if (Math.hypot(vx, vy) < 0.5) return null;
    const a = Math.atan2(vy, vx); return F.sas === 'pro' ? a : a + Math.PI;
  }
  return null;
}

// ===== 时间加速 / Time warp =====
function allowedWarp() {
  if (F.crashed) return 1;
  if (F.landed) return F.thr > 0 && F.ignited ? 1 : 1000;
  const alt = altitude(), sp = Math.hypot(F.vx, F.vy);
  if (F.thrusting) return PHYS_WARP_MAX;
  if (F.body === 'earth' && alt < BODIES.earth.atmo) return PHYS_WARP_MAX;
  return Math.max(PHYS_WARP_MAX, alt * 20 / Math.max(1, sp));
}
function setWarp(i) { F.warpIdx = clamp(i, 0, WARPS.length - 1); }
function warpTo(dtRemain) { // 自动加速到某个时刻 / auto-warp towards a moment
  let i = 0; for (let k = WARPS.length - 1; k >= 0; k--) { if (WARPS[k] / 60 * 4 < dtRemain) { i = k; break; } }
  setWarp(i);
}

// ===== 每帧更新 / Per-frame update =====
function updateFlight(dt) {
  if (taps.has('stage')) doStage();
  if (taps.has('full')) F.thr = 1;
  if (taps.has('cut')) F.thr = 0;
  if (taps.has('map')) F.map = !F.map;
  if (taps.has('warpUp')) setWarp(F.warpIdx + 1);
  if (taps.has('warpDown')) setWarp(F.warpIdx - 1);
  if (taps.has('sas')) cycleSAS();
  if (input.up) F.thr = clamp(F.thr + dt * 0.8, 0, 1);
  if (input.down) F.thr = clamp(F.thr - dt * 0.8, 0, 1);
  if (F.crashed) { F.crashT += dt; stepFx(dt); stepDebris(dt); if (F.crashT > 1.6 && !F.over) flightFailed(); return; }
  let want = sasDir();
  if (F.auto) want = autopilot(dt);
  if ((F.thr > 0 && F.ignited) || input.left || input.right) { if (WARPS[F.warpIdx] > PHYS_WARP_MAX) setWarp(0); }
  const allowed = allowedWarp();
  while (F.warpIdx > 0 && WARPS[F.warpIdx] > allowed) { F.warpIdx--; if (!F.auto) toastOnce('warp', t('warpLimited'), 6); }
  const w = WARPS[F.warpIdx];
  attitude(dt * Math.min(w, PHYS_WARP_MAX), want);
  if (w > PHYS_WARP_MAX && !F.landed) {
    // 解析轨道 / on rails
    if (!F.rails) { const o = elements(F.x, F.y, F.vx, F.vy, BODIES[F.body].mu); F.rails = o.degenerate ? null : { o, t0: F.t }; }
    if (F.rails) {
      F.t += dt * w; const s = stateAt(F.rails.o, F.t - F.rails.t0); F.x = s[0]; F.y = s[1]; F.vx = s[2]; F.vy = s[3];
      F.thrusting = false;
      if (want !== null) F.ang = want;
      checkSOI(); checkGround();
    } else physFrame(dt, Math.min(w, 50));
  } else if (F.landed && w > 1) { F.rails = null; F.t += dt * w; pinToSurface(dt * w); }
  else { F.rails = null; physFrame(dt, w); }
  F.maxAlt = Math.max(F.maxAlt, altitude());
  if (F.body === 'earth' && altitude() > BODIES.earth.atmo - 4000 && hasPart('fairing')) jettisonFairing();
  checkMilestones();
  stepFx(dt); stepDebris(dt);
  // 尾焰粒子 / exhaust particles
  if (F.thrusting && w <= PHYS_WARP_MAX) {
    const ex = -Math.cos(F.ang), ey = -Math.sin(F.ang), sp = 40;
    for (let i = 0; i < 2; i++) addFx(F.x + ex, F.y + ey, F.vx + ex * sp + (Math.random() - 0.5) * 10, F.vy + ey * sp + (Math.random() - 0.5) * 10, 0.5, Math.random() < 0.5 ? '#ffb347' : '#ff6a2b', 0.6);
  }
  F.predT -= dt;
  if (F.predT <= 0 && !F.landed) { F.pred = predict({ body: F.body, x: F.x, y: F.y, vx: F.vx, vy: F.vy, t: F.t }); F.predT = F.map ? 0.1 : 0.3; }
  audio.engine(F.thrusting ? 0.4 + 0.6 * F.thr * Math.min(1, pressure() + 0.25) : 0);
}
function physFrame(dt, w) {
  const total = dt * w, n = Math.max(1, Math.ceil(total / 0.02)), h = total / n;
  for (let i = 0; i < n; i++) { physStep(h); F.t += h; if (checkSOI() || checkGround()) break; }
}
function cycleSAS() { const order = ['hold', 'pro', 'retro', 'off']; F.sas = order[(order.indexOf(F.sas) + 1) % order.length]; }

// ===== 引力范围切换 / SOI switching =====
function checkSOI() {
  const Mo = BODIES.moon;
  if (F.body === 'earth') {
    const m = moonState(F.t);
    if (Math.hypot(F.x - m[0], F.y - m[1]) < Mo.soi) {
      F.body = 'moon'; F.x -= m[0]; F.y -= m[1]; F.vx -= m[2]; F.vy -= m[3]; F.rails = null; F.fx = []; F.debris = [];
      toast('🌙 ' + t('moon') + ' ' + t('soi')); awardMilestone('soi');
      F.snapMoon = snapshot(); F.predT = 0; return true;
    }
  } else if (Math.hypot(F.x, F.y) > Mo.soi * 1.001) {
    const m = moonState(F.t); F.body = 'earth'; F.x += m[0]; F.y += m[1]; F.vx += m[2]; F.vy += m[3]; F.rails = null; F.fx = []; F.debris = []; F.predT = 0;
    toast('🌍 ' + t('earth') + ' ' + t('soi')); return true;
  }
  return false;
}
function snapshot() { return JSON.parse(JSON.stringify({ t: F.t, parts: F.parts, segs: F.segs, body: F.body, x: F.x, y: F.y, vx: F.vx, vy: F.vy, ang: F.ang, ignited: F.ignited, moonA0 })); }
function restoreSnapshot(s) {
  newFlight(s.parts); Object.assign(F, { t: s.t, segs: s.segs, body: s.body, x: s.x, y: s.y, vx: s.vx, vy: s.vy, ang: s.ang, ignited: s.ignited, landed: false, thr: 0 });
  moonA0 = s.moonA0; F.snapMoon = s; F.zoom = defaultZoom(); F.maxAlt = 1e9;
}

// ===== 接地 / Touchdown =====
function checkGround() {
  if (F.landed) return false;
  const th = Math.atan2(F.y, F.x), R = surfR(F.body, th), r = Math.hypot(F.x, F.y);
  if (r > R) return false;
  const [vx, vy] = surfVel(), sp = Math.hypot(vx, vy), tilt = Math.abs(wrapPi(F.ang - th)), tol = legsTol();
  F.x = R * Math.cos(th); F.y = R * Math.sin(th); F.rails = null; setWarp(0);
  if (sp <= tol && tilt < 0.45) {
    F.landed = true; F.av = 0; F.ang = th; F.thr = 0; pinToSurface(0);
    if (F.body === 'moon') { toast(t('landedOk')); audio.win(); awardMilestone('landed'); if (F.auto) F.auto = null; F.zoom = defaultZoom(); }
    else if (F.maxAlt > 2000) { F.over = true; setTimeout(() => flightEnded('landedEarth'), 600); }
    return true;
  }
  F.crashed = true; F.crashT = 0; F.crashWhy = t('crashWhy', sp.toFixed(1), (tilt * 57.3).toFixed(0)); F.auto = null;
  audio.boom(); audio.engine(0);
  for (let i = 0; i < 70; i++) addFx(F.x, F.y, (Math.random() - 0.5) * 40 + vx * 0.1, (Math.random() - 0.5) * 40 + vy * 0.1, 1.4, ['#ffd166', '#ff7b3a', '#bbb', '#ffc21a'][i % 4], 0.8 + Math.random());
  return true;
}
function stepFx(dt) {
  const B = BODIES[F.body];
  for (let i = F.fx.length - 1; i >= 0; i--) {
    const p = F.fx[i]; p.life -= dt; if (p.life <= 0) { F.fx.splice(i, 1); continue; }
    const r = Math.hypot(p.x, p.y), g = B.mu / (r * r);
    p.vx -= p.x / r * g * dt; p.vy -= p.y / r * g * dt;
    if (F.body === 'earth' && r - B.R < B.atmo) { p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    // 触地：径向速度反弹衰减，粒子沿地面扩散 / ground contact: damp radial velocity so dust spreads along the surface
    const sr = surfR(F.body, Math.atan2(p.y, p.x)), r2 = Math.hypot(p.x, p.y);
    if (r2 < sr) {
      const ux = p.x / r2, uy = p.y / r2, vr = p.vx * ux + p.vy * uy;
      if (vr < 0) { p.vx -= vr * ux * 1.25; p.vy -= vr * uy * 1.25; }
      p.x = ux * sr; p.y = uy * sr;
    }
  }
}
function stepDebris(dt) {
  const B = BODIES[F.body];
  for (let i = F.debris.length - 1; i >= 0; i--) {
    const d = F.debris[i]; d.life -= dt; if (d.life <= 0) { F.debris.splice(i, 1); continue; }
    const r = Math.hypot(d.x, d.y), g = B.mu / (r * r);
    d.vx -= d.x / r * g * dt; d.vy -= d.y / r * g * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.ang += d.av * dt;
    if (r < surfR(F.body, Math.atan2(d.y, d.x))) F.debris.splice(i, 1);
  }
}

// ===== 里程碑 / Milestones =====
function checkMilestones() {
  const alt = altitude();
  if (F.body === 'earth') {
    if (alt > BODIES.earth.atmo) awardMilestone('space');
    if (!save.ms.orbit && !F.thrusting && alt > BODIES.earth.atmo && F.pred && F.pred.o && !F.pred.o.degenerate && F.pred.o.pe - BODIES.earth.R > BODIES.earth.atmo) awardMilestone('orbit');
  } else if (!save.ms.lorbit && F.pred && F.pred.o && F.pred.o.e < 1 && F.pred.o.ap < BODIES.moon.soi && F.pred.o.pe - BODIES.moon.R > 2000 && !F.thrusting) awardMilestone('lorbit');
}

/* =====================================================================
 * 自动驾驶（新手辅助）/ Autopilot (beginner assist)
 * 返回期望朝向（世界角）或 null / returns the wanted heading (world angle) or null
 * ===================================================================== */
function autoStage() {
  const s = activeSeg();
  if (F.ignited && s && s.fuel <= 0.0001 && F.segs.length > 1 && F.t - F.lastStageT > 0.6) doStage();
  if (!F.ignited) doStage();
}
function autopilot(dt) {
  const A = F.autoMem, B = BODIES[F.body], r = Math.hypot(F.x, F.y), up = Math.atan2(F.y, F.x), alt = altitude();
  const prograde = Math.atan2(F.vy, F.vx), m = vesselMass();
  // 预测尚未生成时（刚放置/刚切换天体）现算轨道根数 / compute elements directly if no prediction yet (just placed or SOI switch)
  const o = (F.pred && F.pred.o) || (F.landed ? null : elements(F.x, F.y, F.vx, F.vy, B.mu));
  const Tm = () => { const s = activeSeg(); return s && s.engines.length ? engineStats(s.engines, pressure()).thrust : 0; };
  const burnTime = dv => { const T = Tm(); return T > 0 ? dv * m / T : 999; };
  if (totalFuel() <= 0.0001 && F.auto !== 'coast' && F.auto !== 'done') { toast(t('ap_fail')); F.auto = null; return null; }
  switch (F.auto) {
    case 'ascent': {
      // 闭环上升制导：先竖直，再按高度允许的最大倾角转弯，目标垂直速度随高度递减，近点到位即关机
      // Closed-loop ascent guidance: vertical first, then turn within an altitude-based tilt limit,
      // chase a target vertical speed that shrinks with altitude, cut off once the periapsis is high enough
      autoStage(); F.thr = 1; setWarp(alt < 2000 ? 0 : 2);
      if (o && !o.degenerate && o.pe - B.R > TARGET_ORBIT - 8000 && alt > BODIES.earth.atmo) { F.thr = 0; F.auto = 'tli'; setWarp(0); return prograde; }
      const aT = Tm() / m; if (aT <= 0) return prograde;
      const vh = -F.vx * Math.sin(up) + F.vy * Math.cos(up), vs = F.vx * Math.cos(up) + F.vy * Math.sin(up), g = B.mu / (r * r);
      const vsT = clamp((TARGET_ORBIT - alt) / 40, -40, 350);
      const need = g - vh * vh / r + (vsT - vs) * 0.25;
      let above = Math.asin(clamp(need / aT, -0.3, 1));
      const maxTilt = alt < 1000 ? 0.04 : clamp(Math.pow((alt - 1000) / 30000, 0.6) * 1.57, 0.04, 1.57);
      above = Math.max(above, Math.PI / 2 - maxTilt);
      return up + (Math.PI / 2 - above);
    }
    case 'circ': {
      // 已在高空滑行：到远点附近再交给闭环制导 / coasting high: hand over to the closed-loop guidance near apoapsis
      if (!o || o.degenerate) { F.auto = 'ascent'; return prograde; }
      const vs = F.vx * Math.cos(up) + F.vy * Math.sin(up);
      const vAp = Math.sqrt(B.mu * (2 / o.ap - 1 / o.a)), tb = burnTime(Math.sqrt(B.mu / o.ap) - vAp), tAp = timeToNu(o, Math.PI);
      if (vs <= 0 || tAp < tb / 2 + 2 || alt < BODIES.earth.atmo) { F.auto = 'ascent'; return prograde; }
      F.thr = 0; warpTo(tAp - tb / 2 - 5);
      return up + Math.PI / 2 * o.dir;
    }
    case 'tli': {
      if (F.body !== 'earth' || !o) { F.auto = 'coast'; return null; }
      const at = (r + BODIES.moon.dist) / 2, tt = Math.PI * Math.sqrt(at * at * at / B.mu);
      const lead = Math.PI - MOON_W * tt, m0 = moonState(F.t), pm = Math.atan2(m0[1], m0[0]);
      const nv = (o.e < 1 ? o.n : 1e-3) * o.dir;
      let d = ((pm - up - lead) % TAU + TAU) % TAU; // 月球超前量差 / phase difference
      const rate = nv - MOON_W, tWin = rate > 0 ? d / rate : 1e9;
      const vNeed = Math.sqrt(B.mu * (2 / r - 1 / at)), tb = burnTime(Math.max(0, vNeed - Math.hypot(F.vx, F.vy)));
      F.thr = 0;
      if (tWin < tb / 2 + 1 || tWin > o.period - 2) { F.auto = 'tliBurn'; A.best = Infinity; A.fine = false; setWarp(0); }
      else warpTo(tWin - tb / 2);
      return prograde;
    }
    case 'tliBurn': {
      autoStage(); setWarp(0);
      const p = predict({ body: F.body, x: F.x, y: F.y, vx: F.vx, vy: F.vy, t: F.t }); F.pred = p;
      if (p.enc) {
        A.fine = true; F.thr = 0.15; setWarp(0);
        if (p.enc.pe > A.best + 50 || p.enc.pe < 60000) { F.thr = 0; F.auto = 'coast'; }
        A.best = Math.min(A.best, p.enc.pe);
      } else {
        F.thr = A.fine ? 0.15 : 1; setWarp(A.fine ? 0 : 2); // 粗调阶段用 ×4 物理加速 / ×4 physics warp during the coarse burn
        if (p.o && (p.o.e >= 1 || p.o.ap > BODIES.moon.dist * 1.25)) { F.thr = 0; F.auto = 'coast'; }
      }
      return prograde;
    }
    case 'coast': {
      F.thr = 0;
      if (F.body === 'moon') { F.auto = 'capture'; A.burning = false; return null; }
      const p = F.pred;
      if (p && p.enc) warpTo(p.enc.t + 60); else if (p && p.o) { warpTo(1e6); }
      return prograde;
    }
    case 'capture': {
      if (F.body !== 'moon' || !o) return null;
      const peAlt = o.pe - B.R;
      if (peAlt < 15000 || (A.burning && o.e < 0.25)) { F.thr = 0; A.burning = false; F.auto = alt > 25000 ? 'deorbit' : 'descent'; setWarp(0); return prograde + Math.PI; }
      const vPe = Math.sqrt(B.mu * (2 / o.pe - 1 / o.a)), dv = vPe - Math.sqrt(B.mu / o.pe), tb = burnTime(dv);
      const tPe = o.e >= 1 && o.nu0 > 0 ? 0 : timeToNu(o, 0);
      if (A.burning || tPe < tb / 2) { A.burning = true; autoStage(); F.thr = 1; setWarp(0); }
      else { F.thr = 0; warpTo(tPe - tb / 2 - 10); }
      return prograde + Math.PI;
    }
    case 'deorbit': {
      autoStage(); setWarp(0);
      if (o && o.pe - B.R < -40000) { F.thr = 0; F.auto = 'descent'; }
      else F.thr = 1;
      return prograde + Math.PI;
    }
    case 'descent': {
      autoStage();
      const [vx, vy] = surfVel(), sp = Math.hypot(vx, vy), vs = (vx * Math.cos(up) + vy * Math.sin(up)), g = B.mu / (r * r);
      const T = Tm(), aMax = T / m, retro = Math.atan2(-vy, -vx);
      if (alt < 120 || sp < 12) {
        // 末段：保持接近竖直，控制垂直速度 / terminal: stay near vertical, regulate vertical speed
        const hs = vx * -Math.sin(up) + vy * Math.cos(up); // 水平分量（逆时针为正）/ horizontal (CCW positive)
        const tilt = clamp(-hs * 0.08, -0.35, 0.35);
        const tvs = -Math.max(1.2, Math.min(alt * 0.2, 15)), err = tvs - vs;
        const need = (g + err * 1.8) / Math.cos(tilt);
        F.thr = aMax > 0 ? clamp(need / aMax, 0, 1) : 0; setWarp(0);
        return up + tilt;
      }
      // 所需减速度 = v²/2h + g；超过 75% 推力时开始连续节流的“自杀式”点火 / required decel = v²/2h + g; start a throttled suicide burn above 75% of max
      const h = Math.max(1, alt - 250), aReq = sp * sp / (2 * h) + g;
      if (aMax > 0 && (aReq > aMax * 0.75 || (A.burning && aReq > aMax * 0.4))) {
        A.burning = true; F.thr = clamp(aReq / aMax, 0.05, 1); setWarp(alt > 3000 ? 2 : 0);
      } else {
        A.burning = false; F.thr = 0;
        const tFree = (h - sp * sp / (2 * Math.max(0.3, aMax * 0.75 - g))) / Math.max(1, -vs);
        if (tFree > 20) warpTo(tFree * 0.4); else setWarp(alt > 3000 ? 2 : 0);
      }
      return retro;
    }
  }
  return null;
}
// 依据当前状态选择自动驾驶起点 / pick the autopilot entry state from the current situation
function startAutopilot() {
  F.autoMem = {};
  const o = elements(F.x, F.y, F.vx, F.vy, BODIES[F.body].mu), B = BODIES[F.body];
  if (F.body === 'earth') {
    if (F.landed || o.degenerate || (o.ap - B.R < TARGET_ORBIT && o.pe - B.R < B.atmo)) F.auto = 'ascent';
    else if (o.pe - B.R < TARGET_ORBIT - 6000 && o.ap < BODIES.moon.dist * 0.5) F.auto = 'circ';
    else if (o.ap < BODIES.moon.dist * 0.5) F.auto = 'tli';
    else F.auto = 'coast';
  } else {
    if (F.landed) { F.auto = null; return; }
    F.auto = o.pe - B.R < 15000 ? 'descent' : (o.e < 0.25 ? 'deorbit' : 'capture');
  }
  toast(t('autoOn', t('ap_' + F.auto)));
}

/* =====================================================================
 * 渲染：飞行视图 / Rendering: flight view
 * ===================================================================== */
function renderFlight() {
  const B = BODIES[F.body], up = Math.atan2(F.y, F.x), alt = altitude(), rot = Math.PI / 2 - up;
  const ppm = F.zoom, cs = Math.cos(rot), sn = Math.sin(rot), hh = stackHeight();
  const camX = F.x + Math.cos(F.ang) * hh * 0.5, camY = F.y + Math.sin(F.ang) * hh * 0.5;
  const toScr = (wx, wy) => { const dx = wx - camX, dy = wy - camY; return [W / 2 + (dx * cs - dy * sn) * ppm, H * 0.48 - (dx * sn + dy * cs) * ppm]; };
  // 天空 / sky
  if (F.body === 'earth' && alt < 60000) {
    const k = clamp(alt / 42000, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${lerp(70, 2, k) | 0},${lerp(140, 4, k) | 0},${lerp(220, 14, k) | 0})`);
    g.addColorStop(1, `rgb(${lerp(165, 4, k) | 0},${lerp(205, 8, k) | 0},${lerp(245, 24, k) | 0})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); drawStars(clamp((alt - 15000) / 25000, 0, 1));
  } else { ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H); drawStars(1); }
  drawBodySurface(F.body, toScr, ppm, up, rot);
  if (F.body === 'earth') drawPad(toScr, ppm);
  // 粒子 / particles
  for (const p of F.fx) { const [sx, sy] = toScr(p.x, p.y); if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue; const a = p.life / p.max; ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, p.size * ppm * (0.4 + (1 - a))), 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  // 残骸 / debris
  for (const d of F.debris) { const [sx, sy] = toScr(d.x, d.y); if (sx < -400 || sy < -400 || sx > W + 400 || sy > H + 400) continue; ctx.save(); ctx.translate(sx, sy); ctx.rotate(-(d.ang + rot - Math.PI / 2)); drawStack(d.parts, ppm); ctx.restore(); }
  if (!F.crashed) {
    const [sx, sy] = toScr(F.x, F.y);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-(F.ang + rot - Math.PI / 2));
    const seg = activeSeg();
    if (F.thrusting) { const ew = seg.engines.length ? PARTS[seg.engines[0]].w : 1; drawFlame(0, 0, ppm, (4 + 10 * F.thr) * (0.6 + 0.4 * (1 - pressure())), ew * 0.55); }
    const legsDown = F.landed || (F.body === 'moon' && alt < 3000) || (F.body === 'earth' && F.landed);
    drawStack(F.parts, ppm, { legsDeployed: legsDown, fuelFrac: i => { const s = F.segs.find(q => q.idx.includes(i)); return s && s.fuelMax > 0 ? s.fuel / s.fuelMax : 0; } });
    ctx.restore();
    if (hh * ppm < 10) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 8, 0, TAU); ctx.stroke(); }
  }
  // 速度方向指示（顺/逆向标记）/ prograde / retrograde markers
  const [vx, vy] = alt < 30000 && F.body === 'earth' ? surfVel() : [F.vx, F.vy];
  if (Math.hypot(vx, vy) > 1 && !F.landed) {
    const a = Math.atan2(vy, vx) + rot, rr = Math.min(W, H) * 0.36, cx = W / 2, cy = H * 0.48;
    ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr, 7, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr - 7); ctx.lineTo(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr - 12); ctx.stroke();
    ctx.strokeStyle = '#ffb36b'; ctx.beginPath(); ctx.arc(cx - Math.cos(a) * rr, cy + Math.sin(a) * rr, 7, 0, TAU); ctx.moveTo(cx - Math.cos(a) * rr - 5, cy + Math.sin(a) * rr - 5); ctx.lineTo(cx - Math.cos(a) * rr + 5, cy + Math.sin(a) * rr + 5); ctx.moveTo(cx - Math.cos(a) * rr + 5, cy + Math.sin(a) * rr - 5); ctx.lineTo(cx - Math.cos(a) * rr - 5, cy + Math.sin(a) * rr + 5); ctx.stroke();
  }
}
// 天体表面：远看画圆，近看画局部折线 / body surface: a circle from afar, a local polyline up close
function drawBodySurface(body, toScr, ppm, up, rot) {
  const B = BODIES[body], [cx, cy] = toScr(0, 0), Rpx = B.R * ppm;
  if (Rpx < 20000) {
    if (body === 'earth') { const g = ctx.createRadialGradient(cx, cy, Rpx * 0.95, cx, cy, Rpx * 1.08); g.addColorStop(0, 'rgba(120,180,255,.5)'); g.addColorStop(1, 'rgba(120,180,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Rpx * 1.08, 0, TAU); ctx.fill(); drawEarthIcon(cx, cy, Rpx); }
    else drawMoonIcon(cx, cy, Rpx);
    return;
  }
  const diag = Math.hypot(W, H) / ppm, span = Math.min(Math.PI, diag / B.R * 0.8 + 1e-4), N = 140, pts = [];
  let rMin = Infinity;
  for (let i = 0; i <= N; i++) { const th = up - span + 2 * span * i / N, rr = surfR(body, th); rMin = Math.min(rMin, rr); pts.push(toScr(rr * Math.cos(th), rr * Math.sin(th))); }
  // 底边必须低于地形最低点，否则多边形会翻转 / the bottom edge must sit below the lowest terrain point or the polygon flips
  const deep = rMin - diag * 2;
  for (let i = N; i >= 0; i -= 10) { const th = up - span + 2 * span * i / N; pts.push(toScr(deep * Math.cos(th), deep * Math.sin(th))); }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  if (body === 'earth') { ctx.fillStyle = '#3b7a46'; ctx.fill(); ctx.strokeStyle = '#2c5e35'; ctx.lineWidth = 2; ctx.stroke(); }
  else {
    ctx.fillStyle = '#8d8a84'; ctx.fill(); ctx.strokeStyle = '#c9c6be'; ctx.lineWidth = 2; ctx.stroke();
    // 陨石坑纹理 / crater texture
    if (ppm > 0.05) {
      ctx.fillStyle = 'rgba(60,58,55,.35)'; const step = 60 / B.R;
      const i0 = Math.floor((up - span) / step), i1 = Math.ceil((up + span) / step);
      for (let i = i0; i <= i1 && i - i0 < 400; i++) { const th = i * step, rr = surfR(body, th) - 6, [sx, sy] = toScr(rr * Math.cos(th), rr * Math.sin(th)); const sz = (8 + (Math.abs(i * 7919) % 17)) * ppm; if (sz < 1) continue; ctx.beginPath(); ctx.ellipse(sx, sy, sz, sz * 0.35, -(th + rot - Math.PI / 2), 0, TAU); ctx.fill(); }
    }
  }
}
function drawPad(toScr, ppm) {
  if (ppm < 0.5) return;
  const th = Math.PI / 2 + EARTH_W * F.t, R = BODIES.earth.R, rot = Math.PI / 2 - Math.atan2(F.y, F.x);
  const [sx, sy] = toScr(R * Math.cos(th), R * Math.sin(th));
  if (sx < -600 || sx > W + 600 || sy < -600 || sy > H + 600) return;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(-(th + rot - Math.PI / 2));
  ctx.fillStyle = '#5c6474'; ctx.fillRect(-12 * ppm, -0.6 * ppm, 24 * ppm, 1.2 * ppm);
  ctx.strokeStyle = '#d24'; ctx.lineWidth = Math.max(1, ppm * 0.4);
  const tx = 5 * ppm; ctx.beginPath();
  for (let y = 0; y < 34; y += 4) { ctx.moveTo(tx, -y * ppm); ctx.lineTo(tx + 3 * ppm, -(y + 4) * ppm); ctx.moveTo(tx + 3 * ppm, -y * ppm); ctx.lineTo(tx, -(y + 4) * ppm); }
  ctx.moveTo(tx, 0); ctx.lineTo(tx, -36 * ppm); ctx.moveTo(tx + 3 * ppm, 0); ctx.lineTo(tx + 3 * ppm, -36 * ppm); ctx.stroke();
  ctx.restore();
}

/* =====================================================================
 * 渲染：地图视图 / Rendering: map view
 * ===================================================================== */
function vesselEarthPos() { if (F.body === 'earth') return [F.x, F.y]; const m = moonState(F.t); return [F.x + m[0], F.y + m[1]]; }
function mapFocusPos() {
  if (F.mapFocus === 'earth') return [0, 0];
  if (F.mapFocus === 'moon') { const m = moonState(F.t); return [m[0], m[1]]; }
  const v = vesselEarthPos(); return v;
}
function defaultMapScale() {
  const o = F.pred && F.pred.o;
  let span = F.body === 'moon' ? BODIES.moon.soi * 0.6 : (o && !o.degenerate && o.e < 1 ? o.ap * 1.3 : BODIES.earth.R * 3);
  if (F.pred && F.pred.enc) span = BODIES.moon.dist * 1.2;
  return Math.min(W, H) * 0.45 / span;
}
function renderMap() {
  if (!F.mapScale) F.mapScale = defaultMapScale();
  const s = F.mapScale, f = mapFocusPos(), cx = W / 2 + F.mapPan[0], cy = H * 0.36 + F.mapPan[1];
  const toScr = (x, y) => [cx + (x - f[0]) * s, cy - (y - f[1]) * s];
  ctx.fillStyle = '#040713'; ctx.fillRect(0, 0, W, H); drawStars(0.6);
  const Mo = BODIES.moon, E = BODIES.earth, m = moonState(F.t);
  // 月球轨道 / Moon's orbit
  const [ex, ey] = toScr(0, 0);
  ctx.strokeStyle = 'rgba(180,190,220,.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(ex, ey, Mo.dist * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  drawEarthIcon(ex, ey, Math.max(4, E.R * s));
  if (E.R * s > 12) { ctx.strokeStyle = 'rgba(120,180,255,.35)'; ctx.beginPath(); ctx.arc(ex, ey, (E.R + E.atmo) * s, 0, TAU); ctx.stroke(); }
  const [mx, my] = toScr(m[0], m[1]);
  ctx.strokeStyle = 'rgba(255,209,102,.35)'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(mx, my, Mo.soi * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  drawMoonIcon(mx, my, Math.max(3, Mo.R * s));
  ctx.font = '600 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fc4ff';
  ctx.fillText(t('earth'), ex, ey + Math.max(4, E.R * s) + 14); ctx.fillStyle = '#ffe3a0'; ctx.fillText(t('moon'), mx, my + Math.max(3, Mo.R * s) + 14);
  // 轨迹 / trajectory
  const p = F.pred;
  if (p && !F.landed) {
    for (const seg of p.segs) {
      let ox = 0, oy = 0;
      if (seg.body === 'moon') { const mm = p.enc ? moonState(F.t + p.enc.t) : m; ox = mm[0]; oy = mm[1];
        if (p.enc) { const [gx, gy] = toScr(ox, oy); ctx.globalAlpha = 0.35; drawMoonIcon(gx, gy, Math.max(3, Mo.R * s)); ctx.globalAlpha = 1; } }
      const pts = segPoints(seg);
      ctx.strokeStyle = seg.body === 'moon' ? '#ffb347' : '#5ad1ff'; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((q, i) => { const [sx, sy] = toScr(q[0] + ox, q[1] + oy); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.stroke();
      // 近点/远点标记 / Pe / Ap markers
      const o = seg.o, R = BODIES[seg.body].R;
      const mark = (nu, label, col) => { const q = posFromNu(o, nu), [sx, sy] = toScr(q[0] + ox, q[1] + oy); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, sx + 7, sy - 6); };
      if (o.pe > R * 0.2 || seg.body === 'moon') mark(0, t('pe') + ' ' + fmtDist(o.pe - R), '#7dff9a');
      if (o.e < 1 && (seg.full || seg.body === 'earth') && o.ap < Mo.dist * 1.6) mark(Math.PI, t('ap') + ' ' + fmtDist(o.ap - R), '#ff9f6b');
    }
    if (p.enc) { const q = p.enc.entry, [sx, sy] = toScr(q[0], q[1]); ctx.fillStyle = '#ffd166'; ctx.textAlign = 'left'; ctx.fillText('◆ ' + t('encounter') + ' T-' + fmtTime(p.enc.t), sx + 8, sy + 14); }
    if (p.impact) { const ib = p.impact.body === 'moon' ? (p.enc ? moonState(F.t + p.enc.t) : m) : [0, 0]; const [sx, sy] = toScr(p.impact.pos[0] + ib[0], p.impact.pos[1] + ib[1]); ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 5, sy - 5); ctx.lineTo(sx + 5, sy + 5); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(sx - 5, sy + 5); ctx.stroke(); ctx.fillStyle = '#ff9a9a'; ctx.fillText(t('impact'), sx + 8, sy); }
  }
  // 飞船 / vessel
  const v = vesselEarthPos(), [vx, vy] = toScr(v[0], v[1]);
  ctx.save(); ctx.translate(vx, vy); ctx.rotate(-F.ang); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill(); ctx.restore();
}

// ===== 手势缩放 / Gesture zoom (pinch / wheel / drag) =====
const ptrs = new Map(); let pinch0 = null;
cv.addEventListener('pointerdown', e => { if (!F || scene !== 'flight') return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 / ignore */ } pinch0 = null; });
cv.addEventListener('pointermove', e => {
  if (!F || !ptrs.has(e.pointerId)) return;
  const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch0) zoomBy(d / pinch0);
    pinch0 = d;
  } else if (ptrs.size === 1 && F.map) { F.mapPan[0] += e.clientX - prev[0]; F.mapPan[1] += e.clientY - prev[1]; }
});
const ptrUp = e => { ptrs.delete(e.pointerId); pinch0 = null; };
cv.addEventListener('pointerup', ptrUp); cv.addEventListener('pointercancel', ptrUp);
cv.addEventListener('wheel', e => { if (!F || scene !== 'flight') return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function zoomBy(k) {
  if (F.map) { if (!F.mapScale) F.mapScale = defaultMapScale(); F.mapScale = clamp(F.mapScale * k, 1e-7, 0.5); }
  else F.zoom = clamp(F.zoom * k, 0.0002, 80);
}

// ===== 测试/调试钩子：直接放到某个阶段 / Test & debug hooks: jump to a phase =====
function debugPlace(kind) {
  const full = save.rocket.slice(), segs = splitSegments(full);
  if (kind === 'leo') {
    const parts = full.slice(0, segs[segs.length - 1].idx[0]); newFlight(parts);
    const r = BODIES.earth.R + TARGET_ORBIT, v = Math.sqrt(BODIES.earth.mu / r), th = Math.random() * TAU;
    Object.assign(F, { x: r * Math.cos(th), y: r * Math.sin(th), vx: -v * Math.sin(th), vy: v * Math.cos(th), ang: th + Math.PI / 2, landed: false, ignited: true, thr: 0, maxAlt: 1e9 });
  } else if (kind === 'moon') {
    const parts = full.slice(0, segs.length > 1 ? segs[1].idx[0] : full.length); newFlight(parts);
    const r = BODIES.moon.R + 20000, v = Math.sqrt(BODIES.moon.mu / r), th = Math.random() * TAU;
    Object.assign(F, { body: 'moon', x: r * Math.cos(th), y: r * Math.sin(th), vx: -v * Math.sin(th), vy: v * Math.cos(th), ang: th - Math.PI / 2, landed: false, ignited: true, thr: 0, maxAlt: 1e9 });
    F.snapMoon = snapshot();
  }
  F.zoom = defaultZoom(); F.pred = null; F.predT = 0;
}
