# 设计对照表：「星链赚大矿」→ 月球挖矿 / Design Mapping: "Star-chain Earn-Mine" → Moon Miner

> 语言说明 / Language note：本文中英双语，先中文后英文。 / This document is bilingual: Chinese first, then English.

本游戏按 [yydemo/star-chain-earn-mine](https://github.com/yydemo/star-chain-earn-mine)（宇宙挖矿机器人 CMR）的实际内容重做。下表列出每个设计决定取自哪个文件。原仓库中出现的数值尽量原样使用；为了可玩性做的缩放或假设都单独标出。

Moon Miner was rebuilt around the actual content of [yydemo/star-chain-earn-mine](https://github.com/yydemo/star-chain-earn-mine) (the Cosmic Mining Rover, CMR). The tables below list which file each design choice comes from. Figures from the source repo are used as-is wherever possible; any scaling or assumption made for playability is marked separately.

**匿名化 / Anonymization**：原仓库刻意隐去了合作机构、个人姓名和资质编号。游戏和本仓库的公开文字同样不出现真实高校/研究院/企业名称、院士或其他人名、专利号或软著号；只用"国内第三代半导体（SiC/GaN）抗辐射器件""商业拼车发射""低轨星座中继"这类泛称。所有火箭零件型号（跳跳-1、远航-2、托举-5 等）均为原创虚构。

**Anonymization**: the source repo deliberately hides partner institutions, personal names and credential numbers. The game and this repo's public text likewise contain no real university / institute / company names, no academicians or other people, and no patent or software-copyright numbers; only generic terms such as "domestic third-generation semiconductor (SiC/GaN) rad-hard devices", "commercial rideshare launch" and "LEO constellation relay" are used. All rocket part models (Hop-1, Voyager-2, Lift-5, …) are original and fictional.

**v3 外观与市场 / v3 look and market**：飞船画成通用的胶囊返回舱（无第三方名称或标志），着陆器画成圆形扁平的扫地机（同样无商标）。尘盒改为 3×3 格，每格拍照后生成模拟 NFT，在游戏内市场由模拟买家出价。市场、账本和 NFT 都只存在于本机游戏里，不连接真实区块链，也不涉及真钱。

**v3 look and market**: the spacecraft is drawn as a generic crew/cargo capsule (no third-party names or marks) and the lander as a round, flat robot vacuum (also with no trademarks). The dust box is a 3×3 grid; each compartment is photographed and minted as a simulated NFT, then listed on an in-game market with simulated bidders. The market, the ledger and the NFTs exist only inside this local game: there is no real blockchain and no real money.

---

## 1. 故事与载荷 / Story and payload

| 游戏设计 / Game design | 来源 / Source | 说明 / Notes |
|---|---|---|
| 载荷是 **CMR 宇宙挖矿机器人**：开源扫地机器人改装，圆盘差速底盘 + 激光雷达 + 不锈钢外壳 + 钻探工具头 + 太阳能板（原创矢量画） / The payload is the **CMR Cosmic Mining Rover**: a converted open-source robot vacuum — disc differential chassis + LiDAR + stainless shell + drill tool head + solar panel (original vector art) | `README.md` §1、`docs/hardware_mod.md` §1–3 | 名称在 `js/data.js` 的 `DIGGER_NAME` 常量里，可改 / Name lives in the `DIGGER_NAME` constant in `js/data.js` and can be changed |
| 目标：**月球南极**，水冰 / 稀土 / Target: the **lunar south pole**, water ice / rare earths | `README.md` §5 阶段 C、`docs/launch_plan.md` §2 | 矿区里水冰浅、稀土深 / Ice is shallow, rare earths deep in the mine |
| 三段式路线图 → 里程碑合同 / Three-stage roadmap → milestone contracts | `README.md` §5、`docs/launch_plan.md` §5、`docs/monetization.md` | 见第 5 节 / See section 5 |
| 关于页、主菜单与 README 互相链接到原仓库与本游戏 / About screen, main menu and README cross-link the source repo and this game | — | 游戏菜单「星链项目」指向原仓库；原仓库 README 指向本游戏试玩链接 / The in-game "Star-chain project" button opens the source repo; the source README links to this game |
| 飞船为通用胶囊返回舱，火箭是运载工具 / Spacecraft is a generic crew/cargo capsule; the rocket is the ride | 视觉为原创，不引用任何公司产品 / Original art, not a depiction of any company's product | `js/vessel.js` `drawPart('core')` |
| 着陆器为圆形扁平扫地机造型 / Lander is a round, flat robot-vacuum shape | `README.md` §1、`docs/hardware_mod.md` §1–3（开源扫地机改装） / converted open-source vacuum | `js/mining.js` `drawLanderSmall`；无商标 / no trademarks |

## 2. 发射与轨道 / Launch and orbit

| 游戏设计 / Game design | 来源 / Source | 说明 / Notes |
|---|---|---|
| 机库显示**现实参考发射价**：$350,000 含 50 kg，超出 $7,000/kg / The hangar shows the **real-world reference launch price**: $350,000 including 50 kg, plus $7,000/kg beyond | `README.md` §0、`docs/launch_plan.md` §1 | `REAL`、`realLaunchUSD()` |
| 载荷板 1/4 板 50 kg、1/2 板 100 kg、整板 200 kg、XL 300 kg，机库提示适配哪块板 / Plates: 1/4 50 kg, 1/2 100 kg, full 200 kg, XL 300 kg; the hangar shows which plate fits | `docs/launch_plan.md` §1 | `REAL.plates` |
| 第一个轨道目标 = **SSO 525 km**，按 1:10 缩小为 52.5 km / First orbital target = **SSO 525 km**, scaled 1:10 to 52.5 km | `docs/launch_plan.md` §1、§2（先做 SSO/LEO 技术验证）/ (fly an SSO/LEO tech demo first) | `TARGET_ORBIT`；**游戏缩放** / **game scaling** |
| 地月系统按 1:10 缩小，表面重力保持真实（地 9.8、月 1.62 m/s²） / Earth–Moon system shrunk 1:10, real surface gravity (Earth 9.8, Moon 1.62 m/s²) | 月重力 1.62 来自 `simulation/rover_sim.py` `WORLD_PROFILES` / lunar g 1.62 from `simulation/rover_sim.py` `WORLD_PROFILES` | `BODIES`；**游戏缩放** / **game scaling** |
| "抗辐射飞控舱"零件（提供姿态控制） / "Rad-hard avionics core" part (attitude control) | `README.md` §2 Rad-Hard Core、`docs/hardware_mod.md` §3.3 | 匿名化：不写具体机构 / Anonymized: no institution named |
| "三代半真空机 远航-3"（高比冲）、"316L 轻量储箱"（干重更低） / "3rd-gen vacuum engine Voyager-3" (high Isp), "316L light tank" (lower dry mass) | SiC/GaN 电源：`README.md` §2；316L/蜂窝减重：`docs/hardware_mod.md` §3.1 | 可解锁零件；性能数字为游戏设定 / Unlockable parts; performance numbers are game settings |
| 太阳能阵零件（替换回充基站），着陆后给 CMR 加速充电 / Solar array part (replaces the charging dock); speeds CMR charging after landing | `README.md` §1、`docs/hardware_mod.md` §2 | `solarPart` |

## 3. CMR 机器人 / The CMR rover

| 游戏设计 / Game design | 来源 / Source | 说明 / Notes |
|---|---|---|
| CMR 质量 **33 kg** 起，升级后最高 **49 kg**；目标 < 50 kg 适配 1/4 板 / CMR mass starts at **33 kg**, up to **49 kg** with upgrades; target < 50 kg for a 1/4 plate | `docs/hardware_mod.md` §4 重量预算 / mass budget | `ROVER.massBase`、`roverMassKg()` |
| 六项升级：工具头、样品仓/集尘盒、电池+太阳能阵、抗辐射 SiC 电源、机载 AI、316L 外壳 / Six upgrades: tool head, sample bay/dust box, battery + solar array, rad-hard SiC power, onboard AI, 316L shell | `docs/hardware_mod.md` §3.1–3.3、§4；`README.md` §2 | 每项增加的质量对应预算区间 / Mass added per upgrade follows the budget ranges |
| 电量 100%，移动 0.4/步，采掘 2.5/次，排空集尘盒 1.0，低于 15% 报警 / Battery 100%, move 0.4/step, mine 2.5/action, empty dust box 1.0, alarm below 15% | `simulation/rover_sim.py` `Rover.step` | `ROVER`；游戏里 1 秒 ≈ 2.5 步 / 1 s ≈ 2.5 steps in game |
| 太阳能缓释 白天 0.8 / 夜晚 0.1，充电 3.0 / 0.6；日夜循环 40 步、白天占 70% / Solar trickle day 0.8 / night 0.1, recharge 3.0 / 0.6; day cycle 40 steps, 70% day | `simulation/rover_sim.py` `WORLD_PROFILES["generic"]`、`Rover.step` | 只在地面晒得到太阳 / Sunlight only on the surface |
| 集尘盒容量 **12 kg**，满了自动"排空"（铸造） / Dust-box capacity **12 kg**; when full it is "emptied" (minted) automatically | `simulation/rover_sim.py` `dust_capacity = 12.0`、`_empty_dustbox` | 升级每级 +3 kg / +3 kg per upgrade level |
| AI 识别框：置信度 ≥ **0.90** 才标出矿石 / AI boxes: ore is marked only at confidence ≥ **0.90** | `simulation/rover_sim.py` `conf_thr = 0.90`、`simulation/ai_core.py`（去噪 + 源检测 / denoise + source detection） | `ROVER.confThr`、`tileConf()` |
| 勘探 → 感知 → 检测 → 接近 → 采掘 → 入库 → 中继 → 续航 的闭环 / explore → sense → detect → approach → mine → store → relay → energy loop | `README.md` §4、`simulation/rover_sim.py` | 采矿场景的玩法骨架 / Backbone of the mining scene |

## 4. 资源与经济 / Resources and economy

| 游戏设计 / Game design | 来源 / Source | 说明 / Notes |
|---|---|---|
| 五种材质与单价：稀土氧化物 ¥180/kg、金属矿 ¥95、有机物/碳质 ¥140、水冰 ¥60、硅酸盐岩 ¥12 / Five materials and prices: rare-earth oxides ¥180/kg, metallic ore ¥95, organic/carbonaceous ¥140, water ice ¥60, silicate rock ¥12 | `simulation/dustbox_vision.py` `MATERIALS` | 颜色取自 `_MATERIAL_COLORS` / Colours from `_MATERIAL_COLORS` |
| 批次估值 = 单价 × 质量 × (0.5 + 0.5 × 品位) / Lot value = price × mass × (0.5 + 0.5 × grade) | `simulation/dustbox_vision.py` `LotMinter.mint` | `lotValue()` |
| **稀缺溢价 ×10**（游戏假设） / **Scarcity premium ×10** (game assumption) | `docs/monetization.md` ⑤ 地外样品数据是长期稀缺资产 / off-world sample data are scarce assets | 原仓库强调发射前矿石本身不值钱；不乘溢价的话一次任务只赚几千元，玩不下去 / The source stresses ore alone is not worth much before launch; without a premium a mission would earn only a few thousand yuan |
| 集尘盒满 → 摄像快照 → 分类（材质 + 置信度）→ 每种材质铸造一个链上资产（`LOT-0001`…） / Dust box full → camera snapshot → classification (material + confidence) → one on-chain asset per material (`LOT-0001`…) | `simulation/dustbox_vision.py` `CameraSnap`、`ImageClassifier`、`LotMinter`；`docs/system_overview.md` §2 | 屏幕右侧显示快照画面 / Snapshot shown on the right of the screen |
| 区块链账本：SHA-256 哈希链 + PoW-lite 前导 0 难度 2，`rover_id = "CMR"`，事件 genesis / mine / asset / sale，结算时校验完整性 / Ledger: SHA-256 hash chain + PoW-lite leading-zero difficulty 2, `rover_id = "CMR"`, events genesis / mine / asset / sale, integrity checked at the end | `simulation/blockchain_ledger.py`、`docs/blockchain.md`、`docs/system_overview.md` §6 | `addBlock()`、`verifyLedger()`；SHA-256 为原创 JS 实现 / original JS implementation |
| 星链中继：8 颗星错相位，过顶周期 18 步、窗口 8 步，时延 30 ms（30% 概率中继 +35 ms），带宽 50–150 Mbps；离线时排队（store-and-forward），在线且在地面时成交 / Relay: 8 staggered satellites, pass period 18 steps, window 8 steps, latency 30 ms (+35 ms relay at 30%), bandwidth 50–150 Mbps; queued while offline (store-and-forward), sold when online and on the surface | `simulation/starlink_comm.py` `Starlink.__init__`、`flush`；`docs/system_overview.md` §2 | `RELAY`；"在地下收不到信号"是游戏假设 / "No signal underground" is a game assumption |

## 5. 里程碑合同（阶段 A/B/C） / Milestone contracts (Stages A/B/C)

| 里程碑 / Milestone | 奖励 / Reward | 来源 / Source |
|---|---|---|
| 进入太空（40 km） / Reach space (40 km) | ¥8,000 — 阶段 A：仿真软件授权 / Stage A: simulation licence | `docs/monetization.md` ①、`README.md` §5 |
| 近地轨道 / Earth orbit | ¥20,000 — 阶段 B：SSO 技术验证载荷 / Stage B: SSO tech-demo payload | `docs/launch_plan.md` §2、§5 |
| 进入月球引力范围 / Enter the Moon's SOI | ¥20,000 — 阶段 B：科研服务合同 / Stage B: research service contract | `docs/monetization.md` ③（单笔 5–50 万元量级 / 50k–500k yuan per project） |
| 环月轨道 / Lunar orbit | ¥25,000 — 阶段 C：地月转移验证 / Stage C: trans-lunar validation | `README.md` §5 阶段 C |
| 月面着陆 / Lunar landing | ¥40,000 — 阶段 C：月球南极水冰/稀土勘探 / Stage C: lunar south pole ice / rare-earth survey | `README.md` §5、`docs/launch_plan.md` §2 |
| 首批样品链上成交 / First lot sold on-chain | ¥15,000 — 区块链溯源样品 / provenance-tracked sample | `docs/blockchain.md`、`docs/system_overview.md` §2 |

奖励金额是游戏数值，按原仓库"先用软件/科研服务赚钱，再去发射"的顺序递增。 / Reward amounts are game values that rise in the source repo's order: "earn with software / research services first, then launch".

## 6. 没有照搬的内容 / What was not carried over

- 火星世界（尘暴、3.71 m/s²）——留作后续扩展。 / The Mars world (dust storms, 3.71 m/s²) — left for a future update.
- 真实机构、人名、专利/软著编号——按匿名化原则不放入。 / Real institutions, people, patent / software-copyright numbers — excluded under the anonymization rule.
- 小行星绕飞——游戏只做地月系统。 / Asteroid fly-bys — the game covers only the Earth–Moon system.
