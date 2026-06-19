/*
 * 飞机大战 —— HTML5 Canvas 原型
 * 竖屏卷轴 · 纯 Canvas 图形绘制 · 键盘 + 鼠标/触摸双控 · 自动开火
 *
 * 结构分区：
 *   CONFIG     游戏参数集中配置
 *   ENEMY_TYPES 敌机类型定义（血量/速度/火力/分数/配色）
 *   SETUP      画布与上下文
 *   INPUT      统一输入系统（键盘 / 鼠标 / 触摸）
 *   STATE      游戏状态机（MENU / PLAYING / GAMEOVER）
 *   ENTITY     Player / Bullet / Enemy / EnemyBullet / PowerUp / Particle
 *   UPDATE     每帧逻辑更新
 *   RENDER     每帧绘制
 *   LOOP       requestAnimationFrame 主循环
 */
(() => {
  'use strict';

  // ================= CONFIG =================
  const CONFIG = {
    width: 480,
    height: 720,
    player: {
      width: 42,
      height: 50,
      hitW: 14,             // 判定核宽（远小于视觉机身，更公平）
      hitH: 18,             // 判定核高
      speed: 6,             // 每帧（60fps 基准）移动像素
      fireInterval: 170,    // 自动开火间隔（毫秒）
      maxLives: 3,
      invincibleTime: 1500, // 受击后无敌时长（毫秒）
      maxPower: 5,          // 火力最高等级
      powerDecayInterval: 15000 // 火力每过这么久（毫秒）未拾取道具则降一级
    },
    bullet: { width: 5, height: 16, speed: 11 },
    enemy: {
      spawnInterval: 820   // 基础生成间隔（毫秒），随分数递增而缩短
    },
    enemyBullet: {
      speed: 4.3           // 敌弹速度（比玩家子弹慢，便于躲避）
    },
    powerup: {
      dropChance: 0.12,   // 敌机被击毁时掉落火力道具的概率（重型机更高）
      fallSpeed: 1.6,     // 道具下落速度（每帧像素）
      bonusScore: 100     // 火力满级时拾取给予的奖励分
    },
    skills: {
      shieldDuration: 6000, // 护盾持续时长（毫秒）
      bombDamage: 6,        // 炸弹对普通敌机的伤害
      bossBombDamage: 40,   // 炸弹对 Boss 的伤害
      bombInvuln: 1000,     // 引爆后玩家短暂无敌（毫秒）
      maxBombs: 3           // 炸弹最大库存
    },
    boss: {
      firstScore: 1200,    // 首个 Boss 登场的分数门槛
      gapScore: 1800,      // 击败后到下一个 Boss 需要再涨的分数
      baseHp: 200,        // Boss 基础血量
      hpPerLevel: 80,     // 每个后续 Boss 额外血量
      score: 300,         // 击败基础奖励分
      scorePerLevel: 100, // 每个后续 Boss 额外奖励分
      dropCount: 3        // 击败后掉落的 P 道具数量
    },
    wave: {
      duration: 18000     // 每波时长（毫秒），到点进入下一波并提升难度
    }
  };

  // 各火力等级的子弹编排：ox=水平偏移，a=相对正上方的偏转角（弧度）
  const FIRE_PATTERNS = [
    [{ ox: 0, a: 0 }],                                                      // Lv1 单发
    [{ ox: -8, a: 0 }, { ox: 8, a: 0 }],                                    // Lv2 双发
    [{ ox: 0, a: 0 }, { ox: -10, a: -0.18 }, { ox: 10, a: 0.18 }],          // Lv3 三向
    [{ ox: -8, a: 0 }, { ox: 8, a: 0 }, { ox: -14, a: -0.22 }, { ox: 14, a: 0.22 }], // Lv4 四发带散射
    [{ ox: 0, a: 0 }, { ox: -10, a: -0.12 }, { ox: 10, a: 0.12 }, { ox: -16, a: -0.26 }, { ox: 16, a: 0.26 }] // Lv5 五向宽散射
  ];

  // 敌机类型：hp 血量 · speed 下落速度 · sway 摇摆幅度 · score 分数 · fireInterval 开火间隔(空则不开火)
  const ENEMY_TYPES = {
    scout:   { w: 34, h: 32, hp: 1, speed: 3.0, sway: 0.6, score: 10,
               color: '#ff6a4a', color2: '#a8311f', cockpit: '#3a0d12' },
    fighter: { w: 42, h: 42, hp: 3, speed: 1.9, sway: 0.4, score: 30,
               color: '#c060d8', color2: '#6a2a7a', cockpit: '#2a0d33', fireInterval: 1500 },
    heavy:   { w: 60, h: 56, hp: 7, speed: 1.1, sway: 0.25, score: 70,
               color: '#5fae5f', color2: '#2f5f2f', cockpit: '#102210', fireInterval: 2100 }
  };

  // 道具类型：power 火力 / shield 护盾 / bomb 炸弹
  const POWERUP_TYPES = {
    power:  { color: '#ffcc33', glow: '#ffd24a', inner: '#fff4d0', ink: '#7a5200', label: 'P' },
    shield: { color: '#39e6c8', glow: '#5fffe0', inner: '#d8fff7', ink: '#0a4a40', label: 'S' },
    bomb:   { color: '#ff7a3b', glow: '#ffb066', inner: '#ffe2cc', ink: '#5a1d00', label: 'B' }
  };

  // ================= SETUP =================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = CONFIG.width, H = CONFIG.height;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  // 把屏幕坐标换算成画布内部坐标（处理 CSS 缩放）
  function toCanvasPos(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (W / r.width),
      y: (clientY - r.top) * (H / r.height)
    };
  }

  // AABB 碰撞（实体以中心点 + 宽高表示）
  // 若实体定义了更小的 hitW/hitH（如玩家判定核），优先使用，避免视觉边缘误判
  function hit(a, b) {
    const aw = a.hitW || a.w, ah = a.hitH || a.h;
    const bw = b.hitW || b.w, bh = b.hitH || b.h;
    return Math.abs(a.x - b.x) < (aw + bw) / 2 &&
           Math.abs(a.y - b.y) < (ah + bh) / 2;
  }

  // 右下角炸弹按钮区域（供鼠标 / 触摸点击释放炸弹）
  const BOMB_BTN = { x: W - 46, y: H - 46, r: 32 };
  function inBombButton(x, y) { return Math.hypot(x - BOMB_BTN.x, y - BOMB_BTN.y) < BOMB_BTN.r; }

  // 按当前波次加权选择敌机类型（波次越高，重型机越多）
  function pickEnemyType() {
    let w;
    if (wave < 3)      w = { scout: 0.82, fighter: 0.18, heavy: 0.00 };
    else if (wave < 6) w = { scout: 0.55, fighter: 0.36, heavy: 0.09 };
    else               w = { scout: 0.40, fighter: 0.42, heavy: 0.18 };
    const r = Math.random();
    let acc = 0;
    for (const k of Object.keys(w)) { acc += w[k]; if (r <= acc) return k; }
    return 'scout';
  }

  // ================= AUDIO =================
  // 全部用 WebAudio 合成，无外部音频文件。首次用户手势（开始游戏）后解锁。
  let audioCtx = null;
  let masterGain, musicGain, sfxGain;
  let audioEnabled = true;

  function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // 浏览器不支持则静默跳过
    audioCtx = new AC();
    masterGain = audioCtx.createGain(); masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain(); musicGain.gain.value = 0.3;
    musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain(); sfxGain.gain.value = 0.6;
    sfxGain.connect(masterGain);
  }

  // 在用户手势中调用，解除浏览器自动播放限制
  function resumeAudio() {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  // 单音（可滑音）
  function tone(freq, dur, { type = 'square', vol = 0.4, slideTo, delay = 0, attack = 0.005, dest } = {}) {
    if (!audioCtx || !audioEnabled) return;
    const t0 = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // 噪声（爆炸 / 鼓）
  function noise(dur, { vol = 0.4, freq = 1000, type = 'lowpass', delay = 0, dest } = {}) {
    if (!audioCtx || !audioEnabled) return;
    const t0 = audioCtx.currentTime + delay;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = audioCtx.createBufferSource(); s.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxGain);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  const SFX = {
    explode() { noise(0.22, { vol: 0.35, freq: 900 }); tone(170, 0.18, { type: 'sawtooth', vol: 0.18, slideTo: 55 }); },
    bossExplode() { noise(0.6, { vol: 0.45, freq: 600 }); tone(130, 0.6, { type: 'sawtooth', vol: 0.3, slideTo: 38 }); tone(200, 0.5, { type: 'square', vol: 0.12, slideTo: 45, delay: 0.06 }); },
    powerup() { tone(660, 0.08, { type: 'triangle', vol: 0.3 }); tone(880, 0.08, { type: 'triangle', vol: 0.3, delay: 0.08 }); tone(1320, 0.12, { type: 'triangle', vol: 0.3, delay: 0.16 }); },
    playerHit() { noise(0.3, { vol: 0.45, freq: 420 }); tone(240, 0.3, { type: 'sawtooth', vol: 0.3, slideTo: 80 }); },
    bossWarn() { tone(440, 0.15, { type: 'square', vol: 0.25 }); tone(440, 0.15, { type: 'square', vol: 0.25, delay: 0.3 }); },
    gameOver() { tone(440, 0.2, { type: 'triangle', vol: 0.3 }); tone(330, 0.2, { type: 'triangle', vol: 0.3, delay: 0.2 }); tone(220, 0.4, { type: 'triangle', vol: 0.3, delay: 0.4, slideTo: 110 }); },
    start() { tone(440, 0.08, { type: 'triangle', vol: 0.3 }); tone(660, 0.08, { type: 'triangle', vol: 0.3, delay: 0.08 }); tone(880, 0.12, { type: 'triangle', vol: 0.3, delay: 0.16 }); },
    bomb() { noise(0.7, { vol: 0.5, freq: 400 }); tone(110, 0.7, { type: 'sawtooth', vol: 0.35, slideTo: 30 }); },
    shield() { tone(523, 0.1, { type: 'triangle', vol: 0.25 }); tone(784, 0.12, { type: 'triangle', vol: 0.25, delay: 0.08 }); tone(1046, 0.14, { type: 'triangle', vol: 0.25, delay: 0.16 }); },
  };

  // ---- 背景音乐：卡农（D 大调）主旋律 + 地面低音，lookahead 调度循环 ----
  const music = { step: 0, nextNoteTime: 0, timer: null };
  const BGM_BPM = 96;
  const BGM_STEP = 60 / BGM_BPM / 2; // 8 分音符（每步一个旋律音）
  // 卡农主旋律（两乐句循环）：F#5 E5 D5 C#5 B4 A4 B4 C#5 | D5 C#5 B4 A4 G4 F#4 G4 E4
  const BGM_MELODY = [
    739.99, 659.25, 587.33, 554.37, 493.88, 440.00, 493.88, 554.37,
    587.33, 554.37, 493.88, 440.00, 392.00, 369.99, 392.00, 329.63
  ];
  // 地面低音（每两步换一次）：D A B F# G D G A
  const BGM_BASS = [146.83, 110.00, 123.47, 92.50, 98.00, 146.83, 98.00, 110.00];

  function bgmNote(freq, time, dur, type, vol) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(musicGain);
    o.start(time); o.stop(time + dur + 0.02);
  }
  function bgmKick(time) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.setValueAtTime(150, time); o.frequency.exponentialRampToValueAtTime(50, time + 0.1);
    g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    o.connect(g); g.connect(musicGain); o.start(time); o.stop(time + 0.13);
  }
  function bgmHat(time) {
    if (!audioCtx) return;
    const len = Math.floor(audioCtx.sampleRate * 0.03);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = audioCtx.createBufferSource(); s.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.07, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(time); s.stop(time + 0.04);
  }
  function scheduleBgmStep(step, time) {
    bgmNote(BGM_MELODY[step % BGM_MELODY.length], time, BGM_STEP * 1.6, 'triangle', 0.13); // 主旋律（连奏）
    if (step % 2 === 0) bgmNote(BGM_BASS[(step / 2) % BGM_BASS.length], time, BGM_STEP * 1.9, 'sine', 0.20); // 地面低音
  }

  // ---- Boss 战主题：D 小调，驱动低音 + 紧张旋律 + 底鼓（原创，无版权）----
  const BOSS_BPM = 140;
  const BOSS_STEP = 60 / BOSS_BPM / 2; // 8 分音符
  // 驱动低音（Dm-Am-Bb-C 进行，每步一个 8 分音符，断奏）
  const BOSS_BASS = [
    146.83, 146.83, 146.83, 146.83, 110.00, 110.00, 110.00, 110.00,
    116.54, 116.54, 116.54, 116.54, 130.81, 130.81, 130.81, 130.81
  ];
  // 紧张主旋律（用 b6 音 Bb 增添紧张感，0 为休止）
  const BOSS_MELODY = [
    587.33, 0, 440.00, 587.33, 0, 523.25, 466.16, 0,
    440.00, 0, 466.16, 0, 523.25, 587.33, 0, 0
  ];
  function scheduleBossStep(step, time) {
    bgmNote(BOSS_BASS[step % BOSS_BASS.length], time, BOSS_STEP * 0.9, 'sawtooth', 0.13);
    const m = BOSS_MELODY[step % BOSS_MELODY.length];
    if (m) bgmNote(m, time, BOSS_STEP * 1.4, 'square', 0.10);
    if (step % 2 === 0) bgmKick(time); // 每拍底鼓，增强驱动感
    if (step % 2 === 1) bgmHat(time);
  }

  // 曲目切换：Boss 登场切紧张曲，击败后切回卡农
  const TRACKS = {
    canon: { fn: scheduleBgmStep, stepDur: BGM_STEP },
    boss: { fn: scheduleBossStep, stepDur: BOSS_STEP }
  };
  let currentTrackKey = 'canon';
  function setTrack(key) {
    currentTrackKey = key;
    music.step = 0; // 切换后从该曲开头播，避免接在半句上
  }

  function bgmScheduler() {
    if (!audioCtx) return;
    const tr = TRACKS[currentTrackKey];
    while (music.nextNoteTime < audioCtx.currentTime + 0.12) {
      tr.fn(music.step, music.nextNoteTime);
      music.nextNoteTime += tr.stepDur;
      music.step++;
    }
  }
  function startBgm() {
    initAudio();
    if (!audioCtx || music.timer) return;
    currentTrackKey = 'canon';
    music.step = 0;
    music.nextNoteTime = audioCtx.currentTime + 0.1;
    music.timer = setInterval(bgmScheduler, 25);
  }
  function duckBgm(duck) {
    if (!audioCtx || !musicGain) return;
    const t = audioCtx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setTargetAtTime(duck ? 0.1 : 0.3, t, 0.1);
  }
  function toggleMute() {
    audioEnabled = !audioEnabled;
    if (masterGain) masterGain.gain.value = audioEnabled ? 0.6 : 0;
  }

  // ================= INPUT =================
  const input = {
    keys: {},            // 当前按下的键
    pointerX: W / 2,     // 指针位置（画布坐标，移出画布时可能为负或越界）
    pointerY: H * 0.8,
    touching: false,     // 是否有"移动指"在控制飞机
    touchId: null,       // 移动指的 identifier（多点触控：第一指移动，其余指触发动作）
    lastPointer: 0       // 最近一次指针移动时间戳（用于判断指针是否"近期活跃"）
  };

  const MOVE_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's']);

  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    if (k === 'm') { toggleMute(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); e.preventDefault(); return; }
    if ((k === ' ' || k === 'x') && state === 'PLAYING') { useBomb(); e.preventDefault(); return; }
    input.keys[k] = true;
    if (MOVE_KEYS.has(k) || k === ' ') e.preventDefault();
    if (state !== 'PLAYING') tryStart();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    input.keys[k] = false;
  });

  // 在 window 上监听鼠标移动：即便指针移出画布也能继续追踪，从而把飞机推到边界
  window.addEventListener('mousemove', (e) => {
    const p = toCanvasPos(e.clientX, e.clientY);
    input.pointerX = p.x; input.pointerY = p.y;
    input.lastPointer = e.timeStamp;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 仅响应左键
    if (state !== 'PLAYING') {
      const p = toCanvasPos(e.clientX, e.clientY);
      input.pointerX = p.x; input.pointerY = p.y;
      input.lastPointer = e.timeStamp;
      tryStart();
      return;
    }
    useBomb(); // 游戏中：鼠标左键任意位置 = 释放炸弹（走位靠鼠标移动，不靠点击）
  });

  // ---- 触摸（多点触控）：第一指控制飞机；第二指任意位置落下 = 释放炸弹；亦可单指点右下炸弹按钮 ----
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state !== 'PLAYING') {
      // 菜单 / 结束：任意触摸开始游戏，并把该指认领为移动指
      const t = e.changedTouches[0];
      const p = toCanvasPos(t.clientX, t.clientY);
      input.touchId = t.identifier;
      input.pointerX = p.x; input.pointerY = p.y;
      input.touching = true;
      input.lastPointer = e.timeStamp;
      tryStart();
      return;
    }
    // 游戏中：逐个处理新落下的指头
    for (const t of e.changedTouches) {
      const p = toCanvasPos(t.clientX, t.clientY);
      if (inBombButton(p.x, p.y)) {
        useBomb();                        // 点炸弹按钮
      } else if (input.touchId !== null) {
        useBomb();                        // 已有移动指 → 第二指任意位置落下 = 炸弹
      } else {
        input.touchId = t.identifier;     // 认领为移动指
        input.pointerX = p.x; input.pointerY = p.y;
        input.touching = true;
        input.lastPointer = e.timeStamp;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    // 仅移动指更新飞机位置，其他指不影响
    for (const t of e.touches) {
      if (t.identifier === input.touchId) {
        const p = toCanvasPos(t.clientX, t.clientY);
        input.pointerX = p.x; input.pointerY = p.y;
        input.lastPointer = e.timeStamp;
        break;
      }
    }
  }, { passive: false });

  // 仅移动指抬起才停止控制；动作指（炸弹）抬起不影响飞机
  const endTouch = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === input.touchId) {
        input.touchId = null;
        input.touching = false;
      }
    }
  };
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  // ================= STATE =================
  let state = 'MENU';     // MENU | PLAYING | PAUSED | GAMEOVER
  let score = 0;
  let player, bullets, enemyBullets, enemies, powerups, particles, floaters, stars;
  let boss = null;            // 当前 Boss（无则为 null）
  let bossLevel = 1;          // Boss 等级（影响血量/奖励，逐次递增）
  let nextBossScore = CONFIG.boss.firstScore; // 下一个 Boss 登场的分数门槛
  let wave = 1;               // 当前波次（随存活时间推进，驱动难度曲线）
  let waveTimer = 0;          // 当前波次累计时间（毫秒）
  let highScore = 0;          // 历史最高分（localStorage 持久化）
  let newRecord = false;      // 本局是否打破最高分
  const DIFF = { spawnInterval: CONFIG.enemy.spawnInterval, enemySpeedMul: 1, fireMul: 1 };
  let spawnAcc = 0;
  let lastTime = 0;
  let flashScreen = 0;    // 炸弹引爆时的全屏闪光强度（0~1）

  // 由波次重算难度参数：刷怪更密、敌机更快、开火更频
  function recomputeDiff() {
    const w = wave;
    DIFF.spawnInterval = Math.max(280, CONFIG.enemy.spawnInterval - (w - 1) * 70);
    DIFF.enemySpeedMul = 1 + (w - 1) * 0.08;
    DIFF.fireMul = Math.max(0.45, 1 - (w - 1) * 0.06);
  }

  // 最高分持久化（localStorage 不可用时静默降级）
  const HS_KEY = 'airplane_highscore';
  function loadHighScore() {
    try { highScore = parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; } catch (e) { highScore = 0; }
  }
  function saveHighScore() {
    try { localStorage.setItem(HS_KEY, String(highScore)); } catch (e) {}
  }

  // 加分并同步刷新最高分 / 新纪录标记
  function addScore(n) {
    score += n;
    if (score > highScore) { highScore = score; newRecord = true; }
  }

  function reset() {
    score = 0;
    player = new Player();
    bullets = [];
    enemyBullets = [];
    enemies = [];
    powerups = [];
    particles = [];
    floaters = [];
    boss = null;
    setTrack('canon'); // 新一局无 Boss，背景乐切回卡农（修复阵亡于 Boss 后卡在战斗曲）
    bossLevel = 1;
    nextBossScore = CONFIG.boss.firstScore;
    wave = 1;
    waveTimer = 0;
    newRecord = false;
    recomputeDiff();
    spawnAcc = 0;
  }

  function startGame() {
    reset();
    state = 'PLAYING';
    SFX.start();
    startBgm();
    duckBgm(false);
  }

  function tryStart() {
    resumeAudio();
    if (state === 'MENU' || state === 'GAMEOVER') startGame();
  }

  // 暂停 / 继续（仅在"游戏中"与"暂停"之间切换）
  function togglePause() {
    if (state === 'PLAYING') { state = 'PAUSED'; duckBgm(true); }
    else if (state === 'PAUSED') { state = 'PLAYING'; duckBgm(false); }
  }

  // 玩家受击：扣命 + 无敌 + 爆炸，命数归零则结束
  function damagePlayer(time) {
    player.lives--;
    player.invincibleUntil = time + CONFIG.player.invincibleTime;
    explode(player.x, player.y, '#9fd0ff', 12);
    SFX.playerHit();
    if (player.lives <= 0) {
      state = 'GAMEOVER';
      saveHighScore();
      SFX.gameOver();
      duckBgm(true);
    }
  }

  // Boss 被击败：大爆炸 + 奖励分 + 掉落 P/S/B 各一个 + 安排下一个 Boss
  function defeatBoss() {
    if (!boss) return;
    SFX.bossExplode();
    explode(boss.x, boss.y, '#ff8a5c', 42);
    explode(boss.x - 32, boss.y, '#ffd24a', 22);
    explode(boss.x + 32, boss.y, '#ffd24a', 22);
    const reward = CONFIG.boss.score + bossLevel * CONFIG.boss.scorePerLevel;
    addScore(reward);
    floatText(boss.x, boss.y - 24, 'BOSS 击破 +' + reward, '#ffe066');
    // 击败掉落：P / S / B 各一个（左右顺序随机），比清一色火力更有价值
    const drops = ['power', 'shield', 'bomb'];
    for (let i = drops.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [drops[i], drops[j]] = [drops[j], drops[i]];
    }
    for (let k = 0; k < drops.length; k++) {
      const offset = (k - (drops.length - 1) / 2) * 36;
      powerups.push(new PowerUp(boss.x + offset, boss.y, drops[k]));
    }
    bossLevel++;
    nextBossScore = score + CONFIG.boss.gapScore;
    setTrack('canon'); // 击败 Boss 后切回卡农
    boss = null;
  }

  // 释放炸弹：清空敌弹 + 重伤全屏敌机/Boss + 短暂无敌 + 全屏闪光
  function useBomb() {
    if (state !== 'PLAYING' || !player || player.bombs <= 0) return;
    player.bombs--;
    player.invincibleUntil = performance.now() + CONFIG.skills.bombInvuln;
    for (const eb of enemyBullets) explode(eb.x, eb.y, '#ff9a5a', 3);
    enemyBullets.length = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.hp -= CONFIG.skills.bombDamage;
      if (e.hp <= 0) {
        explode(e.x, e.y, e.def.color, 14);
        addScore(e.scoreVal);
        enemies.splice(i, 1);
      } else {
        e.flash = 1;
      }
    }
    if (boss) {
      boss.hp -= CONFIG.skills.bossBombDamage;
      boss.flash = 1;
      if (boss.hp <= 0) defeatBoss();
    }
    SFX.bomb();
    flashScreen = 1;
  }

  // 敌机击毁掉落（火力 / 护盾 / 炸弹，互斥；重型机概率更高）
  function maybeDrop(x, y, heavy) {
    const boost = heavy ? 2.2 : 1;
    const r = Math.random();
    const pBomb = 0.03 * boost, pShield = 0.04 * boost, pPower = CONFIG.powerup.dropChance * boost;
    if (r < pBomb) powerups.push(new PowerUp(x, y, 'bomb'));
    else if (r < pBomb + pShield) powerups.push(new PowerUp(x, y, 'shield'));
    else if (r < pBomb + pShield + pPower) powerups.push(new PowerUp(x, y, 'power'));
  }

  // ================= ENTITIES =================
  class Player {
    constructor() {
      this.w = CONFIG.player.width;
      this.h = CONFIG.player.height;
      this.hitW = CONFIG.player.hitW; // 判定核（受击判定用）
      this.hitH = CONFIG.player.hitH;
      this.x = W / 2;
      this.y = H - 90;
      this.lives = CONFIG.player.maxLives;
      this.power = 1; // 当前火力等级（1..maxPower）
      this.powerDecayAt = 0; // 火力衰减时间戳（到点降一级）
      this.bombs = 1;        // 炸弹库存（开局送 1 颗）
      this.shieldUntil = 0;  // 护盾到期时间戳（>当前时间表示护盾中）
      this.lastFire = 0;
      this.invincibleUntil = 0;
    }

    update(dt, time) {
      // 火力随时间衰减：超过一定时长未拾取道具则降一级（最低 Lv1）
      if (this.power > 1 && time >= this.powerDecayAt) {
        this.power--;
        this.powerDecayAt = time + CONFIG.player.powerDecayInterval;
      }

      const k = input.keys;
      const left = k['arrowleft'] || k['a'];
      const right = k['arrowright'] || k['d'];
      const up = k['arrowup'] || k['w'];
      const down = k['arrowdown'] || k['s'];
      const anyKey = left || right || up || down;

      // 指针只在"近期移动过"时接管，避免静止指针把飞机吸过去
      const usePointer = input.touching || (time - input.lastPointer < 1500);

      if (anyKey) {
        let vx = (right ? 1 : 0) - (left ? 1 : 0);
        let vy = (down ? 1 : 0) - (up ? 1 : 0);
        if (vx && vy) { const inv = 1 / Math.SQRT2; vx *= inv; vy *= inv; }
        this.x += vx * CONFIG.player.speed * dt;
        this.y += vy * CONFIG.player.speed * dt;
      } else if (usePointer) {
        // 以不超过键盘最大速度追赶指针：近距精确吸附、远距限速追赶（与键盘公平）
        const dx = input.pointerX - this.x;
        const dy = input.pointerY - this.y;
        const dist = Math.hypot(dx, dy);
        const step = CONFIG.player.speed * dt;
        if (dist > step) {
          this.x += dx / dist * step;
          this.y += dy / dist * step;
        } else {
          this.x += dx; // 距离很小时直接到达指针位置，保证精细走位 1:1
          this.y += dy;
        }
      }

      this.x = clamp(this.x, this.w / 2, W - this.w / 2);
      this.y = clamp(this.y, this.h / 2, H - this.h / 2);

      // 自动开火
      if (time - this.lastFire >= CONFIG.player.fireInterval) {
        this.lastFire = time;
        this.fire();
      }
    }

    // 按当前火力等级发射子弹（水平偏移 + 散射角度）
    fire() {
      const pattern = FIRE_PATTERNS[Math.min(this.power, FIRE_PATTERNS.length) - 1];
      for (const shot of pattern) {
        bullets.push(new Bullet(this.x + shot.ox, this.y - this.h / 2, shot.a));
      }
    }

    draw(time) {
      // 无敌期间闪烁
      if (time < this.invincibleUntil && Math.floor(time / 90) % 2 === 0) return;
      const { x, y, w, h } = this;
      ctx.save();
      ctx.translate(x, y);

      // 机翼
      ctx.fillStyle = '#2b6cb0';
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, h * 0.18);
      ctx.lineTo(0, -h * 0.05);
      ctx.lineTo(w * 0.5, h * 0.18);
      ctx.lineTo(w * 0.22, h * 0.3);
      ctx.lineTo(-w * 0.22, h * 0.3);
      ctx.closePath(); ctx.fill();

      // 机身
      ctx.fillStyle = '#4aa3ff';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5);
      ctx.lineTo(w * 0.14, h * 0.3);
      ctx.lineTo(-w * 0.14, h * 0.3);
      ctx.closePath(); ctx.fill();

      // 尾翼
      ctx.fillStyle = '#2b6cb0';
      ctx.beginPath();
      ctx.moveTo(-w * 0.18, h * 0.42);
      ctx.lineTo(0, h * 0.26);
      ctx.lineTo(w * 0.18, h * 0.42);
      ctx.lineTo(w * 0.08, h * 0.5);
      ctx.lineTo(-w * 0.08, h * 0.5);
      ctx.closePath(); ctx.fill();

      // 驾驶舱
      ctx.fillStyle = '#d6ecff';
      ctx.beginPath(); ctx.arc(0, -h * 0.08, w * 0.09, 0, Math.PI * 2); ctx.fill();

      // 引擎喷焰
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath(); ctx.arc(-w * 0.07, h * 0.33, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.07, h * 0.33, 2.2, 0, Math.PI * 2); ctx.fill();

      // 判定核指示点（让玩家看清真实受击范围）
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();

      ctx.restore();

      // 护盾泡（世界坐标，覆盖在玩家外圈）
      if (time < this.shieldUntil) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(time / 120) * 0.1;
        ctx.strokeStyle = '#5fffe0';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.w * 0.85, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
  }

  class Bullet {
    constructor(x, y, angle = 0) {
      this.w = CONFIG.bullet.width;
      this.h = CONFIG.bullet.height;
      this.x = x; this.y = y;
      const s = CONFIG.bullet.speed;
      this.vx = Math.sin(angle) * s;
      this.vy = -Math.cos(angle) * s; // 负值 = 向上
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; }
    draw() {
      ctx.fillStyle = '#ffe066';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 8;
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
      ctx.shadowBlur = 0;
    }
  }

  class Enemy {
    constructor(type) {
      const t = ENEMY_TYPES[type];
      this.type = type;
      this.def = t;
      this.w = t.w; this.h = t.h;
      this.x = rand(this.w / 2, W - this.w / 2);
      this.y = -this.h / 2;
      this.hp = t.hp;
      this.maxHp = t.hp;
      this.speed = t.speed;
      this.scoreVal = t.score;
      this.phase = rand(0, Math.PI * 2);
      this.flash = 0;      // 受击白闪计时
      this.nextFire = undefined; // 首次开火时间（惰性赋值以错开节奏）
    }

    update(dt, time) {
      this.y += this.speed * DIFF.enemySpeedMul * dt;
      this.x += Math.sin(this.phase + this.y * 0.03) * this.def.sway * dt; // 左右摇摆
      this.x = clamp(this.x, this.w / 2, W - this.w / 2);
      this.flash = Math.max(0, this.flash - 0.08 * dt);

      // 开火：仅在尚未越过玩家（位于玩家上方）时开火，避免越过后往回射击
      if (this.def.fireInterval && this.y < player.y) {
        const fi = this.def.fireInterval * DIFF.fireMul; // 波次越高开火越快
        if (this.nextFire === undefined) {
          this.nextFire = time + rand(fi * 0.5, fi * 1.3);
        }
        if (time >= this.nextFire) {
          this.nextFire = time + fi;
          this.fire();
        }
      }
    }

    // 战斗机单发瞄准；重型机 5 发扇形弹幕
    fire() {
      const speed = CONFIG.enemyBullet.speed;
      const ox = this.x, oy = this.y + this.h / 2;
      const dx = player.x - ox, dy = player.y - oy;
      if (this.type === 'heavy') {
        const base = Math.atan2(dy, dx);
        const n = 5, spread = 0.55;
        for (let i = 0; i < n; i++) {
          const a = base - spread / 2 + spread * (i / (n - 1));
          enemyBullets.push(new EnemyBullet(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed));
        }
      } else {
        const d = Math.hypot(dx, dy) || 1;
        enemyBullets.push(new EnemyBullet(ox, oy, dx / d * speed, dy / d * speed));
      }
    }

    draw() {
      const { x, y, w, h } = this;
      ctx.save();
      ctx.translate(x, y);
      // 机翼
      ctx.fillStyle = this.def.color2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.18);
      ctx.lineTo(0, h * 0.05);
      ctx.lineTo(w * 0.5, -h * 0.18);
      ctx.lineTo(w * 0.22, -h * 0.3);
      ctx.lineTo(-w * 0.22, -h * 0.3);
      ctx.closePath(); ctx.fill();
      // 机身（机头朝下）
      ctx.fillStyle = this.def.color;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w * 0.14, -h * 0.3);
      ctx.lineTo(-w * 0.14, -h * 0.3);
      ctx.closePath(); ctx.fill();
      // 驾驶舱
      ctx.fillStyle = this.def.cockpit;
      ctx.beginPath(); ctx.arc(0, h * 0.1, w * 0.09, 0, Math.PI * 2); ctx.fill();
      // 受击白闪
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, w * 0.46, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // 血条（仅多血敌机受伤时显示）
      if (this.maxHp > 1 && this.hp < this.maxHp) {
        const bw = w, bh = 3;
        const bx = x - bw / 2, by = y - h / 2 - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = this.hp / this.maxHp > 0.4 ? '#7CFC00' : '#ff5a4a';
        ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
      }
    }
  }

  class EnemyBullet {
    constructor(x, y, vx, vy) {
      this.w = 8; this.h = 8;
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; }
    draw() {
      ctx.fillStyle = 'rgba(255,91,110,0.35)';
      ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5b6e';
      ctx.beginPath(); ctx.arc(this.x, this.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  class PowerUp {
    constructor(x, y, type = 'power') {
      this.w = 26; this.h = 26;
      this.x = x; this.y = y;
      this.type = type;
      this.def = POWERUP_TYPES[type];
      this.phase = rand(0, Math.PI * 2);
    }
    update(dt) {
      this.y += CONFIG.powerup.fallSpeed * dt;
      this.phase += 0.06 * dt;
    }
    draw(time) {
      const pulse = 1 + Math.sin(time / 150 + this.phase) * 0.12;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = this.def.glow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = this.def.color;
      ctx.beginPath(); ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.def.inner;
      ctx.beginPath(); ctx.arc(0, 0, this.w / 2 * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.def.ink;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.def.label, 0, 1);
      ctx.restore();
    }
  }

  class Boss {
    constructor(level) {
      this.level = level;
      this.w = 160; this.h = 110;
      this.x = W / 2;
      this.y = -this.h;       // 从画面上方入场
      this.targetY = 120;     // 入场后悬停的 y
      this.entered = false;
      this.maxHp = CONFIG.boss.baseHp + (level - 1) * CONFIG.boss.hpPerLevel;
      this.hp = this.maxHp;
      this.phase = 1;
      this.nextFire = 0;
      this.t = 0;             // 用于运动/呼吸节奏
      this.flash = 0;
    }

    update(dt, time) {
      this.t += dt;
      this.flash = Math.max(0, this.flash - 0.08 * dt);

      // 入场：下移到悬停位
      if (!this.entered) {
        this.y += 1.5 * dt;
        if (this.y >= this.targetY) {
          this.y = this.targetY;
          this.entered = true;
          this.nextFire = time + 600;
        }
        return; // 入场期间不开火
      }

      // 悬停后左右巡航 + 轻微上下浮动
      const margin = W / 2 - this.w / 2 - 12;
      this.x = W / 2 + Math.sin(this.t * 0.02) * margin;
      this.y = this.targetY + Math.sin(this.t * 0.03) * 8;

      // 按血量划分攻击阶段
      const r = this.hp / this.maxHp;
      this.phase = r > 0.66 ? 1 : r > 0.33 ? 2 : 3;

      // 开火
      if (time >= this.nextFire) this.fire(time);
    }

    // 阶段 1 单发瞄准 / 阶段 2 三发散射 / 阶段 3 五发宽扇 + 垂直弹
    fire(time) {
      const speed = CONFIG.enemyBullet.speed;
      const ox = this.x, oy = this.y + this.h / 2 - 6;
      const base = Math.atan2(player.y - oy, player.x - ox);
      this.nextFire = time + (this.phase === 1 ? 1000 : this.phase === 2 ? 820 : 680);
      const shoot = (a) => enemyBullets.push(new EnemyBullet(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed));
      if (this.phase === 1) {
        shoot(base);
      } else if (this.phase === 2) {
        for (let i = 0; i < 3; i++) shoot(base - 0.3 + 0.3 * i);
      } else {
        for (let i = 0; i < 5; i++) shoot(base - 0.4 + 0.2 * i);
        shoot(Math.PI / 2 - 0.25);
        shoot(Math.PI / 2 + 0.25);
      }
    }

    draw() {
      const { x, y, w, h } = this;
      ctx.save();
      ctx.translate(x, y);

      // 侧翼
      ctx.fillStyle = '#4a1d28';
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.05); ctx.lineTo(-w * 0.32, h * 0.28); ctx.lineTo(-w * 0.2, h * 0.18);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.5, -h * 0.05); ctx.lineTo(w * 0.32, h * 0.28); ctx.lineTo(w * 0.2, h * 0.18);
      ctx.closePath(); ctx.fill();

      // 主体（六边形）
      ctx.fillStyle = '#6b2a3a';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5);
      ctx.lineTo(w * 0.42, -h * 0.18);
      ctx.lineTo(w * 0.36, h * 0.34);
      ctx.lineTo(0, h * 0.5);
      ctx.lineTo(-w * 0.36, h * 0.34);
      ctx.lineTo(-w * 0.42, -h * 0.18);
      ctx.closePath(); ctx.fill();

      // 前部炮管
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(-w * 0.24, h * 0.18, 9, 20);
      ctx.fillRect(w * 0.24 - 9, h * 0.18, 9, 20);

      // 核心弱点（随阶段变红 + 脉冲呼吸）
      const pulse = 1 + Math.sin(this.t * 0.12) * 0.15;
      const core = this.phase === 3 ? '#ff3b3b' : this.phase === 2 ? '#ff7a3b' : '#ffb13b';
      ctx.shadowColor = core;
      ctx.shadowBlur = 18;
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, 13 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff7e6';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();

      // 受击白闪
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, w * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // ================= EFFECTS =================
  // 飘字（拾取提示 / 得分弹字）
  function floatText(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1, vy: -0.6 });
  }

  function explode(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(1, 4);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: rand(0.02, 0.045),
        size: rand(1.5, 3.5),
        color
      });
    }
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < 130; i++) {
      const layer = (Math.random() * 3) | 0; // 0..2 视差层
      stars.push({
        x: rand(0, W),
        y: rand(0, H),
        speed: 0.3 + layer * 0.7,
        size: 1 + layer * 0.7,
        alpha: 0.25 + layer * 0.25
      });
    }
  }

  // ================= UPDATE =================
  function update(dt, dms, time) {
    if (state === 'PAUSED') return; // 暂停时冻结一切更新
    // 星空背景始终滚动
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > H) { s.y = 0; s.x = rand(0, W); }
    }

    // 粒子始终衰减（让最后一次爆炸也能播完）
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // 飘字始终上浮淡出
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += f.vy * dt;
      f.life -= 0.018 * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }

    // 全屏闪光衰减（炸弹引爆用）
    flashScreen = Math.max(0, flashScreen - 0.06 * dt);

    if (state !== 'PLAYING') return;

    player.update(dt, time);

    // 波次推进：存活足够时间进入下一波并提升难度
    waveTimer += dms;
    if (waveTimer >= CONFIG.wave.duration) {
      waveTimer -= CONFIG.wave.duration;
      wave++;
      recomputeDiff();
      floatText(W / 2, H / 2 - 60, '第 ' + wave + ' 波', '#7fb4ff');
    }

    // Boss 触发：达到分数门槛且当前无 Boss 时登场
    if (!boss && score >= nextBossScore) {
      boss = new Boss(bossLevel);
      floatText(W / 2, 120, 'BOSS 来袭!', '#ff6b6b');
      SFX.bossWarn();
      setTrack('boss'); // 切入紧张战斗曲
    }
    // Boss 更新
    if (boss) boss.update(dt, time);

    // 普通敌机生成（Boss 在场时暂停，专注 1v1）
    if (!boss) {
      spawnAcc += dms;
      if (spawnAcc >= DIFF.spawnInterval) {
        spawnAcc -= DIFF.spawnInterval;
        enemies.push(new Enemy(pickEnemyType()));
      }
    }

    // 玩家子弹
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.update(dt);
      if (b.y < -b.h || b.x < -b.w || b.x > W + b.w) bullets.splice(i, 1);
    }

    // 敌弹
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.update(dt);
      if (eb.y > H + 10 || eb.y < -10 || eb.x < -10 || eb.x > W + 10) enemyBullets.splice(i, 1);
    }

    // 敌机
    for (let i = enemies.length - 1; i >= 0; i--) {
      enemies[i].update(dt, time);
      if (enemies[i].y - enemies[i].h / 2 > H) enemies.splice(i, 1);
    }

    // 碰撞：玩家子弹 vs Boss（每发命中都扣血）
    if (boss) {
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (hit(b, boss)) {
          bullets.splice(j, 1);
          boss.hp--;
          boss.flash = 1;
          explode(b.x, b.y, '#ffd9a0', 4);
          if (boss.hp <= 0) { defeatBoss(); break; }
        }
      }
    }

    // 碰撞：玩家子弹 vs 敌机（伤害模型）
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (hit(b, e)) {
          bullets.splice(j, 1);
          e.hp--;
          e.flash = 1;
          if (e.hp <= 0) {
            enemies.splice(i, 1);
            explode(e.x, e.y, e.def.color, e.maxHp > 3 ? 24 : 14);
            addScore(e.scoreVal);
            SFX.explode();
            maybeDrop(e.x, e.y, e.maxHp > 3); // 击毁掉落（重型机概率更高）
          } else {
            explode(b.x, b.y, '#ffd9a0', 4); // 命中火花
          }
          break;
        }
      }
    }

    // 碰撞：敌弹 / 敌机 vs 玩家（无敌帧或护盾期间不受击）
    if (time > player.invincibleUntil && time > player.shieldUntil) {
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        if (hit(enemyBullets[i], player)) {
          enemyBullets.splice(i, 1);
          damagePlayer(time);
          break;
        }
      }
      if (state === 'PLAYING') {
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (hit(enemies[i], player)) {
            const e = enemies[i];
            enemies.splice(i, 1);
            explode(e.x, e.y, e.def.color, 20);
            damagePlayer(time);
            break;
          }
        }
        // Boss 机体撞击同样伤害玩家
        if (boss && hit(boss, player)) damagePlayer(time);
      }
    }

    // 火力道具：下落 + 拾取
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.update(dt);
      if (p.y - p.h / 2 > H) { powerups.splice(i, 1); continue; }
      // 拾取用宽松圆形判定（不受玩家小判定核影响）
      if (Math.hypot(p.x - player.x, p.y - player.y) < 30) {
        powerups.splice(i, 1);
        const d = p.def;
        if (p.type === 'shield') {
          player.shieldUntil = time + CONFIG.skills.shieldDuration;
          floatText(p.x, p.y - 10, '护盾!', d.glow);
          SFX.shield();
        } else if (p.type === 'bomb') {
          if (player.bombs < CONFIG.skills.maxBombs) {
            player.bombs++;
            floatText(p.x, p.y - 10, '炸弹 +1', d.glow);
          } else {
            addScore(CONFIG.powerup.bonusScore); // 满库存时转为奖励分（与满级吃 P 一致）
            floatText(p.x, p.y - 10, '+' + CONFIG.powerup.bonusScore, '#ffe066');
          }
          SFX.powerup();
        } else { // power
          if (player.power < CONFIG.player.maxPower) {
            player.power++;
            floatText(p.x, p.y - 10, '火力 +1', '#ffd24a');
          } else {
            addScore(CONFIG.powerup.bonusScore); // 满级时给予奖励分
            floatText(p.x, p.y - 10, '+' + CONFIG.powerup.bonusScore, '#ffe066');
          }
          SFX.powerup();
          player.powerDecayAt = time + CONFIG.player.powerDecayInterval; // 拾取刷新衰减计时
        }
        explode(p.x, p.y, d.glow, 14);
      }
    }
  }

  // ================= RENDER =================
  function render(time) {
    // 背景渐变
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0e27');
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星空
    ctx.fillStyle = '#ffffff';
    for (const s of stars) {
      ctx.globalAlpha = s.alpha;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // 实体（菜单态不显示）
    if (state !== 'MENU') {
      for (const b of bullets) b.draw();
      for (const eb of enemyBullets) eb.draw();
      for (const pu of powerups) pu.draw(time);
      for (const e of enemies) e.draw();
      if (boss) boss.draw();
      player.draw(time);
    }

    // 粒子
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 飘字
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 炸弹全屏闪光
    if (flashScreen > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flashScreen * 0.5) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (state !== 'MENU') drawHUD(time);
    if (state === 'PLAYING') drawBombButton();
    if (boss) drawBossBar();
    if (state === 'MENU') drawMenu();
    if (state === 'GAMEOVER') drawGameOver();
    if (state === 'PAUSED') drawPause();
  }

  function drawMiniShip(cx, cy) {
    ctx.fillStyle = '#4aa3ff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.closePath();
    ctx.fill();
  }

  function drawHUD(time) {
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('得分 ' + score, 14, 12);

    // 波次（顶部居中）
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fd0ff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('第 ' + wave + ' 波', W / 2, 15);
    ctx.textAlign = 'left';

    // 火力等级
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('火力 ' + player.power + '/' + CONFIG.player.maxPower, 14, 38);

    // 火力衰减条：剩余时间越少越红，提示玩家赶紧拾取道具
    if (player.power > 1) {
      const remain = Math.max(0, (player.powerDecayAt - time) / CONFIG.player.powerDecayInterval);
      const bx = 14, by = 58, bw = 72, bh = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = remain > 0.4 ? '#ffd24a' : '#ff5a4a';
      ctx.fillRect(bx, by, bw * remain, bh);
    }

    for (let i = 0; i < player.lives; i++) {
      drawMiniShip(W - 16 - i * 22, 22);
    }

    // 静音指示
    if (!audioEnabled) {
      ctx.fillStyle = '#8aa0c8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('静音 (M)', 14, H - 12);
    }
  }

  // Boss 血条（仅 Boss 在场时绘制）
  function drawBossBar() {
    const bw = W - 60, bh = 12, bx = 30, by = 80;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    const r = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = r > 0.5 ? '#e0524a' : r > 0.25 ? '#ff9a3b' : '#ff3b3b';
    ctx.fillRect(bx, by, bw * r, bh);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('BOSS  Lv.' + boss.level, bx, by - 3);
  }

  // 右下角炸弹按钮（显示库存，可点击释放）
  function drawBombButton() {
    const has = player && player.bombs > 0;
    ctx.save();
    ctx.globalAlpha = has ? 0.9 : 0.3;
    ctx.fillStyle = 'rgba(255,122,59,0.22)';
    ctx.beginPath(); ctx.arc(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = has ? '#ffb066' : '#553a30';
    ctx.stroke();
    ctx.fillStyle = has ? '#ffe2cc' : '#7a5a4a';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', BOMB_BTN.x, BOMB_BTN.y - 5);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('×' + (player ? player.bombs : 0), BOMB_BTN.x, BOMB_BTN.y + 12);
    ctx.restore();
  }

  function drawMenu() {
    ctx.fillStyle = 'rgba(2, 3, 10, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7fb4ff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('飞机大战', W / 2, H / 2 - 70);
    ctx.fillStyle = '#cfe2ff';
    ctx.font = '18px sans-serif';
    ctx.fillText('点击屏幕 / 按任意键开始', W / 2, H / 2 + 4);
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 17px sans-serif';
    if (highScore > 0) ctx.fillText('最高分 ' + highScore, W / 2, H / 2 + 32);
    ctx.fillStyle = '#8aa0c8';
    ctx.font = '14px sans-serif';
    ctx.fillText('方向键 / WASD 移动，或用鼠标 / 触摸跟随', W / 2, H / 2 + 62);
    ctx.fillText('「P」火力 · 「S」护盾 · 「B」炸弹(左键/Space/X，触屏双指点按)', W / 2, H / 2 + 84);
    ctx.fillText('M 静音 · P/Esc 暂停', W / 2, H / 2 + 106);
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(2, 3, 10, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText('游戏结束', W / 2, H / 2 - 50);
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('得分 ' + score, W / 2, H / 2 + 4);
    ctx.fillStyle = '#cfe2ff';
    ctx.font = '17px sans-serif';
    ctx.fillText('最高分 ' + highScore, W / 2, H / 2 + 38);
    if (newRecord) {
      ctx.fillStyle = '#7CFC00';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('★ 新纪录！★', W / 2, H / 2 + 64);
    }
    ctx.fillStyle = '#cfe2ff';
    ctx.font = '17px sans-serif';
    ctx.fillText('点击 / 按任意键重新开始', W / 2, H / 2 + 92);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(2, 3, 10, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7fb4ff';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('暂停', W / 2, H / 2 - 18);
    ctx.fillStyle = '#cfe2ff';
    ctx.font = '17px sans-serif';
    ctx.fillText('按 P / Esc 继续', W / 2, H / 2 + 24);
  }

  // ================= LOOP =================
  function loop(t) {
    if (!lastTime) lastTime = t;
    let dms = t - lastTime;
    lastTime = t;
    if (dms > 50) dms = 50;          // 切后台回来时夹紧，避免大跳变
    const dt = dms / (1000 / 60);     // 归一化到 60fps 帧数

    update(dt, dms, t);
    render(t);

    requestAnimationFrame(loop);
  }

  // ================= INIT =================
  initStars();
  loadHighScore();
  reset(); // 让菜单态也有干净的实体引用（reset 内会 recomputeDiff）
  requestAnimationFrame(loop);
})();
