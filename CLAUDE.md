# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

竖屏卷轴射击游戏（飞机大战），HTML5 Canvas + 原生 JavaScript 实现。无框架、无构建步骤、无 npm 依赖、无外部资源（图形全部用 Canvas 路径绘制，音效全部用 WebAudio 合成）。仓库仅三个源文件：`index.html`（页面骨架 + canvas）、`style.css`(居中/响应式缩放/触摸)、`game.js`（全部游戏逻辑）。

注释、UI 文案、README、commit message 均使用简体中文，请保持一致。`README.en.md` 是 `README.md` 的英文版，修改 README 内容时同步更新。

## 常用命令

```bash
# 本地运行（也可直接双击 index.html）
python3 -m http.server 8000   # 浏览器访问 http://localhost:8000

# 语法检查（仓库唯一的验证手段，无测试/linter）
node --check game.js
```

改动手感、数值等请改 `game.js` 顶部的 `CONFIG` 对象，不要把魔法数字散落进逻辑代码。

## 架构（game.js，单一 IIFE，按注释分区）

`CONFIG` → `FIRE_PATTERNS`/`ENEMY_TYPES`/`POWERUP_TYPES`（数据表）→ `AUDIO` → `INPUT` → `STATE` → `ENTITY` → `UPDATE` → `RENDER` → `LOOP`。新增代码放进对应分区；新增敌机/道具/弹幕优先在数据表加条目再接分支处理。

需要跨分区理解的关键机制：

- **逻辑分辨率固定 480×720**，CSS 负责缩放适配。所有指针坐标必须经 `toCanvasPos()` 从屏幕坐标换算成画布坐标。
- **三套时间参数贯穿 update(dt, dms, time)**：`dt` 为归一化到 60fps 的帧数（速度乘它），`dms` 为真实毫秒（计时器累加用），`time` 为 rAF 绝对时间戳。实体普遍用"绝对时间戳到期"型计时器（`invincibleUntil`、`shieldUntil`、`powerDecayAt`、`nextFire`）——**新增此类计时器必须同时加进 `togglePause()` 恢复时的整体平移逻辑**，否则暂停期间计时照走（此前已因此修过 bug）。
- **碰撞**：`hit()` 为中心点 + 宽高的 AABB，实体若有更小的 `hitW`/`hitH`（玩家判定核）则优先使用；道具拾取不走 `hit()`，用 30px 宽松圆形判定。
- **难度曲线**：`wave` 每 18 秒 +1，`recomputeDiff()` 重算刷怪间隔/敌机速度/开火倍率，`pickEnemyType()` 按波次加权选敌机类型。
- **Boss**：分数达门槛登场（`nextBossScore`），在场时暂停普通刷怪；BGM 经 `setTrack()` 在卡农/Boss 战曲间切换（击败、重开都要切回）。Boss 攻击阶段由血量百分比驱动。
- **输入设计原则：走位与放炸弹解耦**——键盘移动 + Space/X 炸弹；鼠标移动即走位、左键任意位置 = 炸弹；触屏第一指 = 移动指（`input.touchId` 认领）、第二指落下 = 炸弹，另有右下角炸弹按钮。指针仅在"近期活跃"（1500ms 内移动过）时才接管走位，避免静止指针吸走飞机。改动输入时不得破坏这一对等与解耦。
- **音频**：全部 WebAudio 合成（`SFX` 音效 + lookahead 调度的双 BGM 循环）。受浏览器自动播放策略限制，需在用户手势中 `resumeAudio()` 解锁。
- **持久化**：最高分存 localStorage（key `airplane_highscore`），不可用时静默降级。
