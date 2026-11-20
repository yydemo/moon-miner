'use strict';
/* vessel.js — 火箭零件绘制、分级与性能计算 / rocket part art, staging and performance maths */
const G0 = 9.80665;

// 把零件列表（自上而下）分成级：分离环归入它下面的级 / split a top→bottom part list into stages; a decoupler belongs to the stage below it
function splitSegments(parts) {
  const segs = []; let cur = [];
  parts.forEach((id, i) => {
    if (PARTS[id].kind === 'dec' && cur.length) { segs.push(cur); cur = []; }
    cur.push(i);
  });
  if (cur.length) segs.push(cur);
  return segs.map(idx => {
    let dry = 0, fuel = 0, engines = [];
    for (const i of idx) { const p = PARTS[parts[i]]; if (p.kind === 'tank') { dry += p.dry; fuel += p.mass - p.dry; } else dry += p.mass; if (p.kind === 'engine') engines.push(parts[i]); }
    return { idx, dry, fuel, engines };
  });
}
// 发动机组合推力与比冲 / combined thrust and Isp of a set of engines; pressure 0..1
function engineStats(engines, pressure) {
  let T = 0, flow = 0;
  for (const id of engines) { const p = PARTS[id], isp = lerp(p.ispVac, p.ispSL, pressure); T += p.thrust; flow += p.thrust / isp; }
  return { thrust: T, isp: flow > 0 ? T / flow : 0 };
}
// 机库数据：每级 Δv（真空/海平面）与推重比 / hangar stats: per-stage Δv (vac / SL) and TWR
function rocketStats(parts, roverKg) {
  const segs = splitSegments(parts), rover = (parts.includes('bay') ? roverKg : 0) / 1000;
  const out = { stages: [], mass: rover, dvVac: 0, height: 0, ok: true, errors: [] };
  for (const s of segs) out.mass += s.dry + s.fuel;
  for (const id of parts) out.height += PARTS[id].h;
  let above = out.mass;
  for (let k = segs.length - 1; k >= 0; k--) {
    const s = segs[k], m0 = above, m1 = above - s.fuel;
    const ev = engineStats(s.engines, 0), es = engineStats(s.engines, 1);
    const dvV = ev.isp && s.fuel > 0 ? ev.isp * G0 * Math.log(m0 / m1) : 0;
    const dvS = es.isp && s.fuel > 0 ? es.isp * G0 * Math.log(m0 / m1) : 0;
    out.stages.push({ num: segs.length - k, m0, dvVac: dvV, dvSL: dvS, twr: ev.thrust / (m0 * G0), twrSL: es.thrust / (m0 * G0), fuel: s.fuel, engines: s.engines.length });
    out.dvVac += dvV; above = m0 - s.dry - s.fuel;
  }
  if (!parts.includes('core')) out.errors.push('needCore');
  if (!segs.length || !segs[segs.length - 1].engines.length) out.errors.push('needEngine');
  else if (out.stages[0].twrSL < 1) out.errors.push('twrLow');
  if (!parts.includes('bay')) out.errors.push('needBay');
  out.ok = !out.errors.includes('needCore') && !out.errors.includes('needEngine') && !out.errors.includes('twrLow');
  return out;
}

// 单个零件（原创矢量画）。原点 = 零件底部中心，单位：像素/米 s
// One part (original vector art). Origin = bottom centre of the part; s = pixels per metre
function drawPart(id, s, opt = {}) {
  const p = PARTS[id], w = p.w * s, h = p.h * s;
  ctx.save();
  switch (p.kind) {
    case 'core': {
      // Generic crew/cargo capsule (blunt cone + trunk). No third-party names or marks.
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, '#9aa3b0'); g.addColorStop(0.45, '#f3f5f8'); g.addColorStop(1, '#7d8694');
      const trunkH = h * 0.38;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w * 0.48, 0);
      ctx.lineTo(-w * 0.46, -trunkH);
      ctx.quadraticCurveTo(-w * 0.5, -h * 0.55, -w * 0.28, -h * 0.82);
      ctx.quadraticCurveTo(0, -h * 1.08, w * 0.28, -h * 0.82);
      ctx.quadraticCurveTo(w * 0.5, -h * 0.55, w * 0.46, -trunkH);
      ctx.lineTo(w * 0.48, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,45,55,.28)'; ctx.lineWidth = Math.max(0.6, s * 0.05);
      ctx.beginPath(); ctx.moveTo(-w * 0.46, -trunkH); ctx.lineTo(w * 0.46, -trunkH); ctx.stroke();
      ctx.fillStyle = '#1a2438';
      [[0, -h * 0.72, 0.10], [-w * 0.2, -h * 0.62, 0.07], [w * 0.2, -h * 0.62, 0.07]].forEach(([cx, cy, rr]) => {
        ctx.beginPath(); ctx.ellipse(cx, cy, w * rr, w * rr * 0.8, 0, 0, TAU); ctx.fill();
      });
      ctx.fillStyle = '#3a3530';
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, Math.max(1.2, h * 0.09), 0, 0, TAU); ctx.fill();
      break;
    }
    case 'bay': {
      ctx.fillStyle = p.color; ctx.fillRect(-w / 2, -h, w, h);
      ctx.fillStyle = '#aab0bb'; ctx.fillRect(w * 0.15, -h, w * 0.35, h);
      ctx.strokeStyle = '#5e6572'; ctx.lineWidth = Math.max(0.6, s * 0.06); ctx.strokeRect(-w * 0.38, -h * 0.85, w * 0.76, h * 0.7);
      if (s > 4) { ctx.save(); ctx.translate(0, -h * 0.2); drawRover(0, 0, w * 0.55, 1, 0.3); ctx.restore(); }
      break;
    }
    case 'fairing': {
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c4cad6');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h * 0.35); ctx.quadraticCurveTo(-w / 2, -h, 0, -h); ctx.quadraticCurveTo(w / 2, -h, w / 2, -h * 0.35); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
      break;
    }
    case 'solar': {
      ctx.fillStyle = '#4b5260'; ctx.fillRect(-w / 2, -h, w, h);
      ctx.fillStyle = p.color; ctx.fillRect(-w * 1.15, -h * 0.85, w * 0.62, h * 0.7); ctx.fillRect(w * 0.53, -h * 0.85, w * 0.62, h * 0.7);
      ctx.strokeStyle = '#7fa6ff'; ctx.lineWidth = Math.max(0.5, s * 0.04);
      for (let i = 1; i < 4; i++) { const xx = w * 0.53 + w * 0.62 * i / 4; ctx.beginPath(); ctx.moveTo(xx, -h * 0.85); ctx.lineTo(xx, -h * 0.15); ctx.moveTo(-xx, -h * 0.85); ctx.lineTo(-xx, -h * 0.15); ctx.stroke(); }
      break;
    }
    case 'legs': {
      ctx.fillStyle = '#6b717c'; ctx.fillRect(-w * 0.4, -h, w * 0.8, h * 0.5);
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, s * 0.18); ctx.lineCap = 'round';
      const ext = opt.deployed ? 1 : 0.55;
      ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.8); ctx.lineTo(-w * (0.35 + 0.5 * ext), h * 0.0 + (opt.deployed ? 0 : -h * 0.3));
      ctx.moveTo(w * 0.35, -h * 0.8); ctx.lineTo(w * (0.35 + 0.5 * ext), h * 0.0 + (opt.deployed ? 0 : -h * 0.3)); ctx.stroke();
      ctx.fillStyle = p.color; const fw = w * 0.22;
      ctx.fillRect(-w * (0.35 + 0.5 * ext) - fw / 2, (opt.deployed ? 0 : -h * 0.3) - s * 0.12, fw, s * 0.16);
      ctx.fillRect(w * (0.35 + 0.5 * ext) - fw / 2, (opt.deployed ? 0 : -h * 0.3) - s * 0.12, fw, s * 0.16);
      break;
    }
    case 'tank': {
      const steel = id === 'tankSS';
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, steel ? '#e6ebf0' : '#ffffff'); g.addColorStop(0.6, steel ? '#b9c2cc' : '#e4e8ef'); g.addColorStop(1, steel ? '#8e99a5' : '#b9c0cc');
      ctx.fillStyle = g; ctx.fillRect(-w / 2, -h, w, h);
      ctx.fillStyle = steel ? '#6d7782' : '#2d3a5a'; ctx.fillRect(-w / 2, -h, w, Math.max(1, s * 0.15)); ctx.fillRect(-w / 2, -Math.max(1, s * 0.15), w, Math.max(1, s * 0.15));
      if (!steel) { ctx.fillStyle = '#d33a3a'; ctx.fillRect(-w / 2, -h * 0.5 - s * 0.12, w, s * 0.24); }
      // 燃料余量指示 / fuel level indicator
      if (opt.fuelFrac !== undefined && s > 3) { ctx.fillStyle = 'rgba(80,200,120,.35)'; ctx.fillRect(-w / 2 + w * 0.8, -h * opt.fuelFrac, w * 0.12, h * opt.fuelFrac); }
      break;
    }
    case 'engine': {
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-w * 0.32, -h, w * 0.64, h * 0.35);
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, '#454b57'); g.addColorStop(0.5, p.color); g.addColorStop(1, '#2c3038');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w * 0.22, -h * 0.65); ctx.lineTo(w * 0.22, -h * 0.65); ctx.lineTo(w / 2, 0); ctx.lineTo(-w / 2, 0); ctx.closePath(); ctx.fill();
      if (id === 'engVacHi') { ctx.strokeStyle = '#8fb3ff'; ctx.lineWidth = Math.max(0.6, s * 0.08); ctx.beginPath(); ctx.moveTo(-w * 0.36, -h * 0.3); ctx.lineTo(w * 0.36, -h * 0.3); ctx.stroke(); }
      break;
    }
    case 'dec': {
      ctx.fillStyle = p.color; ctx.fillRect(-w / 2, -h, w, h);
      ctx.fillStyle = '#ffcc33'; for (let x = -w / 2; x < w / 2; x += Math.max(2, s * 0.5)) ctx.fillRect(x, -h * 0.75, Math.max(1, s * 0.25), h * 0.5);
      break;
    }
  }
  ctx.restore();
}
// 整枝火箭：原点 = 底部中心，向上画 / whole stack: origin = bottom centre, drawn upward
function drawStack(parts, s, opt = {}) {
  let y = 0; const rects = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = PARTS[parts[i]];
    ctx.save(); ctx.translate(0, y);
    drawPart(parts[i], s, { deployed: opt.legsDeployed, fuelFrac: opt.fuelFrac ? opt.fuelFrac(i) : undefined });
    ctx.restore();
    rects[i] = { y0: y - p.h * s, y1: y, w: p.w * s };
    if (opt.selected === i) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(-p.w * s / 2 - 3, y - p.h * s - 2, p.w * s + 6, p.h * s + 4); ctx.setLineDash([]); }
    y -= p.h * s;
  }
  return rects;
}
function drawFlame(x, y, s, len, w) {
  const f = (0.85 + Math.random() * 0.3) * len;
  const g = ctx.createLinearGradient(0, y, 0, y + f * s);
  g.addColorStop(0, '#fff6c0'); g.addColorStop(0.3, '#ffb347'); g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w * s / 2, y); ctx.quadraticCurveTo(x, y + f * s * 1.25, x + w * s / 2, y); ctx.fill();
}
