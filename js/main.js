'use strict';
/* main.js — 阶段切换、界面、HUD、主循环 / phase control, UI, HUD and main loop */

let phase = 'menu', scene = 'menu', paused = false;
let run = null; // 本次任务统计 / current mission stats
let parts = [], floats = []; // 采矿场景粒子与漂浮文字 / mining-scene particles and floating texts
function addPart(x, y, vx, vy, life, color, size) { if (parts.length < 300) parts.push({ x, y, vx, vy, life, max: life, color, size }); }
function stepParts(dt, gy) { for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy += gy * dt; p.x += p.vx * dt; p.y += p.vy * dt; } }
function drawPartsM(toScreen, scale) {
  for (const p of parts) { const [sx, sy] = toScreen(p.x, p.y); const a = p.life / p.max; ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.8, p.size * scale * (0.5 + a * 0.5)), 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// ===== 界面切换 / Screen switching =====
const OVERLAYS = ['ovMenu', 'ovShop', 'ovAch', 'ovResult', 'ovPause', 'ovAbout', 'ovMarket'];
function showOverlay(id) { OVERLAYS.forEach(o => $(o).classList.toggle('hide', o !== id)); refreshMenus(); }
function showScreen(id) { $('hangar').classList.toggle('hide', id !== 'hangar'); if (id) OVERLAYS.forEach(o => $(o).classList.add('hide')); }
function setPhase(p) {
  if (p !== 'over') scene = p;
  phase = p; parts = []; floats = []; clearInput(); paused = false;
  $('flightUI').classList.toggle('hide', p !== 'flight');
  $('mineUI').classList.toggle('hide', p !== 'mining');
  $('btnPause').classList.toggle('hide', p !== 'flight' && p !== 'mining');
  if (p === 'flight' || p === 'mining') { showOverlay(null); showScreen(null); }
  if (p !== 'hangar') $('hangar').classList.add('hide');
  audio.engine(0); setHint(); updateHUD(true);
}
let hintT = 0;
function setHint() { const h = phase === 'mining' ? t('mineHint') : phase === 'flight' ? '' : ''; $('hint').textContent = h; hintT = 9; }
function goMenu() { paused = false; F = null; setPhase('menu'); showOverlay('ovMenu'); }
function showResult(title, rows, buttons) {
  $('resTitle').textContent = title;
  const body = $('resBody'); body.innerHTML = '';
  rows.forEach(([k, v, cls]) => { const d = el('div', 'kv'); d.appendChild(el('span', '', k)); d.appendChild(el('span', cls || '', v)); body.appendChild(d); });
  const bb = $('resBtns'); bb.innerHTML = '';
  buttons.forEach(([label, fn, alt]) => { const b = el('button', 'mb' + (alt ? ' alt' : ''), label); b.onclick = () => { audio.unlock(); audio.click(); fn(); }; bb.appendChild(b); });
  showScreen(null); showOverlay('ovResult');
}
function applyLang() {
  document.documentElement.lang = save.lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  $('btnLang').textContent = t('lang');
  $('menuSub').textContent = t('sub', L2(DIGGER_NAME));
  document.title = GAME_NAME.zh + ' ' + GAME_NAME.en;
  refreshMenus(); setHint();
  if (phase === 'hangar') { buildPalette(); refreshHangar(); }
  if (!$('ovShop').classList.contains('hide')) refreshShop();
}
function refreshMenus() {
  $('menuFunds').textContent = '¥' + fmtInt(save.funds); $('menuBest').textContent = '¥' + fmtInt(save.high);
  const al = $('achList'); al.innerHTML = '';
  for (const m of MILESTONES) {
    const row = el('div', 'row ach' + (save.ms[m.id] ? '' : ' lock')), txt = el('div');
    txt.appendChild(el('b', '', (save.ms[m.id] ? '🏅 ' : '🔒 ') + msName(m.id))); txt.appendChild(el('br')); txt.appendChild(el('small', '', t('msd_' + m.id)));
    row.appendChild(txt); row.appendChild(el('span', 'gold', '¥' + fmtInt(m.reward))); al.appendChild(row);
  }
}

// ===== 飞行开始/结束 / Flight start & end =====
function startFlightFromHangar() {
  const st = rocketStats(save.rocket, roverMassKg(save.up));
  if (!st.ok) { toast(t(st.errors[0])); return; }
  run = { ms: 0, sales: 0 };
  newFlight(save.rocket); setPhase('flight'); toast(t('stageBtn') + ' / ' + t('auto'));
}
function flightFailed() {
  F.over = true; setPhase('over');
  const btns = [];
  if (F.snapMoon) { const s = F.snapMoon; btns.push([t('revertMoon'), () => { restoreSnapshot(s); setPhase('flight'); }]); }
  btns.push([t('revertLaunch'), () => { const p = F.launchParts; newFlight(p); setPhase('flight'); }, !!F.snapMoon]);
  btns.push([t('toHangar'), openHangar, true], [t('menu'), goMenu, true]);
  showResult(t('crash'), [[F.crashWhy || '', ''], [t('tooFastLegs', legsTol()), '']], btns);
}
function flightEnded() {
  setPhase('over');
  showResult(t('landedEarth'), [[t('funds'), '¥' + fmtInt(save.funds), 'gold']], [[t('toHangar'), openHangar], [t('menu'), goMenu, true]]);
}
function deployRover() {
  if (!F || !F.landed || F.body !== 'moon') return;
  if (!F.parts.includes('bay')) { toast(t('needBay')); return; }
  audio.win(); startMining();
}

// ===== 飞行界面控件 / Flight UI controls =====
const thrEl = $('thr');
function setThrFromPtr(e) { const r = thrEl.getBoundingClientRect(); if (F) F.thr = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); if (F && F.thr < 0.03) F.thr = 0; }
thrEl.addEventListener('pointerdown', e => { e.preventDefault(); audio.unlock(); try { thrEl.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 / ignore */ } thrEl._drag = true; setThrFromPtr(e); });
thrEl.addEventListener('pointermove', e => { if (thrEl._drag) setThrFromPtr(e); });
thrEl.addEventListener('pointerup', () => { thrEl._drag = false; }); thrEl.addEventListener('pointercancel', () => { thrEl._drag = false; });
$('btnAuto').onclick = () => { if (!F) return; audio.click(); if (F.auto) { F.auto = null; F.thr = 0; toast(t('auto') + ' ✕'); } else startAutopilot(); };
$('btnFocus').onclick = () => { if (!F) return; const o = ['vessel', 'earth', 'moon']; F.mapFocus = o[(o.indexOf(F.mapFocus) + 1) % 3]; F.mapPan = [0, 0]; F.mapScale = 0; };
$('btnZoomIn').onclick = () => F && zoomBy(1.6);
$('btnZoomOut').onclick = () => F && zoomBy(1 / 1.6);
$('btnDeploy').onclick = deployRover;
$('btnMint').onclick = () => { if (M) mintBox(); };
$('btnMarket').onclick = () => { if (!M) return; audio.click(); refreshMarket(); showOverlay('ovMarket'); };
$('marketBack').onclick = () => { audio.click(); showOverlay(null); };
$('btnEnd').onclick = () => { if (phase !== 'mining' || M.dead) return; if (!onSurface()) { toast(t('endConfirm')); return; } endRun(false); };
bindButtons(document);

// ===== HUD =====
let hudT = 0, hudLast = '';
function bar(p, color) { return `<span class="bar"><i style="width:${(clamp(p, 0, 1) * 100).toFixed(0)}%;background:${color}"></i></span>`; }
function curDv() {
  let above = vesselMass(), dv = 0;
  for (let k = F.segs.length - 1; k >= 0; k--) { const s = F.segs[k], es = engineStats(s.engines, k === F.segs.length - 1 ? pressure() : 0); if (es.isp && s.fuel > 0) dv += es.isp * G0 * Math.log(above / (above - s.fuel)); above -= s.dry + s.fuel; }
  return dv;
}
function updateHUD(force) {
  let s = '';
  if (phase === 'flight' && F) {
    const alt = altitude(), [sx, sy] = surfVel(), up = Math.atan2(F.y, F.x), useSurf = F.body === 'earth' && alt < 30000;
    const sp = useSurf ? Math.hypot(sx, sy) : Math.hypot(F.vx, F.vy), vs = F.vx * Math.cos(up) + F.vy * Math.sin(up);
    const o = F.pred && F.pred.o, R = BODIES[F.body].R, seg = activeSeg();
    const ff = seg && seg.fuelMax > 0 ? seg.fuel / seg.fuelMax : 0;
    s = `${F.body === 'earth' ? '🌍 ' + t('earth') : '🌙 ' + t('moon')} · ${t('alt')} ${fmtDist(alt)}<br>${t('spd')} ${fmtInt(sp)} m/s · ${t('vs')} ${vs >= 0 ? '+' : ''}${vs.toFixed(0)}`;
    if (o && !o.degenerate && !F.landed) s += `<br>${t('ap')} ${o.e < 1 ? fmtDist(o.ap - R) : '∞'} · ${t('pe')} <span class="${o.pe - R < (F.body === 'earth' ? BODIES.earth.atmo : 0) ? 'bad' : 'ok'}">${fmtDist(o.pe - R)}</span>`;
    s += `<br>${t('fuel')} ${bar(ff, ff < 0.15 ? '#ff7b7b' : '#7dff9a')} ${t('stage')} ${F.segs.length} · Δv ${fmtInt(curDv())}`;
    s += `<br>${t('thr')} ${(F.thr * 100).toFixed(0)}% · ${t('warp')} ×${WARPS[F.warpIdx]}${F.rails ? ' ⟳' : ''}`;
    if (F.pred && F.pred.enc && F.body === 'earth') s += `<br><span class="warn">◆ ${t('encounter')} ${t('pe')} ${fmtDist(F.pred.enc.pe)} · T-${fmtTime(F.pred.enc.t)}</span>`;
    if (F.auto) s += `<br><span class="ok">🤖 ${t('ap_' + F.auto)}</span>`;
  } else if (phase === 'mining' && M) {
    const bp = M.bat / M.batMax, depth = Math.max(0, Math.floor(M.y) - M.surf[LANDER_C]);
    s = `${t('battery')} ${bar(bp, bp < 0.15 ? '#ff7b7b' : bp < 0.4 ? '#ffd166' : '#7dff9a')} ${(bp * 100).toFixed(0)}% · ${isDay() ? '☀ ' + t('day') : '🌑 ' + t('night')}`;
    s += `<br>${t('dustBox')} ${bar(M.boxKg / M.cap, '#9ee7ff')} ${M.boxKg.toFixed(1)}/${M.cap} kg · ${t('depth')} ${depth} m`;
    const link = M.relay.online && onSurface();
    s += `<br>📡 ${t('link')} <span class="${link ? 'ok' : 'bad'}">${link ? t('online') + ' ' + M.relay.latency.toFixed(0) + 'ms' : t('offline')}</span> · ${t('queued')} ${M.queue.length}`;
    s += `<br>⛓ ${M.ledger.blocks.length} ${t('blocks')} · NFT ${M.nfts ? M.nfts.length : 0} · ${t('sales')} ¥${fmtInt(M.sales)}`;
    if (atLander()) s += `<br><span class="ok">${t('atLander')}</span>`;
  }
  if (force || s !== hudLast) { $('stats').innerHTML = s; hudLast = s; }
  if (phase === 'flight' && F) {
    $('thrFill').style.height = (F.thr * 100).toFixed(0) + '%';
    $('btnStageLbl').textContent = F.ignited ? t('stageBtn') : t('ignite').replace('！', '').replace('!', '');
    $('sasLbl').textContent = t({ hold: 'sasHold', pro: 'sasPro', retro: 'sasRetro', off: 'sasOff' }[F.sas]);
    $('btnAuto').classList.toggle('on', !!F.auto);
    $('warpLbl').textContent = '×' + WARPS[F.warpIdx];
    $('btnMap').classList.toggle('on', F.map);
    $('mapBtns').classList.toggle('hide', !F.map);
    $('btnDeploy').classList.toggle('hide', !(F.landed && F.body === 'moon' && !F.crashed));
  }
}

// ===== 暂停 / 静音 / 语言 / Pause, mute, language =====
function togglePause(force) {
  if (phase !== 'flight' && phase !== 'mining') return;
  paused = force !== undefined ? force : !paused;
  clearInput(); audio.engine(0);
  showOverlay(paused ? 'ovPause' : null);
}
function toggleMute() { save.muted = !save.muted; persist(); $('btnMute').textContent = save.muted ? '🔇' : '🔊'; audio.unlock(); audio.engine(0); }
$('btnPause').onclick = () => togglePause();
$('btnResume').onclick = () => togglePause(false);
$('btnQuit').onclick = () => { paused = false; goMenu(); };
$('btnPauseHangar').onclick = () => { paused = false; openHangar(); };
$('btnMute').onclick = toggleMute;
$('btnLang').onclick = () => { save.lang = save.lang === 'zh' ? 'en' : 'zh'; persist(); applyLang(); updateHUD(true); };
$('btnStart').onclick = () => { audio.unlock(); audio.click(); openHangar(); };
$('btnRover').onclick = () => { audio.unlock(); audio.click(); openRoverShop(); };
$('btnAch').onclick = () => { audio.unlock(); audio.click(); showOverlay('ovAch'); };
$('btnAbout').onclick = () => { audio.click(); showOverlay('ovAbout'); };
$('aboutBack').onclick = () => goMenu();
$('shopBack').onclick = () => { audio.click(); if (phase === 'hangar') { showOverlay(null); showScreen('hangar'); refreshHangar(); } else goMenu(); };
$('shopHangar').onclick = () => { audio.click(); openHangar(); };
$('achBack').onclick = () => { audio.click(); goMenu(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) { togglePause(true); audio.engine(0); } });
window.addEventListener('blur', () => clearInput());
function onResize() { if (phase === 'hangar') refreshHangar(); }

// ===== 菜单背景 / Menu background =====
function renderMenuBg() {
  ctx.fillStyle = '#03040b'; ctx.fillRect(0, 0, W, H); drawStars(1, clock * 6);
  const m = Math.min(W, H), R = Math.max(W, H) * 0.55, my = H + R * 0.55;
  drawEarthIcon(W * 0.2, H * 0.14, m * 0.1);
  drawMoonIcon(W / 2, my, R);
  const a = Math.sin(clock * 0.4) * 0.5;
  ctx.save(); ctx.translate(W / 2, my); ctx.rotate(a); drawRover(0, -R + 2, m * 0.16, Math.cos(clock * 0.4) > 0 ? 1 : -1, -0.1); ctx.restore();
}

// ===== 主循环 / Main loop =====
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, Math.max(0, (now - last) / 1000)); last = now;
  if (taps.has('pause')) togglePause();
  if (taps.has('mute')) toggleMute();
  if (!paused) {
    clock += dt;
    if (phase === 'flight' && F) updateFlight(dt);
    else if (phase === 'mining' && M) updateMining(dt);
  }
  taps.clear();
  mainCtx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx = mainCtx;
  if (scene === 'flight' && F) { if (F.map) renderMap(); else renderFlight(); }
  else if (scene === 'mining' && M) renderMining();
  else if (scene !== 'hangar') renderMenuBg();
  if (hintT > 0 && !paused) { hintT -= dt; if (hintT <= 0) $('hint').textContent = ''; }
  hudT += dt; if (hudT > 0.1) { hudT = 0; updateHUD(); }
  requestAnimationFrame(frame);
}

// ===== 启动 / Boot =====
resize();
$('btnMute').textContent = save.muted ? '🔇' : '🔊';
applyLang(); setPhase('menu'); showOverlay('ovMenu');
if (migrateNote) toast(t('migrated', fmtInt(migrateNote)));
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* 忽略 / ignore */ }));
}
// 测试钩子 / Test hook
window.MoonMiner = {
  VERSION: 'v3-capsule-nft',
  get phase() { return phase; }, get F() { return F; }, get M() { return M; }, get save() { return save; }, input, taps,
  DIGGER_NAME, GAME_NAME,
  debug: {
    leo() { run = { ms: 0, sales: 0 }; debugPlace('leo'); setPhase('flight'); },
    lunarOrbit() { run = { ms: 0, sales: 0 }; debugPlace('moon'); setPhase('flight'); },
    funds(n) { save.funds += n; persist(); refreshMenus(); },
    autopilot() { if (F) startAutopilot(); },
    deploy: deployRover, endRun: () => endRun(false), mint: () => mintBox(), predict: () => F && F.pred,
    mining() { run = { ms: 0, sales: 0 }; startMining(); }
  }
};
