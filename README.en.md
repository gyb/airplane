# Airplane Shooter ✈️

[中文](README.md) | English

A vertical-scrolling shoot-'em-up built from scratch with **HTML5 Canvas + vanilla JavaScript**. No frameworks, no build step, no external assets — just open `index.html` in a browser and play.

![Screenshot](docs/screenshot.png)

🎮 **Play online:** <https://gyb.github.io/airplane/> · [Two-player (desktop only)](two-player/)

---

## 👥 Two-Player Mode (desktop only)

[Play online](two-player/) · open `two-player/index.html` locally

A two-player co-op fork of the single-player game (`two-player/game.js` is an independent copy — the single-player version is untouched):

- **P1 keyboard**: arrows / WASD to move, `Space` / `X` to bomb (blue ship)
- **P2 mouse**: pointer-follow movement, left-click to bomb (silver ship)
- Both ships auto-fire with no friendly fire; **enemies and bosses target the nearest player**, divers lock onto one at random
- **Pickups go to whoever touches them**: power / wingmen / bombs / shields are per-player — racing for drops is half the fun
- **Score / combo / graze charge are shared** (the combo breaks when either player is hit); the results screen breaks out each player's kills and grazes
- **3 lives each**: when one ship goes down the other continues; the run ends when both are out
- Spawn density is compensated for doubled firepower (`CONFIG.duo.spawnMul`); the high score board is separate from single-player
- Touch is not supported in two-player mode; future single-player updates must be ported to this copy manually

---

## ✨ Features

- **Pure canvas drawing**: planes, enemies, bullets and explosions are all drawn with Canvas paths/polygons — zero image assets
- **Fair dual control**: keyboard and mouse/touch move at the same capped speed; the player's hitbox is a tiny "core" far smaller than the ship, so wing/nose grazes don't kill you
- **5-level firepower**: single → twin → 3-way → 4-way spread → 5-way wide spread; power decays over time to keep pickups meaningful
- **Wingman (option) system**: extra P pickups at max power convert into wingmen (up to 2) that trail your ship and fire alongside it; further picks give bonus score; all wingmen are destroyed when you get hit
- **Five enemy types**: scout / fighter (aimed shots) / heavy (bullet-fan barrage) / diver (lock-on dive) / turret (hovering volley)
- **Enemy formations**: V-wedge / column / side sweep / gap-line barricades unlock as waves advance, interleaved with single spawns
- **Boss fights**: three bosses rotate by level — flagship (aimed barrages) / ring fortress (bullet rings + spiral) / ramer (dash attacks + bullet trails), each with three escalating phases and a health bar; drops P/S/B on defeat
- **Active skills**: bomb (screen/bullet clear) / shield (6s invulnerability)
- **Hit feedback**: getting hit triggers screen shake, a red flash, explosion particles and clear floating text, plus a brief mercy shield to recover
- **Wave-based difficulty curve**: a new wave every 18s — enemies get denser, faster, and heavier
- **Synthesized SFX + four BGM tracks**: calm Canon (D major) normally, plus one theme per boss — the flagship's D-minor march, the ring fortress's heavy dirge, the ramer's E-minor chase — all generated with the Web Audio API
- **Combo scoring**: chain kills within 1.8s for up to ×3 kill score; resets when hit, bomb kills count too; the results screen shows kills / max combo / grazes / run time
- **Graze scoring**: enemy shots grazing your hull (the ring outside the hitbox core) score points, even while shielded; every 30 grazes awards a bomb (bonus score if fully stocked), shown as a cyan arc around the bomb button
- **Persistent high score**: saved in `localStorage` with a "new record" callout
- **Pause / mute**: `P` to pause, `M` to mute
- **Responsive**: adapts to desktop and mobile with multi-touch support

---

## 🚀 Quick Start

No dependencies to install — pick either option:

**Option A: Open directly**
```
Double-click index.html to open it in a browser.
```

**Option B: Local server** (optional, handy for hot-reloading)
```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

> Use a modern browser (Chrome / Edge / Firefox). Audio unlocks after you click/press a key to start (browser autoplay policy).

---

## 🎮 Controls

| Action | Keyboard | Mouse | Touch |
|--------|----------|-------|-------|
| Move | Arrow keys / WASD | Follow pointer (speed-capped) | One-finger drag |
| Fire | Auto-fire | Auto-fire | Auto-fire |
| Bomb 💣 | `Space` / `X` | **Left-click anywhere** | Second finger tap anywhere / tap the bottom-right button |
| Pause ⏸ | `P` / `Esc` | `P` / `Esc` | — |
| Mute 🔇 | `M` | `M` | — |
| Start / Restart | Any key | Click | Tap |

Design note: **movement and bombing are decoupled** — on mouse ("move = position, left-click = bomb") and on touch ("first finger = position, second finger = bomb"), so releasing a bomb never interrupts your movement.

---

## 🧩 Gameplay

**Pickups** (dropped by enemies / boss)
- 🟡 **P** — firepower +1 (max level 5; extra picks at max convert into a wingman first, then give bonus score once you have both; decays if you stop collecting)
- 🟢 **S** — shield, 6s invulnerability
- 🟠 **B** — bomb +1 (max 3; extra picks at max give bonus score)

**Enemies**
- 🟥 Scout — fast, fragile, doesn't shoot
- 🟪 Fighter — 3 HP, fires aimed shots (stops firing once it passes you)
- 🟩 Heavy — 7 HP, 5-way bullet fan, higher drop rate
- 🟧 Diver — 1 HP, flanks in from the screen sides at your altitude (under your vertical fire line, so auto-fire can't hit it), locks onto your position, flashes for ~0.3s, then dashes at the locked spot (it never tracks — move to dodge)
- ⬜ Turret — a 20 HP mini gun-platform: hovers for ~8s launching rotating bullet rings (each volley telegraphed by a red charge-up ring), then accelerates away; appears at higher waves and deserves priority fire

**Boss (three types rotating by level)**: appears when your score crosses the threshold (default 1200, with each gap widening arithmetically); HP scales with level, three escalating phases, and each defeat drops one each of P/S/B plus a big score reward.
- 🟥 **Flagship** — cruises side to side with aimed barrages: single → 3-way → 5-way fan + vertical shots
- 🟦 **Ring Fortress** — a hovering ring that drifts (faster as it takes damage) with all-direction fire: rotating rings → twin offset rings → twin-arm spiral stream + dense rings; extra HP since it sits still
- 🟪 **Ramer** — telegraphs (flashing), then dashes across the screen (ramming hurts!); drops slow bullets along its dash forming walls you must gap through; its pauses are your damage windows; lower HP since it never stops moving

**Combo**: kills within 1.8s chain a combo; kill score is multiplied by `1 + combo × 0.1` (capped at ×3). Getting hit resets it; bomb kills count normally (turning a survival resource into a combo burst); boss kills are flat rewards outside the combo.

**Graze**: an enemy bullet entering the graze ring around the hitbox core counts once per bullet for +10, accumulating even while shielded/invincible — flying close to danger is high risk, high reward. Every 30 grazes awards a bomb (100 bonus score if fully stocked).

---

## 📁 Project Structure

```
airplane/
├── index.html   # page skeleton + <canvas>
├── style.css    # centered layout, responsive scaling, touch handling
├── game.js      # all game logic (single-player)
└── two-player/  # two-player mode (an independent fork of game.js)
    ├── index.html
    └── game.js
```

`game.js` is organized into clear sections for readability and extension:

| Section | Responsibility |
|---------|----------------|
| `CONFIG` | every tunable value (sizes / speeds / odds / HP / BPM…) lives here |
| `ENEMY_TYPES` / `POWERUP_TYPES` / `FIRE_PATTERNS` / `FORMATIONS` | enemy / pickup / firepower / formation data |
| `AUDIO` | Web Audio SFX synthesis + dual-track BGM scheduler |
| `INPUT` | unified keyboard / mouse / multi-touch input |
| `STATE` | state machine (MENU / PLAYING / PAUSED / GAMEOVER) |
| `ENTITY` | Player / Bullet / Option / Enemy / EnemyBullet / PowerUp / Boss |
| `UPDATE` / `RENDER` / `LOOP` | per-frame logic & drawing, `requestAnimationFrame` loop |

---

## 🔧 Tuning & Extension

All values live in the `CONFIG` object at the top of `game.js` — adjust game feel without hunting through code, e.g.:

- `player.speed` / `fireInterval` — movement and fire rate
- `option.maxCount` / `followEase` — wingman count and trailing feel
- `player.hitW` / `hitH` — hitbox core size (smaller = more hardcore)
- `enemy.spawnInterval` / `wave.duration` — spawn density and wave pacing
- `formation.chance` / `cooldown` — formation trigger odds and spacing
- `combo.window` / `maxCount` — combo window and multiplier cap
- `graze.radius` / `bombEvery` — graze ring size and bomb charge threshold
- `boss.firstScore` / `gapScore` / `gapStep` — boss threshold and its per-level widening gap
- `skills.shieldDuration` / `bombDamage` — skill strength
- `player.hurtShieldDuration` / `hurtShake` — mercy shield duration and hit shake strength
- `BGM_BPM` / `FLAG_BPM` / `RING_BPM` / `RAM_BPM` — per-track tempo

Adding content (new enemies, bullet patterns, pickups) is just a new entry in the relevant data table plus a branch where needed.

---

## 🛠 Tech Stack

- **Rendering**: HTML5 Canvas 2D (`requestAnimationFrame` + frame-rate normalization)
- **Audio**: Web Audio API (oscillator + noise synthesized SFX; lookahead-scheduled looping BGM)
- **Storage**: `localStorage` (high score)
- **Dependencies**: none. No npm, no bundler, no framework.

---

## 📄 License

Personal learning / hobby project — feel free to use and modify the code.
