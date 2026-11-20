'use strict';
/* orbit.js — 二维开普勒轨道与拼接圆锥曲线预测（原创实现）
 * 2D Kepler orbits and patched-conic prediction (original implementation)
 * 坐标：以当前引力体中心为原点，x 右 y 上，单位 m、m/s。
 * Coordinates: origin at the current body's centre, x right, y up, metres and m/s. */

// 月球绕地圆轨道 / the Moon's circular orbit around Earth
const MOON_W = TAU / BODIES.moon.period;
let moonA0 = 1.2; // t=0 时月球相位（每次发射随机）/ Moon phase at t=0 (randomised per launch)
function moonState(t) {
  const a = moonA0 + MOON_W * t, d = BODIES.moon.dist, v = d * MOON_W;
  return [d * Math.cos(a), d * Math.sin(a), -v * Math.sin(a), v * Math.cos(a)];
}

// 状态 → 轨道根数 / state vector → orbital elements
function elements(rx, ry, vx, vy, mu) {
  const r = Math.hypot(rx, ry), v2 = vx * vx + vy * vy, h = rx * vy - ry * vx, dir = h >= 0 ? 1 : -1, rv = rx * vx + ry * vy;
  const ex = ((v2 - mu / r) * rx - rv * vx) / mu, ey = ((v2 - mu / r) * ry - rv * vy) / mu;
  let e = Math.hypot(ex, ey);
  const p = h * h / mu;
  if (Math.abs(e - 1) < 1e-7) e = e < 1 ? 1 - 1e-7 : 1 + 1e-7; // 避开抛物线奇点 / avoid the parabolic singularity
  const argp = e > 1e-9 ? Math.atan2(ey, ex) : Math.atan2(ry, rx);
  const nu = wrapPi(dir * (Math.atan2(ry, rx) - argp));
  const o = { mu, e, p, argp, dir, nu0: nu, degenerate: p < 50 };
  o.a = p / (1 - e * e);
  o.pe = p / (1 + e);
  o.ap = e < 1 ? p / (1 - e) : Infinity;
  if (e < 1) { o.n = Math.sqrt(mu / (o.a * o.a * o.a)); o.period = TAU / o.n; }
  else { o.n = Math.sqrt(mu / (-o.a * -o.a * -o.a)); o.period = Infinity; }
  o.M0 = meanFromNu(o, nu);
  return o;
}
function meanFromNu(o, nu) {
  const e = o.e;
  if (e < 1) { const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2)); return E - e * Math.sin(E); }
  const k = clamp(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2), -0.999999999, 0.999999999), F = 2 * Math.atanh(k);
  return e * Math.sinh(F) - F;
}
function nuFromMean(o, M) {
  const e = o.e;
  if (e < 1) {
    M = wrapPi(M);
    let E = e > 0.8 ? (M >= 0 ? Math.PI : -Math.PI) * 0.9 + M * 0.1 : M + e * Math.sin(M);
    for (let i = 0; i < 40; i++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  }
  let F = Math.asinh(M / e);
  for (let i = 0; i < 60; i++) { const d = (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1); F -= d; if (Math.abs(d) < 1e-12) break; }
  return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(F / 2));
}
// 真近点角 → 状态 / true anomaly → state
function stateFromNu(o, nu) {
  const r = o.p / (1 + o.e * Math.cos(nu)), phi = o.argp + o.dir * nu, k = Math.sqrt(o.mu / o.p);
  const vr = k * o.e * Math.sin(nu), vt = k * (1 + o.e * Math.cos(nu));
  const ux = Math.cos(phi), uy = Math.sin(phi), tx = -uy * o.dir, ty = ux * o.dir;
  return [r * ux, r * uy, vr * ux + vt * tx, vr * uy + vt * ty];
}
// dt 秒后的状态 / state after dt seconds
function stateAt(o, dt) { return stateFromNu(o, nuFromMean(o, o.M0 + o.n * dt)); }
function posFromNu(o, nu) { const r = o.p / (1 + o.e * Math.cos(nu)), phi = o.argp + o.dir * nu; return [r * Math.cos(phi), r * Math.sin(phi)]; }
// 从现在到达真近点角 nu 的时间（正值，椭圆取下一圈）/ time from now until true anomaly nu (positive; next pass for ellipses)
function timeToNu(o, nu) {
  let dM = meanFromNu(o, nu) - o.M0;
  if (o.e < 1) { dM = ((dM % TAU) + TAU) % TAU; }
  return dM / o.n;
}
// r = R 时（向内）的真近点角，没有则 null / true anomaly where r = R going inward, or null
function nuAtRadiusIn(o, R) { if (o.pe >= R || (o.e < 1 && o.ap < R)) return null; const c = (o.p / R - 1) / o.e; if (c < -1 || c > 1) return null; return -Math.acos(c); }
function nuAtRadiusOut(o, R) { if (o.e < 1 && o.ap <= R) return null; const c = (o.p / R - 1) / o.e; if (c < -1 || c > 1) return null; return Math.acos(c); }

/* 轨迹预测：返回用于地图绘制与自动驾驶的分段信息
 * Trajectory prediction: returns segments for map drawing and the autopilot
 * st = { body, x, y, vx, vy, t } */
function predict(st) {
  const out = { segs: [], enc: null, impact: null, escape: false };
  const E = BODIES.earth, Mo = BODIES.moon;
  if (st.body === 'earth') {
    const o = elements(st.x, st.y, st.vx, st.vy, E.mu);
    out.o = o; if (o.degenerate) return out;
    let tEnd = o.e < 1 ? o.period : 40 * 86400, nuEnd = null;
    const nuImp = nuAtRadiusIn(o, E.R);
    if (nuImp !== null) { const ti = timeToNu(o, nuImp); if (ti < tEnd) { tEnd = ti; nuEnd = nuImp; out.impact = { body: 'earth', t: ti, pos: posFromNu(o, nuImp) }; } }
    // 月球交会搜索（远点够高才搜）/ search for a Moon encounter (only if the apoapsis is high enough)
    if (o.ap > Mo.dist - Mo.soi * 1.05) {
      const N = 360, span = Math.min(tEnd, o.e < 1 ? o.period : 30 * 86400);
      let prevT = 0;
      for (let i = 1; i <= N; i++) {
        const tt = span * i / N, s = stateAt(o, tt), m = moonState(st.t + tt);
        if (Math.hypot(s[0] - m[0], s[1] - m[1]) < Mo.soi) {
          let lo = prevT, hi = tt; // 二分求进入时刻 / bisect for the entry time
          for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2, s2 = stateAt(o, mid), m2 = moonState(st.t + mid); if (Math.hypot(s2[0] - m2[0], s2[1] - m2[1]) < Mo.soi) hi = mid; else lo = mid; }
          const s3 = stateAt(o, hi), m3 = moonState(st.t + hi);
          const om = elements(s3[0] - m3[0], s3[1] - m3[1], s3[2] - m3[2], s3[3] - m3[3], Mo.mu);
          out.enc = { t: hi, o: om, pe: om.pe - Mo.R, entry: [s3[0], s3[1]] };
          tEnd = hi; nuEnd = nuFromMean(o, o.M0 + o.n * hi); out.impact = null;
          break;
        }
        prevT = tt;
      }
    }
    if (o.e >= 1 && !out.enc && !out.impact) { out.escape = true; nuEnd = nuAtRadiusOut(o, Mo.dist * 2); }
    out.segs.push({ body: 'earth', o, nu0: o.nu0, nu1: nuEnd, full: nuEnd === null && o.e < 1 });
    if (out.enc) out.segs.push(moonSeg(out.enc.o, out));
  } else {
    const o = elements(st.x, st.y, st.vx, st.vy, Mo.mu);
    out.o = o; if (o.degenerate) return out;
    out.segs.push(moonSeg(o, out));
  }
  return out;
}
// 月球内的段：止于撞击或离开 SOI / a segment inside the Moon's SOI: ends at impact or SOI exit
function moonSeg(o, out) {
  const Mo = BODIES.moon;
  let nu1 = null, full = false;
  const nuImp = nuAtRadiusIn(o, Mo.R);
  if (nuImp !== null && (o.nu0 < nuImp || o.e < 1)) { nu1 = nuImp; out.impact = { body: 'moon', t: timeToNu(o, nuImp) + (out.enc ? out.enc.t : 0), pos: posFromNu(o, nuImp) }; }
  else if (o.ap > Mo.soi) { nu1 = nuAtRadiusOut(o, Mo.soi); out.exitMoon = true; }
  else full = true;
  return { body: 'moon', o, nu0: o.nu0, nu1, full };
}
// 段采样为点 / sample a segment to points
function segPoints(seg, n = 160) {
  const o = seg.o, pts = [];
  let a0 = seg.nu0, a1;
  if (seg.full) a1 = a0 + TAU;
  else { a1 = seg.nu1; if (o.e < 1) { while (a1 < a0) a1 += TAU; } else if (a1 < a0) a1 = a0; }
  if (o.e >= 1) { const lim = Math.acos(-1 / o.e) - 1e-3; a0 = clamp(a0, -lim, lim); a1 = clamp(a1, -lim, lim); }
  for (let i = 0; i <= n; i++) pts.push(posFromNu(o, lerp(a0, a1, i / n)));
  return pts;
}
