# 月球挖矿 Moon Miner 🚀🌕⛏️

> 发射火箭，把一台小挖掘机送上月球，平稳着陆，然后开着它挖矿赚钱、升级装备。
> Launch a rocket, carry a little excavator to the Moon, land it softly, then drive it around to mine ore, earn credits and buy upgrades.

**▶ 在线试玩 / Play now: <https://yydemo.github.io/moon-miner/>**（手机、电脑浏览器都能玩 / works on phones and desktop browsers）

![月球挖矿截图 / Moon Miner screenshot](docs/screenshot.png)

## 简介 / Introduction

- 单个 `index.html`，纯原生 JavaScript + Canvas，不需要构建，也不依赖任何外部库或 CDN。
  A single `index.html` in vanilla JavaScript + Canvas: no build step, no external libraries or CDNs.
- 所有画面（火箭、着陆器、挖掘机、月面、矿物）都由代码实时绘制，没有图片素材；音效由 WebAudio 实时合成。
  Every visual (rocket, lander, excavator, terrain, ore) is drawn by code at runtime with no image assets; sound effects are synthesised with WebAudio.
- 全部代码原创，没有使用、反编译或模仿任何其他游戏的代码和素材。
  All code is original. No code or assets from any other game were used, decompiled or imitated.
- 中英双语界面（右上角「EN / 中」切换，会记住你的选择）。
  Bilingual Chinese / English UI (tap "EN / 中" at the top right; your choice is remembered).
- 支持「添加到主屏幕」，离线也能玩（PWA）。
  Can be added to the home screen and played offline (PWA).

## 玩法 / How to play

1. **发射 / Launch**：按住「点火」让火箭升空。一级燃料用完时「分离」按钮会闪烁，0.8 秒内点它可拿「完美分离」奖励（2 秒后会自动分离）。到达 120 km 进入地月转移。
   Hold **Thrust** to lift off. When stage 1 runs dry the **Stage** button flashes; tap it within 0.8 s for a "perfect staging" bonus (it auto-stages after 2 s). Reach 120 km to start the trip to the Moon.
2. **地月转移 / Transfer**：一段过场动画，可点「跳过」。
   A short cutscene you can skip.
3. **着陆 / Landing**：用 ◀ ▶ 调整姿态、「点火」减速。触地时下降速度 < 3 m/s、水平速度 < 2.5 m/s、倾角 < 15° 才算成功。落在绿灯着陆场上、或者轻柔着陆（< 1 m/s）还有额外奖励。坠毁可免费重试着陆。
   Tilt with ◀ ▶ and fire **Thrust** to slow down. Touch down with descent < 3 m/s, drift < 2.5 m/s and tilt < 15°. Landing on the green-lit pad or touching down below 1 m/s earns extra. A crash lets you retry the landing for free.
4. **采矿 / Mining**：驾驶「小矿工挖掘机」：◀ ▶ 行驶，▼ 向下挖，顶着墙走会横向挖，碰到一格高的台阶会自动爬上去，▲ 推进器往上飞。货舱装满后回到着陆器，自动卸货换钱并充电。电量耗尽会丢失舱内货物。回到着陆器旁点「结束」完成任务。
   Drive the **Little Digger**: ◀ ▶ to drive, ▼ to dig down, push into a wall to dig sideways (it climbs one-tile steps by itself), ▲ fires the jet. When the cargo bay is full, return to the lander to sell the ore and recharge. If the battery dies, the cargo on board is lost. Tap **End** next to the lander to finish the mission.
5. **升级 / Upgrades**：在商店用资金升级钻头、货舱、燃料箱、发动机、电池（每项 5 级）。资金、最高分、升级和成就都保存在本机浏览器里（localStorage）。
   Spend credits on the drill, cargo bay, fuel tanks, engine and battery (5 levels each). Credits, high score, upgrades and achievements are saved in your browser (localStorage).

### 矿物 / Resources

| 矿物 Resource | 售价 Value | 出现深度 Depth | 说明 Notes |
|---|---|---|---|
| 月壤 Regolith | 0 | 表层 surface | 好挖，不占货舱 / soft, not collected |
| 玄武岩 Basalt | 0 | 越深越多 more at depth | 比较硬 / harder |
| 水冰 Water ice | 15 | ≥ 1 m | |
| 铁矿 Iron | 25 | ≥ 6 m | |
| 钛铁矿 Titanium | 60 | ≥ 20 m | 很硬 / very hard |
| 氦-3 Helium-3 | 200 | ≥ 34 m | 稀有 / rare |
| 基岩 Bedrock | — | 边界 edges | 挖不动 / undiggable |

### 成就 / Achievements

点火升空 Liftoff · 完美分离 Clean Staging · 鹰已着陆 The Eagle Has Landed · 羽毛落地 Feather Touch · 精准着陆 Bullseye · 未来能源 Future Fuel · 深层勘探 Deep Survey · 月球富翁 Moon Tycoon · 顶级装备 Top Gear · 老练宇航员 Veteran

## 操作 / Controls

| 动作 Action | 手机 Touch | 键盘 Keyboard |
|---|---|---|
| 点火 / 推进 Thrust / jet | 🔥 / ▲ 按钮 button | 空格 Space、↑、W |
| 级间分离 Stage separation | ⇋ 按钮 button | ↓、S、Enter |
| 左右（转向 / 行驶）Left / right (tilt / drive) | ◀ ▶ | ← →、A D |
| 挖掘 Dig down | ▼ | ↓、S |
| 暂停 Pause | ⏸ | P、Esc |
| 静音 Mute | 🔊 | M |

触屏按键支持多点触控，可以同时按住方向和点火；页面不会被拖动或缩放；适配刘海屏安全区，横屏竖屏都能玩；切到后台自动暂停。
Touch buttons are multi-touch, so you can hold a direction and thrust together. The page never scrolls or zooms, respects notch safe areas, works in portrait and landscape, and pauses automatically when the tab is hidden.

## 本地运行 / Run locally

```bash
git clone https://github.com/yydemo/moon-miner.git
cd moon-miner
python3 -m http.server 8000
# 打开 / open http://localhost:8000
```

直接双击打开 `index.html` 也能玩，只是离线缓存（Service Worker）需要通过 http(s) 访问才会生效。
Opening `index.html` directly also works; only the offline cache (service worker) needs http(s).

## 自定义 / Customising

- 挖掘机名字在 `index.html` 顶部的 `DIGGER_NAME` 常量里，改一处全局生效；游戏名在 `GAME_NAME`。
  The excavator's name is the `DIGGER_NAME` constant at the top of the script in `index.html`; change it once and it updates everywhere. The game name is `GAME_NAME`.
- 所有界面文字都在 `I18N` 表里（另有 `ORE_NAMES`、`UPGRADE_TEXT`、`ACH_TEXT`）。
  All UI strings live in the `I18N` table (plus `ORE_NAMES`, `UPGRADE_TEXT` and `ACH_TEXT`).
- 修改游戏文件后，把 `sw.js` 里的 `CACHE` 版本号加一，已安装的玩家才会拿到新版本。
  After changing game files, bump the `CACHE` version in `sw.js` so installed players get the update.

## 文件 / Files

| 文件 File | 说明 Description |
|---|---|
| `index.html` | 游戏本体（HTML + CSS + JS）/ the whole game |
| `manifest.json` | PWA 清单 / web app manifest |
| `sw.js` | 离线缓存 / offline cache service worker |
| `icon.svg`, `icon-192.png`, `icon-512.png` | 图标（原创矢量，PNG 由 SVG 渲染）/ icons (original vector; PNGs rendered from the SVG) |
| `docs/screenshot.png` | 截图 / screenshot |

## 许可证 / License

[MIT](LICENSE)
