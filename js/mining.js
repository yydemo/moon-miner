'use strict';
/* mining.js — 月面采矿：CMR 勘探-识别-采掘-集尘盒铸造-星链出售闭环
 * Lunar mining: the CMR loop explore → detect → mine → dust-box minting → relay sale
 * 闭环取自 simulation/rover_sim.py；材质/价格取自 dustbox_vision.py；中继取自 starlink_comm.py；账本取自 blockchain_ledger.py。
 * Loop from simulation/rover_sim.py; materials/prices from dustbox_vision.py; relay from starlink_comm.py; ledger from blockchain_ledger.py. */

const COLS = 44, ROWS = 76;
const BOX_COLS = 3, BOX_ROWS = 3, BOX_N = BOX_COLS * BOX_ROWS; // 尘盒 3×3 格 / 3×3 dust-box compartments
const EMPTY = 0, REG = 1, ROCK = 2, ICE = 3, MET = 4, RE = 5, ORG = 6, BED = 7;
const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
// 格子：硬度 / 材质 / 颜色 / tiles: hardness / material / colours
const TILE = [
  null,
  { hard: 1.0, base: '#8d8983', dot: '#a8a49d' },                                              // 风化层 regolith
  { hard: 2.2, base: '#5b5650', dot: '#6f6a64' },                                              // 硅酸盐/玄武岩 silicate / basalt (¥12/kg，不值得收 / not worth collecting)
  { hard: 1.3, mat: 'water_ice', base: '#8d8983', dot: '#a8a49d', gem: rgb(MATERIALS.water_ice.rgb) },
  { hard: 2.0, mat: 'metallic', base: '#6a645e', dot: '#7d766f', gem: rgb(MATERIALS.metallic.rgb) },
  { hard: 2.8, mat: 'rare_earth', base: '#55524f', dot: '#6c6966', gem: rgb(MATERIALS.rare_earth.rgb) },
  { hard: 2.5, mat: 'organic', base: '#4a4542', dot: '#5c5653', gem: rgb(MATERIALS.organic.rgb) },
  { hard: 999, base: '#262423', dot: '#34312f' }                                               // 基岩 bedrock
];
const LANDER_C = 4;
let M = null;

// ===== 区块链账本（PoW-lite，SHA-256）/ Blockchain ledger (PoW-lite, SHA-256) =====
function newLedger() { const L = { blocks: [] }; addBlock(L, 'genesis', { note: 'CMR lunar mission' }); return L; }
function addBlock(L, event, payload) {
  const prev = L.blocks.length ? L.blocks[L.blocks.length - 1].hash : '0'.repeat(64);
  const b = { index: L.blocks.length, ts: Math.round(clock * 1000), prev_hash: prev, rover_id: 'CMR', event, payload, nonce: 0, hash: '' };
  const zeros = '0'.repeat(LEDGER_DIFFICULTY);
  for (;;) { b.hash = sha256(blockStr(b)); if (b.hash.startsWith(zeros)) break; b.nonce++; }
  L.blocks.push(b); return b;
}
const blockStr = b => JSON.stringify([b.index, b.ts, b.prev_hash, b.rover_id, b.event, b.payload, b.nonce]);
function verifyLedger(L) { const z = '0'.repeat(LEDGER_DIFFICULTY); return L.blocks.every((b, i) => b.hash === sha256(blockStr(b)) && b.hash.startsWith(z) && (i === 0 || b.prev_hash === L.blocks[i - 1].hash)); }

// ===== 星链中继：多星错相位过顶窗口 / Star-chain relay: staggered pass windows =====
function newRelay(seed) { const r = mulberry32(seed); return { phase: Array.from({ length: RELAY.nSats }, () => r() * RELAY.passPeriod), online: false, latency: 0, bw: 0, rng: r, sent: 0 }; }
function updateRelay(R, step) {
  R.online = R.phase.some(ph => ((step + ph) % RELAY.passPeriod) < RELAY.passDuration);
  if (R.online) { R.latency = Math.max(15, RELAY.latencyBase + (R.rng() < RELAY.relayProb ? RELAY.latencyRelay : 0) + (R.rng() - 0.5) * 10); R.bw = lerp(RELAY.bwMin, RELAY.bwMax, R.rng()); }
  else { R.latency = 0; R.bw = 0; }
}

// ===== 程序生成矿区 / Procedural mine =====
function genMine(seed) {
  const r = mulberry32(seed), grid = new Uint8Array(COLS * ROWS), grade = new Float32Array(COLS * ROWS), surf = [];
  const ph = r() * 6.28;
  for (let c = 0; c < COLS; c++) surf.push(9 + Math.round(1.6 * Math.sin(c * 0.33 + ph) + r() * 0.9));
  for (let c = 1; c <= 7; c++) surf[c] = surf[LANDER_C];
  for (let c = 0; c < COLS; c++) for (let y = 0; y < ROWS; y++) {
    let v = EMPTY; const d = y - surf[c];
    if (d >= 0) v = d < 5 ? REG : (r() < Math.min(0.55, 0.12 + d * 0.012) ? ROCK : REG);
    if (c === 0 || c === COLS - 1 || y === ROWS - 1) v = BED;
    grid[y * COLS + c] = v;
  }
  // 高斯/随机游走矿脉，品位随深度上升（rover_sim World._gen 的网格化近似）
  // random-walk ore veins, grade rising with depth (grid approximation of rover_sim World._gen)
  const vein = (type, count, minD, minL, maxL) => {
    for (let i = 0; i < count; i++) {
      let c = 1 + Math.floor(r() * (COLS - 2)); let y = surf[c] + minD + Math.floor(r() * (ROWS - 2 - surf[c] - minD));
      const len = minL + Math.floor(r() * (maxL - minL + 1)), g0 = clamp(0.3 + (y - surf[c]) / 80 + r() * 0.3, 0.3, 1);
      for (let j = 0; j < len; j++) {
        if (c > 0 && c < COLS - 1 && y < ROWS - 1 && y >= surf[c] + minD) { grid[y * COLS + c] = type; grade[y * COLS + c] = clamp(g0 + (r() - 0.5) * 0.2, 0.25, 1); }
        const dir = Math.floor(r() * 4); c += [1, -1, 0, 0][dir]; y += [0, 0, 1, -1][dir];
      }
    }
  };
  // 月球南极：水冰浅、金属中层、稀土深、碳质稀少（README §5 阶段 C 目标：南极水冰/稀土）
  // Lunar south pole: shallow ice, mid-depth metals, deep rare earths, rare carbonaceous (README §5 Stage C target)
  vein(ICE, 36, 1, 3, 6); vein(MET, 30, 6, 3, 6); vein(RE, 18, 18, 2, 5); vein(ORG, 9, 30, 1, 3);
  for (let i = 0; i < 3; i++) { // 新手保底：着陆点附近浅层矿 / beginner guarantee: shallow ore near the lander
    const c = 7 + Math.floor(r() * 9), y = surf[c] + 1 + Math.floor(r() * 3), tp = i === 2 ? MET : ICE;
    for (const cc of [c, c + 1]) if (cc < COLS - 1) { grid[y * COLS + cc] = tp; grade[y * COLS + cc] = 0.5 + r() * 0.3; }
  }
  for (let i = 0; i < 7; i++) { // 熔岩管空洞 / lava-tube caves
    let c = 3 + Math.floor(r() * (COLS - 6)), y = surf[c] + 12 + Math.floor(r() * (ROWS - surf[c] - 16));
    for (let j = 0; j < 14; j++) { if (y < ROWS - 1) grid[y * COLS + c] = EMPTY; c = clamp(c + Math.floor(r() * 3) - 1, 1, COLS - 2); y += r() < 0.3 ? (r() < .5 ? 1 : -1) : 0; }
  }
  return { grid, grade, surf };
}

function newCells(cap) {
  const cellCap = +(cap / BOX_N).toFixed(3);
  return Array.from({ length: BOX_N }, () => ({ mat: null, kg: 0, g: 0, cap: cellCap, photo: null, site: null }));
}
function syncBox() {
  const o = {}; let kg = 0;
  for (const c of M.cells) {
    if (!c.mat || c.kg <= 0) continue;
    o[c.mat] = o[c.mat] || { kg: 0, g: 0 };
    o[c.mat].kg += c.kg; o[c.mat].g += c.g; kg += c.kg;
  }
  M.box = o; M.boxKg = +kg.toFixed(2);
}
function startMining() {
  const u = save.up, g = genMine((Math.random() * 1e9) | 0);
  const batMax = ROVER.battery + u.power * 25;
  const solar = F && F.parts.includes('solar');
  const cap = ROVER.dustCap + u.bay * 3;
  M = { grid: g.grid, grade: g.grade, surf: g.surf, x: LANDER_C + 0.5, y: g.surf[LANDER_C], vx: 0, vy: 0, face: 1,
    dig: null, cells: newCells(cap), box: {}, boxKg: 0, cap, bat: batMax, batMax, dead: false, deadT: 0, maxDepth: 0, lowWarned: false, jet: false,
    step: 0, relay: newRelay((Math.random() * 1e9) | 0), queue: [], lots: [], nfts: [], ledger: newLedger(), lotN: 0, snap: null, solarPart: solar,
    drainK: 1 - 0.12 * u.sic, digK: 1 + 0.4 * u.tool, scanR: 3 + u.ai, confBoost: 0.015 * u.ai, faultK: 1 - 0.2 * u.shell, sales: 0, dug: 0 };
  setPhase('mining');
}
const tileAt = (c, y) => (c < 0 || c >= COLS || y >= ROWS) ? BED : (y < 0 ? EMPTY : M.grid[y * COLS + c]);
const solid = (c, y) => tileAt(c, y) !== EMPTY;
const HW = 0.42, HH = 0.62;
function moveX(dx) {
  M.x += dx; const r0 = Math.floor(M.y - HH + 0.02), r1 = Math.floor(M.y - 0.02);
  if (dx > 0) { const c = Math.floor(M.x + HW); for (let y = r0; y <= r1; y++) if (solid(c, y)) { M.x = c - HW - 0.0001; M.vx = 0; return true; } }
  else if (dx < 0) { const c = Math.floor(M.x - HW); for (let y = r0; y <= r1; y++) if (solid(c, y)) { M.x = c + 1 + HW + 0.0001; M.vx = 0; return true; } }
  return false;
}
function moveY(dy) {
  M.y += dy; const c0 = Math.floor(M.x - HW + 0.02), c1 = Math.floor(M.x + HW - 0.02);
  if (dy > 0) { const y = Math.floor(M.y); for (let c = c0; c <= c1; c++) if (solid(c, y)) { M.y = y; M.vy = 0; return 1; } }
  else if (dy < 0) { const y = Math.floor(M.y - HH); for (let c = c0; c <= c1; c++) if (solid(c, y)) { M.y = y + 1 + HH; M.vy = 0; return -1; } }
  return 0;
}
function onGround() {
  if (M.y - Math.floor(M.y) > 0.02) return false;
  const y = Math.floor(M.y + 0.01), c0 = Math.floor(M.x - HW + 0.02), c1 = Math.floor(M.x + HW - 0.02);
  for (let c = c0; c <= c1; c++) if (solid(c, y)) return true;
  return false;
}
const atLander = () => !!M && Math.abs(M.x - (LANDER_C + 0.5)) < 1.7 && M.y <= M.surf[LANDER_C] + 0.05;
const onSurface = () => !!M && M.y <= M.surf[clamp(Math.floor(M.x), 0, COLS - 1)] + 0.05;
const isDay = () => (M.step % ROVER.dayCycle) < ROVER.dayCycle * ROVER.dayFrac;
// 机载 AI 对某格的识别置信度（距离越远噪声越大）/ onboard AI confidence for a tile (noisier with distance)
function tileConf(c, y) {
  const d = Math.hypot(c + 0.5 - M.x, y + 0.5 - (M.y - 0.4)); if (d > M.scanR + 0.5) return 0;
  const h = ((c * 73856093) ^ (y * 19349663)) >>> 0, jitter = (h % 1000) / 1000 * 0.05;
  return clamp(0.99 - d * 0.018 - jitter + M.confBoost, 0, 0.999);
}
function tryDig(c, y, dir) {
  const tp = tileAt(c, y);
  if (tp === EMPTY) return false;
  if (tp === BED) { toastOnce('bed', t('bedrock')); return false; }
  if (TILE[tp].mat && M.boxKg >= M.cap) { mintBox(); }
  M.dig = { c, y, dir, prog: 0, need: 0.32 * TILE[tp].hard / M.digK };
  return true;
}
function finishDig() {
  const { c, y } = M.dig, i = y * COLS + c, tp = tileAt(c, y), gr0 = M.grade[i]; M.grid[i] = EMPTY; M.dig = null; M.dug++;
  for (let k = 0; k < 10; k++) addPart(c + 0.5 + (Math.random() - .5) * .8, y + 0.5 + (Math.random() - .5) * .8, (Math.random() - .5) * 4, -Math.random() * 3, 0.6, TILE[tp].gem || TILE[tp].dot, 0.08);
  const info = TILE[tp];
  // 硅酸盐岩块价值太低（¥12/kg），AI 分拣时直接丢弃，不占集尘盒 / silicate rock is too cheap (¥12/kg): the AI sorter discards it so it doesn't fill the dust box
  const mat = info.mat;
  if (mat) {
    const gr = gr0;
    // 采掘：产量 = 品位相关（rover_sim: amount = ore × 0.5 的放大版），耗电 mineDrain
    // MINE: yield depends on grade (scaled-up rover_sim amount = ore × 0.5); battery cost mineDrain
    const kg = +(1.0 + 1.6 * gr).toFixed(2);
    putInDustBox(mat, kg, gr, [c, y]);
    M.bat -= ROVER.mineDrain * M.drainK;
    addBlock(M.ledger, 'mine', { cell: [c, y], material: mat, grade: +gr.toFixed(3), collected: kg });
    audio.tone(520 + tp * 90, 0.09, 'triangle', 0.06);
    floats.push({ x: c + 0.5, y, text: L2(MATERIALS[mat]) + ' ' + kg + 'kg', t: 1.3, color: (info.gem || '#b9b2a6') });
    if (M.boxKg >= M.cap - 0.001) { toast(t('boxFull')); mintBox(); }
  } else audio.tone(140, 0.06, 'sawtooth', 0.04);
}
// 把月壤装进尘盒格子；满格自动拍照 / sweep regolith into a compartment; photograph when full
function putInDustBox(mat, kg, gr, site) {
  let left = kg;
  while (left > 0.001) {
    let cell = M.cells.find(c => c.mat === mat && c.kg < c.cap) || M.cells.find(c => !c.mat);
    if (!cell) { mintBox(); cell = M.cells.find(c => !c.mat); }
    if (!cell) break;
    const add = Math.min(cell.cap - cell.kg, left);
    cell.mat = mat; cell.kg += add; cell.g += add * gr; cell.site = site;
    left -= add;
    if (cell.kg >= cell.cap - 0.001) photographCell(cell);
  }
  syncBox();
}
function photographCell(cell) {
  if (!cell || !cell.mat || cell.photo) return;
  const grade = cell.g / cell.kg, conf = clamp(0.9 + Math.random() * 0.07 + M.confBoost, 0, 0.995);
  const seed = ((Math.random() * 1e9) | 0);
  const site = cell.site || [Math.floor(M.x), Math.floor(M.y)];
  const meta = {
    site: site.slice(), time_s: +M.step.toFixed(1), mass_kg: +cell.kg.toFixed(2),
    material: cell.mat, name_zh: MATERIALS[cell.mat].zh, name_en: MATERIALS[cell.mat].en,
    grade: +grade.toFixed(3), conf: +conf.toFixed(3), seed
  };
  meta.hash = sha256(JSON.stringify(meta));
  cell.photo = meta;
  M.snap = { photo: meta, mat: cell.mat, t: 4, seed };
}
function mintBox() {
  const ready = M.cells.filter(c => c.mat && c.kg > 0);
  if (!ready.length) { toastOnce('empty', t('nothing')); return; }
  M.bat = Math.max(0, M.bat - ROVER.emptyDrain * M.drainK);
  for (const cell of ready) {
    if (!cell.photo) photographCell(cell);
    const photo = cell.photo, mat = cell.mat, grade = cell.g / cell.kg;
    const value = Math.round(lotValue(mat, cell.kg, grade));
    const id = 'NFT-' + String(++save.stats.lots).padStart(4, '0');
    const tokenId = sha256(photo.hash + '|' + id);
    const nft = {
      lot_id: id, token_id: tokenId, material: mat, cn_name: MATERIALS[mat].zh,
      conf: photo.conf, mass_kg: +cell.kg.toFixed(2), grade: +grade.toFixed(3),
      price_per_kg: MATERIALS[mat].price, value_cny: value, sellable: true,
      listed: true, listedAt: clock, bids: [], sold: false, photo, sim: true
    };
    addBlock(M.ledger, 'asset', { lot_id: id, token_id: tokenId, material: mat, mass_kg: nft.mass_kg, value_cny: value, photo_hash: photo.hash });
    M.queue.push(nft); M.lots.push(nft); M.nfts.push(nft);
    toast(t('minted', id, L2(MATERIALS[mat]), nft.mass_kg));
    cell.mat = null; cell.kg = 0; cell.g = 0; cell.photo = null; cell.site = null;
  }
  syncBox(); persist(); audio.tone(300, 0.1, 'triangle', 0.06); audio.tone(600, 0.12, 'triangle', 0.06, 0, 0.08);
  if (!$('ovMarket').classList.contains('hide')) refreshMarket();
}
const SIM_BUYERS = ['Relay-7', 'Depot-A', 'Lab-3', 'Node-12', 'Archive-K', 'Survey-5'];
function updateMarket(dt) {
  if (!M || !M.nfts) return;
  for (const nft of M.nfts) {
    if (nft.sold || !nft.listed) continue;
    nft.bidT = (nft.bidT || 0) + dt;
    if (nft.bids.length < 3 && nft.bidT > 0.7 + nft.bids.length * 1.1) {
      const offer = Math.round(nft.value_cny * (0.86 + Math.random() * 0.22));
      nft.bids.push({ buyer: SIM_BUYERS[(Math.random() * SIM_BUYERS.length) | 0], offer, t: clock });
    }
  }
}
function bestBid(nft) { return nft.bids.length ? nft.bids.reduce((a, b) => a.offer >= b.offer ? a : b) : null; }
function acceptNft(nft, force) {
  if (!nft || nft.sold) return false;
  if (!force && !(M.relay.online && onSurface())) return false;
  const bid = bestBid(nft);
  const value = bid ? bid.offer : nft.value_cny;
  nft.sold = true; nft.listed = false; nft.sale = value;
  const i = M.queue.indexOf(nft); if (i >= 0) M.queue.splice(i, 1);
  addBlock(M.ledger, 'sale', { lot_id: nft.lot_id, token_id: nft.token_id, value_cny: value, via: 'simulated market', buyer: bid ? bid.buyer : 'reserve' });
  save.funds += value; save.stats.sold++; M.sales += value; run.sales += value; M.relay.sent++; persist();
  if (!force) { toast(t('sold', fmtInt(value))); audio.coin(); }
  awardMilestone('firstLot');
  if (!$('ovMarket').classList.contains('hide')) refreshMarket();
  return true;
}
// 星链在线且在地面时，模拟市场成交（store-and-forward）/ flush sales when the relay is online and the rover is on the surface
function flushQueue(force) {
  if (!M.queue.length) return;
  if (!force && !(M.relay.online && onSurface())) return;
  const lot = M.queue[0];
  if (!force && (clock - (lot.listedAt || 0) < 1.2) && !lot.bids.length) return;
  acceptNft(lot, force);
}

function updateMining(dt) {
  const u = save.up, G = 9;
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t -= dt; floats[i].y -= dt * 0.8; if (floats[i].t <= 0) floats.splice(i, 1); }
  stepParts(dt, 6);
  if (M.snap) { M.snap.t -= dt; if (M.snap.t <= 0) M.snap = null; }
  updateMarket(dt);
  if (taps.has('mint')) mintBox();
  if (M.dead) { M.deadT += dt; audio.engine(0); if (M.deadT > 1.6) endRun(true); return; }
  // 仿真步（日夜、星链）/ simulation steps (day/night, relay)
  const prevStep = Math.floor(M.step); M.step += dt * ROVER.stepsPerSec;
  if (Math.floor(M.step) !== prevStep) { updateRelay(M.relay, Math.floor(M.step)); flushQueue(false); }
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0), grounded = onGround(), sps = ROVER.stepsPerSec;
  let drain = 0.05 * sps; // 待机 / idle
  if (M.bat <= 0) { M.vx = 0; M.dig = null; }
  if (M.dig) {
    const held = M.dig.dir === 'down' ? input.down : (M.dig.dir === 1 ? input.right : input.left);
    if (!held) M.dig = null;
    else {
      M.dig.prog += dt; drain += 0.4 * sps;
      if (M.dig.dir === 'down') M.x += (M.dig.c + 0.5 - M.x) * Math.min(1, dt * 12);
      if (Math.random() < dt * 14) { audio.dig(); addPart(M.dig.c + 0.5 + (Math.random() - .5) * .6, M.dig.y + (M.dig.dir === 'down' ? 0.05 : 0.5), (Math.random() - .5) * 3, -1 - Math.random() * 2, 0.4, TILE[tileAt(M.dig.c, M.dig.y)].dot, 0.06); }
      if (M.dig.prog >= M.dig.need) finishDig();
    }
  }
  M.jet = false;
  if (!M.dig && M.bat > 0) {
    if (dir) { M.face = dir; M.vx = dir * (grounded ? 3.4 : 2.4); drain += ROVER.driveDrain * sps; } else M.vx = grounded ? 0 : M.vx * (1 - dt * 2);
    M.jet = (input.up || input.thrust) && M.bat > 0;
    if (M.jet) {
      M.vy -= 17 * dt; M.vy = Math.max(M.vy, -5); drain += 1.0 * sps;
      addPart(M.x - M.face * 0.25, M.y - 0.05, (Math.random() - .5) * 1.5, 3 + Math.random() * 2, 0.3, Math.random() < .5 ? '#9be7ff' : '#ffffff', 0.07);
    }
    if (grounded && input.down) {
      // 车身中心下方是空的（只靠边缘挂在台阶上）：先滑下台阶 / nothing under the centre (hanging on a ledge edge): slide off first
      const cMe = Math.floor(M.x), yB = Math.floor(M.y + 0.01);
      if (!solid(cMe, yB)) { const dx = cMe + 0.5 - M.x; M.x += Math.sign(dx || 1) * Math.min(dt * 3, Math.abs(dx) + 0.02); }
      else tryDig(cMe, yB, 'down');
    }
    else if (grounded && dir) {
      const c = Math.floor(M.x + dir * (HW + 0.06)), y = Math.floor(M.y - 0.3), cMe = Math.floor(M.x);
      if (solid(c, y)) { if (!solid(c, y - 1) && !solid(cMe, y - 1)) M.vy = -Math.sqrt(2 * G * 1.25); else tryDig(c, y, dir); }
    }
  }
  if (!(M.dig && M.dig.dir === 'down')) M.vy = Math.min(M.vy + G * dt, 11);
  moveX(M.vx * dt); moveY(M.vy * dt);
  if (M.y - HH < -6) { M.y = -6 + HH; M.vy = Math.max(0, M.vy); }
  // 电量：耗电 + 太阳能缓释（只在地面）+ 着陆器快充 / battery: drain + solar trickle (surface only) + lander fast charge
  let gain = 0;
  if (onSurface()) gain += (isDay() ? ROVER.solarDay : ROVER.solarNight) * sps * (1 + 0.25 * u.power);
  if (atLander()) gain += (isDay() ? ROVER.rechargeDay : ROVER.rechargeNight) * sps * (M.solarPart ? 1.5 : 1);
  // 温差 / 微流星故障（316L 外壳降低概率）/ thermal / micrometeoroid faults (316L shell lowers the odds)
  if (onSurface() && Math.random() < dt * 0.02 * M.faultK) { M.bat -= 5; toastOnce('fault', '⚡ -5%', 5); }
  M.bat = clamp(M.bat - drain * M.drainK * dt + gain * dt, 0, M.batMax);
  if (M.bat < ROVER.lowBattery && !M.lowWarned) { M.lowWarned = true; toast(t('lowBat')); audio.tone(300, 0.2, 'square', 0.06); }
  if (M.bat > ROVER.lowBattery * 2) M.lowWarned = false;
  if (M.bat <= 0 && !onSurface()) { M.dead = true; M.deadT = 0; M.dig = null; M.box = {}; M.boxKg = 0; toast(t('batDead')); audio.boom(0.15, 0.5); }
  const depth = Math.floor(M.y) - M.surf[LANDER_C];
  if (depth > M.maxDepth) M.maxDepth = depth;
  audio.engine(M.jet ? 0.35 : (M.dig ? 0.15 : 0));
}
function tileSprite(tp, variant) {
  const key = tp + '_' + variant; if (tileCache[key]) return tileCache[key];
  const px = Math.ceil(TS * DPR), c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'), r = mulberry32(tp * 977 + variant * 131 + 7), info = TILE[tp];
  g.fillStyle = info.base; g.fillRect(0, 0, px, px);
  g.fillStyle = info.dot; for (let i = 0; i < 9; i++) { const s = px * (0.05 + r() * 0.09); g.beginPath(); g.arc(r() * px, r() * px, s, 0, 6.283); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, px * 0.92, px, px * 0.08); g.fillRect(px * 0.92, 0, px * 0.08, px);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, px, px * 0.06);
  if (info.gem) {
    const n = tp === ORG ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const cx = px * (0.2 + r() * 0.6), cy = px * (0.2 + r() * 0.6), s = px * (0.1 + r() * 0.08);
      g.fillStyle = info.gem; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.8, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.8, cy); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.3, cy - s * 0.2); g.lineTo(cx - s * 0.2, cy - s * 0.1); g.fill();
    }
  }
  if (tp === BED) { g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = px * 0.05; g.beginPath(); g.moveTo(0, px * 0.3); g.lineTo(px * 0.5, px * 0.6); g.lineTo(px, px * 0.4); g.stroke(); }
  tileCache[key] = c; return c;
}
// 着陆器：圆形扁平扫地机造型（原创，无商标）/ lander: round flat robot-vacuum shape (original, no marks)
function drawLanderSmall(x, y, s) {
  ctx.save(); ctx.translate(x, y);
  const rx = 5.4 * s, ry = 2.15 * s;
  // bumper ring / 防撞圈
  ctx.fillStyle = '#3d424a';
  ctx.beginPath(); ctx.ellipse(0, -ry * 0.15, rx * 1.08, ry * 1.15, 0, 0, TAU); ctx.fill();
  // disc body / 圆盘机身
  const g = ctx.createLinearGradient(-rx, 0, rx, 0);
  g.addColorStop(0, '#9aa3ae'); g.addColorStop(0.45, '#e9edf2'); g.addColorStop(1, '#6f7782');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -ry * 0.2, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#5d6672'; ctx.lineWidth = Math.max(1, s * 0.18);
  ctx.beginPath(); ctx.ellipse(0, -ry * 0.2, rx, ry, 0, 0, TAU); ctx.stroke();
  // side brushes / 边刷
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = Math.max(1, s * 0.16);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * rx * 0.92, -ry * 0.05); ctx.rotate(clock * 8 * side);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * TAU / 6) * 1.6 * s, Math.sin(i * TAU / 6) * 1.6 * s); ctx.stroke(); }
    ctx.restore();
  }
  // top sensor turret / 顶部传感器塔
  ctx.fillStyle = '#30343b'; ctx.beginPath(); ctx.ellipse(0, -ry * 1.15, 1.5 * s, 1.15 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = M.relay.online ? `rgba(92,255,138,${0.55 + 0.45 * Math.sin(clock * 6)})` : '#1f8f4a';
  ctx.beginPath(); ctx.ellipse(0, -ry * 1.15, 0.7 * s, 0.55 * s, 0, 0, TAU); ctx.fill();
  if (M.solarPart) {
    ctx.fillStyle = '#25427f';
    ctx.fillRect(-rx * 0.85, -ry * 1.85, rx * 0.55, ry * 0.55);
    ctx.fillRect(rx * 0.3, -ry * 1.85, rx * 0.55, ry * 0.55);
  }
  // relay antenna / 中继天线
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = Math.max(1, s * 0.2);
  ctx.beginPath(); ctx.moveTo(1.2 * s, -ry * 1.6); ctx.lineTo(1.6 * s, -ry * 2.6); ctx.stroke();
  ctx.beginPath(); ctx.arc(1.6 * s, -ry * 2.85, 1.1 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.restore();
}
function renderMining() {
  const sy0 = M.surf[LANDER_C];
  let camX = M.x * TS - W / 2, camY = (M.y - 0.5) * TS - H * 0.45;
  camX = COLS * TS <= W ? (COLS * TS - W) / 2 : clamp(camX, 0, COLS * TS - W);
  camY = clamp(camY, -6 * TS, ROWS * TS - H + TS * 3);
  const toScr = (x, y) => [x * TS - camX, y * TS - camY];
  const day = isDay();
  ctx.fillStyle = day ? '#05060f' : '#010104'; ctx.fillRect(0, 0, W, H);
  drawStars(day ? 0.6 : 1, -camX * 0.2);
  const skyBottom = (sy0 - 3) * TS - camY;
  if (skyBottom > -TS * 4) {
    drawEarthIcon(W * 0.72, Math.max(140, skyBottom - TS * 2.5), Math.min(W, H) * 0.06);
    if (day) { ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(W * 0.18, Math.max(150, skyBottom - TS * 3.2), 10, 0, TAU); ctx.fill(); }
  }
  const c0 = Math.max(0, Math.floor(camX / TS)), c1 = Math.min(COLS - 1, Math.ceil((camX + W) / TS));
  const r0 = Math.max(0, Math.floor(camY / TS)), r1 = Math.min(ROWS - 1, Math.ceil((camY + H) / TS));
  for (let c = c0; c <= c1; c++) {
    const sTop = M.surf[c];
    for (let y = Math.max(r0, sTop); y <= r1; y++) {
      const tp = M.grid[y * COLS + c], [sx, sy] = toScr(c, y);
      if (tp === EMPTY) { ctx.fillStyle = '#1d1b1a'; ctx.fillRect(sx, sy, TS + 0.5, TS + 0.5); continue; }
      ctx.drawImage(tileSprite(tp, (c * 7 + y * 13) % 3), sx, sy, TS + 0.5, TS + 0.5);
      if (tileAt(c, y - 1) === EMPTY) { ctx.fillStyle = y === sTop ? (day ? 'rgba(225,222,214,.55)' : 'rgba(150,150,160,.35)') : 'rgba(220,218,210,.2)'; ctx.fillRect(sx, sy, TS + 0.5, Math.max(2, TS * 0.08)); }
    }
  }
  if (M.dig) {
    const [sx, sy] = toScr(M.dig.c, M.dig.y), p = clamp(M.dig.prog / M.dig.need, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 2; ctx.beginPath();
    const n = Math.ceil(p * 5); for (let i = 0; i < n; i++) { const a = i * 1.3; ctx.moveTo(sx + TS / 2, sy + TS / 2); ctx.lineTo(sx + TS / 2 + Math.cos(a) * TS * 0.45 * p, sy + TS / 2 + Math.sin(a) * TS * 0.45 * p); }
    ctx.stroke();
  }
  const [lx, ly] = toScr(LANDER_C + 0.5, sy0);
  if (atLander()) { ctx.strokeStyle = `rgba(92,255,138,${0.55 + 0.35 * Math.sin(clock * 6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx - TS * 1.6, ly - 1); ctx.lineTo(lx + TS * 1.6, ly - 1); ctx.stroke(); }
  drawLanderSmall(lx, ly, TS * 0.2);
  const [mx, my] = toScr(M.x, M.y);
  // 深度变暗 + 车灯 / darkness by depth + headlight
  const dark = clamp((M.y - sy0) / 40, 0, 0.82);
  if (dark > 0.02) {
    const gr = ctx.createRadialGradient(mx, my - TS * 0.4, TS * 1.2, mx, my - TS * 0.4, TS * (4.5 + M.scanR * 0.4));
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${dark})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  // AI 识别框（置信度 ≥ 阈值 0.90）/ AI detection boxes (confidence ≥ threshold 0.90)
  ctx.font = `600 ${Math.max(9, TS * 0.24)}px system-ui,sans-serif`; ctx.textAlign = 'center';
  const R = Math.ceil(M.scanR) + 1, mc = Math.floor(M.x), mr = Math.floor(M.y - 0.4);
  for (let c = Math.max(0, mc - R); c <= Math.min(COLS - 1, mc + R); c++) for (let y = Math.max(0, mr - R); y <= Math.min(ROWS - 1, mr + R); y++) {
    const tp = M.grid[y * COLS + c]; if (!TILE[tp] || !TILE[tp].mat) continue;
    const cf = tileConf(c, y); if (cf < ROVER.confThr) continue;
    const [sx, sy] = toScr(c, y); ctx.strokeStyle = 'rgba(92,255,138,.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 2, sy + 2, TS - 4, TS - 4);
    if (TS > 34) { ctx.fillStyle = '#5cff8a'; ctx.fillText(cf.toFixed(2), sx + TS / 2, sy + TS - 4); }
  }
  let arm = -0.15; if (M.dig) arm = M.dig.dir === 'down' ? 1.25 + Math.sin(clock * 30) * 0.06 : 0.2 + Math.sin(clock * 30) * 0.06;
  if (M.jet) { ctx.fillStyle = 'rgba(155,231,255,.75)'; ctx.beginPath(); ctx.moveTo(mx - TS * 0.15, my - TS * 0.05); ctx.lineTo(mx, my + TS * (0.3 + Math.random() * 0.2)); ctx.lineTo(mx + TS * 0.15, my - TS * 0.05); ctx.fill(); }
  drawRover(mx, my, TS * 0.95, M.face, arm, !!M.dig, M.dead);
  drawPartsM(toScr, TS);
  ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(12, TS * 0.34)}px system-ui,sans-serif`;
  for (const f of floats) { const [fx, fy] = toScr(f.x, f.y); ctx.globalAlpha = clamp(f.t, 0, 1); ctx.fillStyle = '#000'; ctx.fillText(f.text, fx + 1, fy + 1); ctx.fillStyle = f.color || '#fff'; ctx.fillText(f.text, fx, fy); }
  ctx.globalAlpha = 1;
  drawDustBoxHud();
  // 格子拍照卡片（含坐标、时间、质量、成分、哈希）/ compartment photo card with coords, time, mass, composition, hash
  if (M.snap && M.snap.photo) drawPhotoCard(M.snap.photo, clamp(M.snap.t, 0, 1));
  else if (M.snap) {
    const s = Math.min(96, W * 0.24), x0 = W - s - 12, y0 = H * 0.32, r = mulberry32(M.snap.seed), col = MATERIALS[M.snap.mat].rgb;
    ctx.globalAlpha = clamp(M.snap.t, 0, 1); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x0, y0, s, s);
    for (let i = 0; i < 140; i++) { const k = 0.7 + r() * 0.5; ctx.fillStyle = `rgb(${col[0] * k | 0},${col[1] * k | 0},${col[2] * k | 0})`; ctx.beginPath(); ctx.arc(x0 + r() * s, y0 + r() * s, 1 + r() * 3, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#5cff8a'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, s, s);
    ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText('📷 ' + L2(MATERIALS[M.snap.mat]), x0, y0 - 4);
    ctx.globalAlpha = 1;
  }
}
function drawDustBoxHud() {
  const cell = Math.min(28, Math.max(18, W * 0.062)), pad = 3, cols = BOX_COLS, rows = BOX_ROWS;
  const bw = cols * cell + (cols + 1) * pad, bh = rows * cell + (rows + 1) * pad + 16;
  const x0 = 8, y0 = H * 0.22;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(x0, y0, bw, bh, 8); ctx.fill();
  ctx.fillStyle = '#cfe3ff'; ctx.font = '600 10px system-ui,sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(t('dustBox') + ' 3×3', x0 + 6, y0 + 12);
  for (let i = 0; i < BOX_N; i++) {
    const c = M.cells[i], cx = x0 + pad + (i % cols) * (cell + pad), cy = y0 + 16 + pad + Math.floor(i / cols) * (cell + pad);
    ctx.fillStyle = '#1a1d24'; ctx.fillRect(cx, cy, cell, cell);
    if (c && c.mat && c.kg > 0) {
      const col = MATERIALS[c.mat].rgb, p = clamp(c.kg / c.cap, 0, 1);
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fillRect(cx + 1, cy + cell * (1 - p), cell - 2, cell * p);
      if (c.photo) { ctx.strokeStyle = '#5cff8a'; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1); }
    } else { ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1); }
  }
  ctx.restore();
}
function drawPhotoCard(photo, alpha) {
  const w = Math.min(168, W * 0.42), h = w * 1.15, x0 = W - w - 10, y0 = H * 0.28;
  const col = MATERIALS[photo.material].rgb, r = mulberry32(photo.seed);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = '#16181e'; ctx.strokeStyle = '#5cff8a'; ctx.lineWidth = 2;
  roundRect(x0, y0, w, h, 8); ctx.fill(); ctx.stroke();
  const img = w - 16, ix = x0 + 8, iy = y0 + 8;
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(ix, iy, img, img * 0.72);
  for (let i = 0; i < 180; i++) {
    const k = 0.65 + r() * 0.55;
    ctx.fillStyle = `rgb(${col[0] * k | 0},${col[1] * k | 0},${col[2] * k | 0})`;
    ctx.beginPath(); ctx.arc(ix + r() * img, iy + r() * img * 0.72, 1 + r() * 3.2, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#eef3ff'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'left';
  const lines = [
    '📷 ' + (save.lang === 'zh' ? photo.name_zh : photo.name_en),
    t('photoSite') + ' ' + photo.site[0] + ',' + photo.site[1],
    t('photoTime') + ' ' + photo.time_s + 's',
    t('photoMass') + ' ' + photo.mass_kg + ' kg · ' + (photo.grade * 100).toFixed(0) + '%',
    'SHA ' + photo.hash.slice(0, 12) + '…'
  ];
  let ty = iy + img * 0.72 + 14;
  for (const line of lines) { ctx.fillText(line, ix, ty); ty += 13; }
  ctx.restore();
}
function refreshMarket() {
  const box = $('marketList'); if (!box) return;
  box.innerHTML = '';
  const list = (M && M.nfts ? M.nfts.slice().reverse() : []);
  if (!list.length) { box.appendChild(el('p', '', t('marketEmpty'))); return; }
  list.forEach(nft => {
    const d = el('div', 'kv');
    const bid = bestBid(nft);
    const left = el('span', '', nft.lot_id + ' · ' + L2(MATERIALS[nft.material]) + ' ' + nft.mass_kg + 'kg');
    let right;
    if (nft.sold) right = el('span', 'gold', t('soldTag') + ' ¥' + fmtInt(nft.sale));
    else {
      right = el('span', '', '');
      const lab = el('span', 'gold', bid ? (bid.buyer + ' ¥' + fmtInt(bid.offer)) : t('waitingBid'));
      right.appendChild(lab);
      if (!nft.sold) {
        const b = el('button', 'mini', t('acceptBid'));
        b.style.marginLeft = '8px';
        b.onclick = () => { audio.click(); if (!acceptNft(nft, false)) toast(t('needRelay')); };
        right.appendChild(b);
      }
    }
    d.appendChild(left); d.appendChild(right); box.appendChild(d);
    const h = el('div', '', (nft.token_id || '').slice(0, 16) + '… · ' + (nft.photo ? nft.photo.hash.slice(0, 10) + '…' : ''));
    h.style.fontSize = '11px'; h.style.opacity = '.7'; h.style.margin = '-4px 0 8px';
    box.appendChild(h);
  });
}
function endRun(dead) {
  if (!dead) { mintBox(); while (M.queue.length) flushQueue(true); }
  else { M.queue = []; }
  const total = run.ms + run.sales;
  const isHigh = total > save.high; if (isHigh) save.high = total;
  save.stats.runs++; persist(); audio.engine(0); setPhase('over');
  const ok = verifyLedger(M.ledger);
  const rows = [[t('lots'), String(M.lots.length)], [t('sales'), '¥' + fmtInt(run.sales)], [t('msRewards'), '¥' + fmtInt(run.ms)],
    [t('ledger'), `${M.ledger.blocks.length} ${t('blocks')} · ${t('integrity')} ${ok ? t('ok') : '✕'}`], [t('funds'), '¥' + fmtInt(save.funds), 'gold'], [t('best'), '¥' + fmtInt(save.high)]];
  if (dead) rows.unshift([t('batDead'), '']);
  if (isHigh && total > 0) rows.unshift([t('newHigh'), '', 'gold']);
  const tip = M.ledger.blocks[M.ledger.blocks.length - 1];
  rows.push(['#' + tip.index + ' ' + tip.event, tip.hash.slice(0, 16) + '…']);
  showResult(t('runOver'), rows, [[t('toHangar'), openHangar], [t('rover'), () => openRoverShop(), true], [t('menu'), goMenu, true]]);
  if (!dead) audio.win();
}
