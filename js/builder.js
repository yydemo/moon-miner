'use strict';
/* builder.js — 机库：零件式火箭拼装 + Δv/推重比读数；CMR 升级与零件解锁
 * Hangar: part-based rocket builder + Δv/TWR readout; CMR upgrades and part unlocks */

const HB = { sel: -1, rects: [], scale: 1, ox: 0, oy: 0 };
function openHangar() {
  audio.engine(0); setPhase('hangar'); showScreen('hangar'); HB.sel = -1; buildPalette(); refreshHangar();
}
function partName(id) { return t('p_' + id); }
function partDesc(id) {
  const p = PARTS[id];
  if (p.kind === 'tank') return t('d_tank', (p.mass - p.dry).toFixed(2), p.dry.toFixed(2));
  if (p.kind === 'engine') return t('d_engine', p.thrust, p.ispVac, p.ispSL);
  if (p.kind === 'dec') return t('d_dec');
  return t('d_' + id);
}
// 零件卡片（含缩略图）/ part cards with thumbnails
function buildPalette() {
  const box = $('palette'); box.innerHTML = '';
  for (const id of PART_ORDER) {
    const p = PARTS[id], card = el('button', 'pcard' + (isUnlocked(id) ? '' : ' locked'));
    const c = document.createElement('canvas'), S = 64; c.width = S * 2; c.height = S * 2; c.style.width = c.style.height = S + 'px';
    const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    const sc = Math.min((S - 10) / Math.max(p.w * (p.kind === 'solar' ? 2.4 : p.kind === 'legs' ? 1.5 : 1), 0.5), (S - 10) / p.h, 26);
    withCtx(g, () => { ctx.save(); ctx.translate(S / 2, S / 2 + p.h * sc / 2); drawPart(id, sc, { deployed: true }); ctx.restore(); });
    card.appendChild(c);
    card.appendChild(el('b', '', partName(id)));
    card.appendChild(el('small', '', isUnlocked(id) ? partDesc(id) : '🔒 ¥' + fmtInt(p.cost)));
    card.onclick = () => {
      audio.unlock();
      if (!isUnlocked(id)) { tryUnlock(id); return; }
      const at = HB.sel >= 0 ? HB.sel : 0;
      save.rocket.splice(at, 0, id); HB.sel = at; persist(); audio.click(); refreshHangar();
    };
    box.appendChild(card);
  }
}
function tryUnlock(id) {
  const p = PARTS[id];
  if (save.funds < p.cost) { toast(t('poor') + ' (¥' + fmtInt(p.cost) + ')'); return; }
  save.funds -= p.cost; save.unlocked[id] = true; persist(); audio.coin(); toast(t('unlocked') + ': ' + partName(id));
  buildPalette(); refreshHangar();
}
function hangarCanvasSize() {
  const c = $('hcv'), r = c.getBoundingClientRect();
  c.width = Math.round(r.width * DPR); c.height = Math.round(r.height * DPR);
  return [r.width, r.height];
}
function refreshHangar() {
  $('hFunds').textContent = '¥' + fmtInt(save.funds);
  const parts = save.rocket, rk = roverMassKg(save.up), st = rocketStats(parts, rk);
  // 预览 / preview
  const [cw, ch] = hangarCanvasSize(), g = $('hcv').getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, cw, ch);
  const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, '#0d1630'); gr.addColorStop(1, '#1c2747'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  g.strokeStyle = 'rgba(120,160,255,.08)'; g.lineWidth = 1; for (let x = 0; x < cw; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ch); g.stroke(); } for (let y = 0; y < ch; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
  const hgt = Math.max(1, st.height), maxW = parts.reduce((m, id) => Math.max(m, PARTS[id].w), 2);
  HB.scale = Math.min((ch - 30) / hgt, (cw * 0.42) / maxW, 40); HB.ox = cw * 0.28; HB.oy = ch - 12;
  withCtx(g, () => { ctx.save(); ctx.translate(HB.ox, HB.oy); HB.rects = drawStack(parts, HB.scale, { selected: HB.sel, legsDeployed: true }); ctx.restore(); });
  // 分级标签 / stage labels
  const segs = splitSegments(parts);
  g.font = '600 11px system-ui,sans-serif'; g.textAlign = 'right';
  segs.forEach((s, k) => {
    const top = HB.rects[s.idx[0]], bot = HB.rects[s.idx[s.idx.length - 1]]; if (!top || !bot) return;
    const y0 = HB.oy + top.y0, y1 = HB.oy + bot.y1, x = HB.ox - maxW * HB.scale / 2 - 8;
    g.strokeStyle = '#ffd166'; g.beginPath(); g.moveTo(x, y0 + 2); g.lineTo(x - 4, y0 + 2); g.lineTo(x - 4, y1 - 2); g.lineTo(x, y1 - 2); g.stroke();
    g.fillStyle = '#ffd166'; g.fillText(String(segs.length - k), x - 7, (y0 + y1) / 2 + 4);
  });
  // 读数 / readout
  const box = $('hstats'); box.innerHTML = '';
  const kv = (k, v, cls) => { const d = el('div', 'kv'); d.appendChild(el('span', '', k)); d.appendChild(el('span', cls || '', v)); box.appendChild(d); };
  kv(t('mass'), st.mass.toFixed(2) + ' t');
  kv(t('deltaTotal'), fmtInt(st.dvVac) + ' m/s', 'gold');
  for (const s of st.stages) {
    const d = el('div', 'stg'); d.textContent = `${t('stage')} ${s.num} · ${t('dv')} ${fmtInt(s.dvVac)}${s.num === 1 ? ' (' + t('sl') + ' ' + fmtInt(s.dvSL) + ')' : ''} m/s · ${t('twr')} ${(s.num === 1 ? s.twrSL : s.twr).toFixed(2)}`;
    if ((s.num === 1 ? s.twrSL : s.twr) < 1 && s.num === 1) d.classList.add('bad'); box.appendChild(d);
  }
  kv(t('roverMass'), rk.toFixed(1) + ' kg');
  const plate = REAL.plates.find(p => rk <= p), plateNames = save.lang === 'zh' ? ['1/4 板', '1/2 板', '整板', 'XL 板'] : ['1/4 plate', '1/2 plate', 'full plate', 'XL plate'];
  kv('', plate ? t('plate', plateNames[REAL.plates.indexOf(plate)]) : t('plateOver'));
  kv(t('realPrice'), '$' + fmtInt(realLaunchUSD(rk)));
  const ref = el('div', 'stg'); ref.textContent = save.lang === 'zh' ? '参考：从地面到月面着陆约需 Δv ≈ 5,700 m/s' : 'Reference: ground to a Moon landing needs Δv ≈ 5,700 m/s'; box.appendChild(ref);
  for (const e of st.errors) { const d = el('div', 'stg bad', '⚠ ' + t(e)); box.appendChild(d); }
  $('hLaunch').disabled = !st.ok;
  $('hsel').classList.toggle('hide', HB.sel < 0 || HB.sel >= parts.length);
  if (HB.sel >= 0 && HB.sel < parts.length) $('hselName').textContent = partName(parts[HB.sel]);
}
// 点预览选中零件 / tap the preview to select a part
$('hcv').addEventListener('pointerdown', e => {
  const r = $('hcv').getBoundingClientRect(), x = e.clientX - r.left - HB.ox, y = e.clientY - r.top - HB.oy;
  let hit = -1; HB.rects.forEach((q, i) => { if (q && y >= q.y0 - 2 && y <= q.y1 + 2 && Math.abs(x) <= Math.max(q.w / 2, 18) + 6) hit = i; });
  HB.sel = hit === HB.sel ? -1 : hit; refreshHangar();
});
$('selUp').onclick = () => { const i = HB.sel; if (i > 0) { const a = save.rocket; [a[i - 1], a[i]] = [a[i], a[i - 1]]; HB.sel--; persist(); refreshHangar(); } };
$('selDown').onclick = () => { const i = HB.sel, a = save.rocket; if (i >= 0 && i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; HB.sel++; persist(); refreshHangar(); } };
$('selDel').onclick = () => { if (HB.sel >= 0) { save.rocket.splice(HB.sel, 1); HB.sel = Math.min(HB.sel, save.rocket.length - 1); persist(); refreshHangar(); } };
$('hDefault').onclick = () => { save.rocket = DEFAULT_ROCKET.slice(); HB.sel = -1; persist(); refreshHangar(); };
$('hClear').onclick = () => { save.rocket = ['core']; HB.sel = 0; persist(); refreshHangar(); };
$('hBack').onclick = () => goMenu();
$('hRover').onclick = () => openRoverShop();
$('hLaunch').onclick = () => { audio.unlock(); audio.click(); startFlightFromHangar(); };

// ===== CMR 升级商店 / CMR upgrade shop =====
function openRoverShop() { showScreen(null); showOverlay('ovShop'); refreshShop(); }
function refreshShop() {
  $('shopFunds').textContent = '¥' + fmtInt(save.funds);
  $('shopMass').textContent = t('massBudget', roverMassKg(save.up).toFixed(1));
  const sl = $('shopList'); sl.innerHTML = '';
  for (const k of ROVER_UP_ORDER) {
    const lvl = save.up[k], cfg = ROVER_UPS[k], cost = upCost(k, lvl), row = el('div', 'row'), txt = el('div');
    const [nm, ds] = t('up_' + k);
    txt.appendChild(el('b', '', nm)); txt.appendChild(el('small', '', ` ${t('level')} ${lvl}/${cfg.max}${cfg.kg ? ' · +' + cfg.kg + ' kg' : ''}`)); txt.appendChild(el('br')); txt.appendChild(el('small', '', ds));
    const b = el('button');
    if (lvl >= cfg.max) { b.textContent = t('maxed'); b.disabled = true; } else { b.textContent = t('buy') + ' ¥' + fmtInt(cost); b.disabled = save.funds < cost; }
    b.onclick = () => { if (save.up[k] >= cfg.max || save.funds < upCost(k, save.up[k])) { toast(t('poor')); return; } save.funds -= upCost(k, save.up[k]); save.up[k]++; persist(); audio.coin(); refreshShop(); };
    row.appendChild(txt); row.appendChild(b); sl.appendChild(row);
  }
  const pl = $('shopParts'); pl.innerHTML = '';
  for (const id of PART_ORDER) {
    const p = PARTS[id]; if (!p.cost) continue;
    const row = el('div', 'row'), txt = el('div'); txt.appendChild(el('b', '', partName(id))); txt.appendChild(el('br')); txt.appendChild(el('small', '', partDesc(id)));
    const b = el('button');
    if (isUnlocked(id)) { b.textContent = t('unlocked'); b.disabled = true; } else { b.textContent = t('unlock') + ' ¥' + fmtInt(p.cost); b.disabled = save.funds < p.cost; }
    b.onclick = () => { tryUnlock(id); refreshShop(); };
    row.appendChild(txt); row.appendChild(b); pl.appendChild(row);
  }
}
