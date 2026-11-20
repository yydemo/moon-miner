'use strict';
/* =====================================================================
 * data.js — 游戏数据表 / Game data tables
 * 本文件的数值尽量取自 yydemo/star-chain-earn-mine 仓库（星链赚大矿 / 宇宙挖矿机器人 CMR），
 * 每一项都注明来源文件；对照表见 docs/DESIGN_MAPPING.md。
 * Numbers here come from the yydemo/star-chain-earn-mine repository (Cosmic Mining Rover, CMR)
 * wherever possible; each entry names its source file. See docs/DESIGN_MAPPING.md.
 * 注意：按原仓库的匿名化原则，游戏内不出现真实机构、人名、专利/软著编号。
 * Note: following the source repo's anonymization, no real institutions, people or patent /
 * software-copyright numbers appear in the game.
 * ===================================================================== */

// ===== 可改名常量（改这里即可全局生效）/ Renameable constants (change here, applies everywhere) =====
// 载荷 = 星链赚大矿的 CMR：由开源扫地机器人改装的宇宙挖矿机器人（README.md §1）
// Payload = star-chain's CMR: a cosmic mining rover converted from an open-source robot vacuum (README.md §1)
const DIGGER_NAME = { zh: 'CMR 宇宙挖矿机器人', en: 'CMR Cosmic Mining Rover' };
const GAME_NAME = { zh: '月球挖矿', en: 'Moon Miner' };
const SOURCE_REPO = 'https://github.com/yydemo/star-chain-earn-mine';

// ===== 现实参考数字 / Real-world reference figures =====
// 来源 / source: README.md §0, docs/launch_plan.md §1
const REAL = {
  rideshareBaseUSD: 350000,   // 起步价，含 50 kg 到 SSO / starting price incl. 50 kg to SSO
  rideshareBaseKg: 50,
  extraPerKgUSD: 7000,        // 超出部分 / per extra kg
  ssoAltKm: 525,              // 默认轨道 SSO 525 km / default orbit SSO 525 km
  ssoIncl: 97.5,
  cadenceMonths: 4,           // 约每 4 个月一班 / roughly every 4 months
  plates: [50, 100, 200, 300] // 1/4、1/2、整板、XL 载荷板 / 1/4, 1/2, full, XL plates (kg)
};
// 现实参考发射价（美元）/ Real-world reference launch price (USD)
function realLaunchUSD(kg) { return REAL.rideshareBaseUSD + Math.max(0, kg - REAL.rideshareBaseKg) * REAL.extraPerKgUSD; }

// ===== 游戏世界尺度（1:10 缩小的地月系统）/ Game world scale (Earth–Moon system shrunk 1:10) =====
// 重力保持真实（地 9.8、月 1.62 m/s²，月重力见 simulation/rover_sim.py WORLD_PROFILES）
// Surface gravity is kept real (Earth 9.8, Moon 1.62 m/s²; lunar g from simulation/rover_sim.py WORLD_PROFILES)
const SCALE = 10;
const BODIES = {
  earth: { id: 'earth', R: 637e3, g: 9.8, atmo: 40e3, H: 5000, rho0: 1.225, rotP: 86400 },
  moon: { id: 'moon', R: 173.7e3, g: 1.62, dist: 38.44e6 }
};
BODIES.earth.mu = BODIES.earth.g * BODIES.earth.R * BODIES.earth.R;
BODIES.moon.mu = BODIES.moon.g * BODIES.moon.R * BODIES.moon.R;
BODIES.moon.soi = BODIES.moon.dist * Math.pow(BODIES.moon.mu / BODIES.earth.mu, 0.4);
BODIES.moon.period = 2 * Math.PI * Math.sqrt(Math.pow(BODIES.moon.dist, 3) / BODIES.earth.mu);
// 任务目标轨道：SSO 525 km 按 1:10 → 52.5 km（docs/launch_plan.md §1）
// Target orbit: SSO 525 km scaled 1:10 → 52.5 km (docs/launch_plan.md §1)
const TARGET_ORBIT = REAL.ssoAltKm * 1000 / SCALE;

// ===== 火箭零件 / Rocket parts =====
// 质量单位 t，推力 kN，比冲 s。全部为原创虚构型号。
// Mass in t, thrust in kN, Isp in s. All models are original and fictional.
// kind: core 飞控 | bay 载荷舱 | fairing 整流罩 | solar 太阳能 | legs 着陆腿 | tank 储箱 | engine 发动机 | dec 分离环
const PARTS = {
  // 抗辐射飞控舱：对应 README §2 "抗辐射算力与电源 (Rad-Hard Core)"、docs/hardware_mod.md §3.3
  // Rad-hard avionics core: README §2 "Rad-Hard Core", docs/hardware_mod.md §3.3
  core:   { kind: 'core', mass: 0.3, w: 1.6, h: 1.2, cost: 0, color: '#d9dee8' },
  // CMR 载荷舱：装着整台 CMR（33–49 kg，docs/hardware_mod.md §4）
  // CMR rover bay: holds the whole CMR (33–49 kg, docs/hardware_mod.md §4)
  bay:    { kind: 'bay', mass: 0.45, w: 2, h: 1.6, cost: 0, color: '#c8ccd6' },
  fairing:{ kind: 'fairing', mass: 0.15, w: 2, h: 2.4, cost: 0, color: '#eef1f7' },
  // 太阳能阵：替换扫地机回充基站（README §1、hardware_mod.md §2）
  // Solar array: replaces the vacuum's charging dock (README §1, hardware_mod.md §2)
  solar:  { kind: 'solar', mass: 0.05, w: 2, h: 0.4, cost: 0, color: '#2a4f9a' },
  legs:   { kind: 'legs', mass: 0.1, w: 2, h: 0.6, cost: 0, color: '#9aa1ad', tol: 6 },
  legsXL: { kind: 'legs', mass: 0.18, w: 2.6, h: 0.7, cost: 15000, color: '#b6bcc7', tol: 9 },
  tankS:  { kind: 'tank', mass: 1.0, dry: 0.12, w: 2, h: 1.4, cost: 0, color: '#f2f4f8' },
  tankM:  { kind: 'tank', mass: 2.5, dry: 0.28, w: 2, h: 3, cost: 0, color: '#f2f4f8' },
  tankL:  { kind: 'tank', mass: 6.0, dry: 0.6, w: 2.6, h: 5, cost: 0, color: '#f2f4f8' },
  tankXL: { kind: 'tank', mass: 14, dry: 1.3, w: 3.4, h: 8, cost: 0, color: '#f2f4f8' },
  // 不锈钢轻量化储箱：316L 不锈钢 / 薄壁蜂窝结构（hardware_mod.md §3.1）
  // Stainless lightweight tank: 316L stainless / thin-wall honeycomb (hardware_mod.md §3.1)
  tankSS: { kind: 'tank', mass: 6.0, dry: 0.42, w: 2.6, h: 5, cost: 30000, color: '#c9d2dc' },
  engLander: { kind: 'engine', mass: 0.2, w: 1.4, h: 1, thrust: 30, ispVac: 320, ispSL: 250, cost: 0, color: '#7b8190' },
  engVac:    { kind: 'engine', mass: 0.4, w: 1.8, h: 1.6, thrust: 60, ispVac: 345, ispSL: 140, cost: 0, color: '#6f7686' },
  engLift:   { kind: 'engine', mass: 1.2, w: 2.6, h: 1.8, thrust: 300, ispVac: 300, ispSL: 275, cost: 0, color: '#5d6474' },
  engHeavy:  { kind: 'engine', mass: 2.5, w: 3.4, h: 2.2, thrust: 700, ispVac: 305, ispSL: 280, cost: 0, color: '#545b6b' },
  // 三代半 SiC/GaN 电源：效率更高 → 高比冲真空发动机（README §2、guangzhou_semi.md 匿名化引用）
  // 3rd-gen SiC/GaN power → higher-Isp vacuum engine (README §2; guangzhou_semi.md, anonymized)
  engVacHi:  { kind: 'engine', mass: 0.45, w: 1.8, h: 1.8, thrust: 70, ispVac: 380, ispSL: 120, cost: 40000, color: '#4f6aa0' },
  engHeavy2: { kind: 'engine', mass: 3.0, w: 3.4, h: 2.4, thrust: 1000, ispVac: 310, ispSL: 285, cost: 60000, color: '#4a5263' },
  dec:    { kind: 'dec', mass: 0.05, w: 2, h: 0.35, cost: 0, color: '#3b3f48' },
  decL:   { kind: 'dec', mass: 0.1, w: 3.4, h: 0.4, cost: 0, color: '#3b3f48' }
};
const PART_ORDER = ['core', 'bay', 'fairing', 'solar', 'legs', 'legsXL', 'tankS', 'tankM', 'tankL', 'tankXL', 'tankSS',
  'engLander', 'engVac', 'engVacHi', 'engLift', 'engHeavy', 'engHeavy2', 'dec', 'decL'];
// 默认火箭（自上而下）：可直接登月 / Default rocket (top → bottom): can reach the Moon as-is
const DEFAULT_ROCKET = ['core', 'bay', 'solar', 'tankM', 'engLander', 'legs', 'dec', 'tankL', 'engVac', 'decL', 'tankXL', 'tankL', 'engHeavy'];

// ===== 材质与价格 / Materials and prices =====
// 单价（¥/kg）原样取自 simulation/dustbox_vision.py MATERIALS；颜色取自 _MATERIAL_COLORS
// Prices (¥/kg) copied from simulation/dustbox_vision.py MATERIALS; colours from _MATERIAL_COLORS
const MATERIALS = {
  rare_earth: { zh: '稀土氧化物', en: 'Rare-earth oxides', price: 180, rgb: [90, 230, 120] },
  metallic:   { zh: '金属矿', en: 'Metallic ore', price: 95, rgb: [150, 160, 190] },
  silicate:   { zh: '硅酸盐岩', en: 'Silicate rock', price: 12, rgb: [165, 120, 80] },
  water_ice:  { zh: '水冰', en: 'Water ice', price: 60, rgb: [225, 240, 255] },
  organic:    { zh: '有机物/碳质', en: 'Organic / carbonaceous', price: 140, rgb: [190, 90, 80] }
};
// 估值公式：单价 × 质量 × (0.5 + 0.5 × 品位)（dustbox_vision.py LotMinter.mint）
// Valuation: price × mass × (0.5 + 0.5 × grade) (dustbox_vision.py LotMinter.mint)
// 游戏假设：地外样品稀缺溢价 ×10（monetization.md ⑤ "稀缺地外样品光谱数据是长期稀缺资产"）
// Game assumption: off-world scarcity premium ×10 (monetization.md ⑤ "rare extraterrestrial sample data are scarce assets")
const SCARCITY_PREMIUM = 10;
function lotValue(mat, kg, grade) { return MATERIALS[mat].price * kg * (0.5 + 0.5 * grade) * SCARCITY_PREMIUM; }

// ===== CMR 机器人参数 / CMR rover parameters =====
// 来源 / source: simulation/rover_sim.py (Rover.__init__, step), docs/hardware_mod.md §4
const ROVER = {
  battery: 100,          // 初始电量 % / initial battery %
  dustCap: 12,           // 集尘盒容量 kg / dust-box capacity (kg)
  confThr: 0.90,         // 矿石源检测置信阈值 / ore-source detection confidence threshold
  driveDrain: 0.4,       // 每步移动耗电 / battery per move step
  mineDrain: 2.5,        // 每次采掘耗电 / battery per mining action
  emptyDrain: 1.0,       // 排空集尘盒耗电 / battery to empty the dust box
  rechargeDay: 3.0, rechargeNight: 0.6, // RECHARGE 动作 / RECHARGE action
  solarDay: 0.8, solarNight: 0.1,       // 太阳能缓释 / solar trickle
  dayCycle: 40, dayFrac: 0.7,           // 日夜循环（步）/ day cycle (steps)
  lowBattery: 15,
  stepsPerSec: 2.5,      // 游戏映射：1 秒 ≈ 2.5 仿真步 / game mapping: 1 s ≈ 2.5 sim steps
  // 重量预算（kg）/ mass budget (kg), hardware_mod.md §4 — 取各项下限 / lower bound of each item
  massBase: { chassis: 8, shell: 6, tool: 3, power: 8, board: 3, margin: 5 } // = 33 kg
};
// CMR 升级：每项增加机器人质量，上限对应 33–49 kg 预算（hardware_mod.md §4）
// CMR upgrades: each adds rover mass, matching the 33–49 kg budget (hardware_mod.md §4)
const ROVER_UPS = {
  tool:   { base: 12000, kg: 0.5, max: 4 },  // 钻探/研磨工具头 / drill-grind tool head (3–5 kg)
  bay:    { base: 10000, kg: 0.5, max: 4 },  // 样品仓 / 集尘盒 / sample bay / dust box
  power:  { base: 11000, kg: 1.0, max: 4 },  // 电池+太阳能阵 / battery + solar array (8–12 kg)
  sic:    { base: 15000, kg: 0.5, max: 4 },  // 抗辐射 SiC 电源（降耗）/ rad-hard SiC power (less drain) (3–5 kg board)
  ai:     { base: 14000, kg: 0.0, max: 4 },  // 机载 AI：去噪 + 矿石源检测 / onboard AI: denoise + ore detect
  shell:  { base: 9000, kg: 1.0, max: 4 }    // 316L 不锈钢外壳 / 316L stainless shell (6–10 kg)
};
const ROVER_UP_ORDER = ['tool', 'bay', 'power', 'sic', 'ai', 'shell'];
const upCost = (k, lvl) => Math.round(ROVER_UPS[k].base * Math.pow(1.6, lvl));
function roverMassKg(up) {
  let m = 0; for (const k in ROVER.massBase) m += ROVER.massBase[k];
  for (const k of ROVER_UP_ORDER) m += (up[k] || 0) * ROVER_UPS[k].kg;
  return m; // 33 → 49 kg
}

// ===== 里程碑合同（一次性资金）/ Milestone contracts (one-time funding) =====
// 对应三阶段路线图与变现路径（README §5、docs/monetization.md、docs/launch_plan.md §5）
// Mapped to the three-stage roadmap and monetization paths (README §5, docs/monetization.md, docs/launch_plan.md §5)
const MILESTONES = [
  { id: 'space',   reward: 8000 },   // 阶段 A：仿真软件授权 / Stage A: simulation licence
  { id: 'orbit',   reward: 20000 },  // 阶段 B：SSO 技术验证载荷 / Stage B: SSO tech-demo payload
  { id: 'soi',     reward: 20000 },  // 阶段 B：科研服务合同 / Stage B: research service contract
  { id: 'lorbit',  reward: 25000 },  // 阶段 C：地月转移 / Stage C: trans-lunar
  { id: 'landed',  reward: 40000 },  // 阶段 C：月球南极水冰/稀土 / Stage C: lunar south pole ice / rare earths
  { id: 'firstLot',reward: 15000 }   // 区块链溯源样品成交 / first on-chain sample sale
];

// ===== 星链中继（低轨星座）/ Star-chain relay (LEO constellation) =====
// 参数取自 simulation/starlink_comm.py Starlink.__init__ 默认值（游戏中 1 步 = 1 秒）
// From simulation/starlink_comm.py Starlink.__init__ defaults (1 step = 1 s in game)
const RELAY = { nSats: 8, passPeriod: 18, passDuration: 8, latencyBase: 30, latencyRelay: 35, relayProb: 0.3, bwMin: 50, bwMax: 150 };
// 区块链：PoW-lite 前导 0 难度 2，rover_id "CMR"（simulation/blockchain_ledger.py、rover_sim.py）
// Blockchain: PoW-lite leading-zero difficulty 2, rover_id "CMR" (simulation/blockchain_ledger.py, rover_sim.py)
const LEDGER_DIFFICULTY = 2;
