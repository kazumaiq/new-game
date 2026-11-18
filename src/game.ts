import { sound } from './audio';
import { NetRole, RemotePlayerState } from './network';
import { PlayerProfile, SHIP_CLASSES } from './progression';
import { THEMES } from './themes';
import { UPGRADES } from './upgrades';
import {
  Bullet,
  Enemy,
  EnemyKind,
  FloatingText,
  GameMode,
  GameSettings,
  GameState,
  LightningArc,
  Particle,
  Player,
  PlayerStats,
  PowerUp,
  PowerUpKind,
  Shockwave,
  ThemePalette,
  UpgradeDef,
  XpOrb,
} from './types';

export interface HudSnapshot {
  state: GameState;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  score: number;
  wave: number;
  kills: number;
  combo: number;
  maxCombo: number;
  comboTimer: number;
  novaCharge: number;
  dashReadyRatio: number;
  overclockTimer: number;
  shieldReady: boolean;
  mode: GameMode;
  blitzTimer: number;
  boss: { name: string; hp: number; maxHp: number } | null;
  acquiredUpgrades: Record<string, number>;
}

export interface GameCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onLevelUp: (choices: UpgradeDef[], acquired: Record<string, number>) => void;
  onGameOver: (summary: {
    score: number;
    wave: number;
    kills: number;
    maxCombo: number;
    shards: number;
    victory?: boolean;
    mode: GameMode;
    upgrades: Record<string, number>;
  }) => void;
  onWaveBanner: (title: string, subtitle: string) => void;
  onPvpHit?: (damage: number) => void;
  onAchievement?: (id: string) => void;
  onAbyssChoice?: () => void;
}

interface Star {
  x: number;
  y: number;
  size: number;
  depth: number;
  twinkle: number;
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  colorIdx: 0 | 1 | 2;
}

export class AetherGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;

  public state: GameState = 'title';
  public theme: ThemePalette = THEMES[0];
  public settings: GameSettings = {
    soundEnabled: true,
    musicEnabled: true,
    bloomEnabled: true,
    screenShake: true,
    autoFire: true,
  };

  private readonly arenaW = 2400;
  private readonly arenaH = 1800;

  private width = 1280;
  private height = 720;
  private dpr = 1;

  private camX = 1200;
  private camY = 900;
  private shakeMag = 0;
  private hitStop = 0;
  private time = 0;

  private player!: Player;
  private stats!: PlayerStats;
  private acquiredUpgrades: Record<string, number> = {};

  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private powerups: PowerUp[] = [];
  private particles: Particle[] = [];
  private arcs: LightningArc[] = [];
  private shockwaves: Shockwave[] = [];
  private orbs: XpOrb[] = [];
  private texts: FloatingText[] = [];

  private stars: Star[] = [];
  private nebulae: Nebula[] = [];

  private nextEnemyId = 1;
  private score = 0;
  private wave = 1;
  private kills = 0;
  private combo = 0;
  private maxCombo = 0;
  private comboTimer = 0;
  private waveSpawnRemaining = 0;
  private spawnTimer = 0;
  private waveClearDelay = 0;
  private bossActive = false;

  // Input
  private keys = new Set<string>();
  private mouseScreenX = 0;
  private mouseScreenY = 0;
  private mouseDown = false;
  private isTouchDevice = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchAimActive = false;
  private touchAimX = 0;
  private touchAimY = 0;

  private rafId = 0;
  private lastTs = 0;
  private hudSyncTimer = 0;

  private profile: PlayerProfile | null = null;
  private greedMult = 1;
  private xpBuffMult = 1;
  public mode: GameMode = 'classic';
  private blitzTimer = 180;
  private blitzBossSpawned = false;
  private inAbyss = false;
  private bonusShards = 0;
  private bossDamagedPlayer = false;
  private slowMoTimer = 0;
  private beamTimer = 0;
  private ramTimer = 0;
  private cloneTimer = 0;
  private eventTimer = 28;
  private powerZone: { x: number; y: number; radius: number; life: number } | null = null;
  private courier: { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; life: number } | null = null;
  private meteors: Array<{ x: number; y: number; timer: number; radius: number }> = [];
  private coopRole: NetRole = 'none';
  private remotePlayer: RemotePlayerState = {
    connected: false,
    callsign: 'НАПАРНИК',
    color: '#ff2a85',
    x: 1200,
    y: 900,
    angle: 0,
    hp: 100,
    maxHp: 100,
    down: false,
  };

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Не удалось инициализировать 2D-контекст');
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.initBackdrop();
    this.resetRun(true);
    this.resize();
  }

  private initBackdrop(): void {
    this.stars = [];
    for (let i = 0; i < 240; i++) {
      this.stars.push({
        x: Math.random() * this.arenaW,
        y: Math.random() * this.arenaH,
        size: 0.8 + Math.random() * 2.2,
        depth: 0.25 + Math.random() * 0.75,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    this.nebulae = [
      { x: 500, y: 450, radius: 520, colorIdx: 0 },
      { x: 1850, y: 550, radius: 580, colorIdx: 1 },
      { x: 1200, y: 1350, radius: 620, colorIdx: 2 },
    ];
  }

  public setTheme(theme: ThemePalette): void {
    this.theme = theme;
  }

  public setProfile(profile: PlayerProfile): void {
    this.profile = profile;
  }

  public setCoopRole(role: NetRole): void {
    this.coopRole = role;
    this.remotePlayer.connected = role !== 'none';
  }

  public setRemoteHello(callsign: string, color: string): void {
    this.remotePlayer.connected = true;
    this.remotePlayer.callsign = callsign;
    this.remotePlayer.color = color;
  }

  public getCoopSyncPacket(): Record<string, unknown> {
    if (this.coopRole === 'host') {
      return {
        type: 'state',
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        a: Number(this.player.angle.toFixed(2)),
        hp: Math.ceil(this.player.hp),
        mhp: this.player.maxHp,
        down: this.player.hp <= 0,
        wave: this.wave,
        score: this.score,
        enemies: this.enemies.slice(0, 45).map((e) => [
          e.id,
          e.kind,
          Math.round(e.x),
          Math.round(e.y),
          Math.round(e.hp),
          Math.round(e.maxHp),
        ]),
      };
    }
    return {
      type: 'input',
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      a: Number(this.player.angle.toFixed(2)),
      hp: Math.ceil(this.player.hp),
      mhp: this.player.maxHp,
      down: this.player.hp <= 0,
    };
  }

  public applyCoopPacket(data: Record<string, unknown>): void {
    if (data.type === 'state' || data.type === 'input') {
      this.remotePlayer.connected = true;
      this.remotePlayer.x = Number(data.x ?? this.remotePlayer.x);
      this.remotePlayer.y = Number(data.y ?? this.remotePlayer.y);
      this.remotePlayer.angle = Number(data.a ?? this.remotePlayer.angle);
      this.remotePlayer.hp = Number(data.hp ?? this.remotePlayer.hp);
      this.remotePlayer.maxHp = Number(data.mhp ?? this.remotePlayer.maxHp);
      this.remotePlayer.down = Boolean(data.down);
    }
    if (data.type === 'state' && this.coopRole === 'guest') {
      this.wave = Number(data.wave ?? this.wave);
      this.score = Math.max(this.score, Number(data.score ?? this.score));
      const rawEnemies = data.enemies as Array<[number, EnemyKind, number, number, number, number]> | undefined;
      if (Array.isArray(rawEnemies)) {
        const next: Enemy[] = [];
        for (const [id, kind, x, y, hp, maxHp] of rawEnemies) {
          const existing = this.enemies.find((e) => e.id === id);
          const color =
            kind === 'splitter'
              ? '#ff2a85'
              : kind === 'mini'
              ? '#ff70a6'
              : kind === 'sniper'
              ? '#ffb703'
              : kind === 'warden'
              ? '#b5179e'
              : kind === 'boss'
              ? '#ff0054'
              : '#00f5ff';
          const radius =
            kind === 'boss' ? 54 : kind === 'warden' ? 24 : kind === 'splitter' ? 22 : kind === 'sniper' ? 17 : kind === 'mini' ? 10 : 15;
          next.push({
            id,
            kind,
            x,
            y,
            vx: 0,
            vy: 0,
            angle: existing ? existing.angle : 0,
            radius,
            hp,
            maxHp,
            speed: 140,
            color,
            xpValue: 12,
            scoreValue: 100,
            shootTimer: 2,
            aimTimer: 0,
            aimAngle: 0,
            hitFlash: existing ? existing.hitFlash : 0,
            spin: existing ? existing.spin : 2,
          });
        }
        this.enemies = next;
      }
    }
  }

  public setMode(mode: GameMode): void {
    this.mode = mode;
  }

  public applyRemoteHit(damage: number): void {
    if (this.state !== 'playing' || this.player.invulnTimer > 0) return;
    this.damagePlayer(damage);
  }

  private vibrate(ms: number): void {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (s: 'light' | 'medium' | 'heavy') => void } } };
    }).Telegram;
    if (tg?.WebApp?.HapticFeedback) {
      tg.WebApp.HapticFeedback.impactOccurred(ms >= 45 ? 'heavy' : ms >= 25 ? 'medium' : 'light');
      return;
    }
    if (this.isTouchDevice && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  public setTouchDevice(enabled: boolean): void {
    this.isTouchDevice = enabled;
  }

  public resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  public startLoop(): void {
    this.lastTs = performance.now();
    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
  }

  public startNewGame(): void {
    sound.init();
    if (this.settings.musicEnabled) {
      sound.startMusic();
    }
    this.resetRun(false);
    this.state = 'playing';
    if (this.mode === 'pvp') {
      this.callbacks.onWaveBanner('ДУЭЛЬ 1 НА 1', 'ПОБЕДИ СОПЕРНИКА НА АРЕНЕ');
    } else if (this.mode === 'blitz') {
      this.callbacks.onWaveBanner('БЛИЦ 3:00', 'УСКОРЕННАЯ ПРОКАЧКА · ВЫЖИВИ 3 МИНУТЫ');
    } else if (this.mode === 'daily') {
      this.callbacks.onWaveBanner('ЗАБЕГ ДНЯ', 'ОДИНАКОВЫЕ ВОЛНЫ ДЛЯ ВСЕХ ПИЛОТОВ');
    } else {
      this.callbacks.onWaveBanner('ВОЛНА 01', 'ПРОРЫВ ПЕРИМЕТРА СЕКТОРА');
    }
    if (this.player.xp >= this.player.xpToNext && this.mode !== 'pvp') {
      this.player.xp = 0;
      this.player.level++;
      this.triggerLevelUp();
    }
    this.pushHud();
  }

  public togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.pushHud();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.pushHud();
    }
  }

  public returnToTitle(): void {
    this.resetRun(true);
    this.state = 'title';
    this.pushHud();
  }

  public setKey(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      if (code === 'Space' && this.state === 'playing') {
        this.triggerDash();
      }
      if ((code === 'KeyE' || code === 'ShiftLeft' || code === 'ShiftRight') && this.state === 'playing') {
        this.triggerNova();
      }
      if (code === 'Escape' && (this.state === 'playing' || this.state === 'paused')) {
        this.togglePause();
      }
    } else {
      this.keys.delete(code);
    }
  }

  public setMousePos(x: number, y: number): void {
    this.mouseScreenX = x;
    this.mouseScreenY = y;
  }

  public setMouseDown(down: boolean): void {
    this.mouseDown = down;
  }

  public setTouchMove(dx: number, dy: number): void {
    this.touchMoveX = dx;
    this.touchMoveY = dy;
  }

  public setTouchAim(active: boolean, dx = 0, dy = 0): void {
    this.touchAimActive = active;
    this.touchAimX = dx;
    this.touchAimY = dy;
  }

  public triggerDash(): void {
    if (this.state !== 'playing') return;
    if (this.player.dashTimer > 0) return;

    let dx = 0;
    let dy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (Math.abs(this.touchMoveX) > 0.08 || Math.abs(this.touchMoveY) > 0.08) {
      dx = this.touchMoveX;
      dy = this.touchMoveY;
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      dx /= len;
      dy /= len;
    } else {
      dx = Math.cos(this.player.angle);
      dy = Math.sin(this.player.angle);
    }

    this.player.dashDirX = dx;
    this.player.dashDirY = dy;
    this.player.dashDuration = 0.17;
    this.player.dashTimer = this.stats.dashCooldown;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.26);
    sound.playDash();
    this.vibrate(20);

    this.spawnShockwave(this.player.x, this.player.y, 95, this.theme.primary, 3);
    if (this.stats.phantomDash) {
      this.phantomBlast(this.player.x, this.player.y);
    }
  }

  public continueToAbyss(): void {
    this.inAbyss = true;
    this.greedMult *= 2;
    this.state = 'playing';
    this.startWave(this.wave + 1, false);
    this.callbacks.onWaveBanner('БЕЗДНА ОТКРЫТА', 'НАГРАДА ОСКОЛКАМИ x2');
    this.pushHud();
  }

  public finishVictory(): void {
    this.state = 'gameover';
    this.pushHud();
    const rawShards = Math.max(25, Math.floor(this.kills * 0.5 + this.wave * 10)) + 100 + this.bonusShards;
    this.callbacks.onGameOver({
      score: this.score + 5000,
      wave: this.wave,
      kills: this.kills,
      maxCombo: this.maxCombo,
      shards: Math.round(rawShards * this.greedMult),
      victory: true,
      mode: this.mode,
      upgrades: { ...this.acquiredUpgrades },
    });
  }

  public triggerNova(): void {
    if (this.state !== 'playing') return;
    if (this.player.novaCharge < 100) return;

    this.player.novaCharge = 0;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.9);
    sound.playNova();
    this.vibrate(60);
    this.addShake(16);

    const shipId = this.profile?.selectedShip || 'interceptor';
    if (shipId === 'interceptor') {
      this.beamTimer = 1.6;
      this.addFloatingText(this.player.x, this.player.y - 38, '⚡ ГИПЕР-ЛУЧ!', this.theme.primary, 1.3);
    } else if (shipId === 'juggernaut') {
      this.ramTimer = 3.5;
      this.player.invulnTimer = 3.5;
      this.addFloatingText(this.player.x, this.player.y - 38, '🛡 ЭНЕРГО-ТАРАН!', '#ffb703', 1.3);
    } else if (shipId === 'phantom') {
      this.cloneTimer = 5.5;
      this.addFloatingText(this.player.x, this.player.y - 38, '👥 ТЕНЕВЫЕ КЛОНЫ!', this.theme.accent, 1.3);
    } else if (shipId === 'tesla') {
      this.spawnShockwave(this.player.x, this.player.y, 700, '#70e0ff', 7);
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        this.arcs.push({
          points: [
            { x: this.player.x, y: this.player.y },
            { x: (this.player.x + e.x) / 2 + (Math.random() - 0.5) * 40, y: (this.player.y + e.y) / 2 + (Math.random() - 0.5) * 40 },
            { x: e.x, y: e.y },
          ],
          color: '#70e0ff',
          life: 0.35,
          maxLife: 0.35,
        });
        this.damageEnemy(e, 190 + this.wave * 22, true);
      }
      this.addFloatingText(this.player.x, this.player.y - 38, '🌩 ГРОЗОВАЯ БУРЯ!', '#70e0ff', 1.3);
    }

    this.pushHud();
  }

  private phantomBlast(x: number, y: number): void {
    const r = 200;
    this.spawnShockwave(x, y, r, this.theme.accent, 4);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - x, e.y - y) <= r + e.radius) {
        this.damageEnemy(e, 60 + this.stats.damage * 1.45, true);
      }
    }
  }

  public applyUpgrade(id: string): void {
    const count = (this.acquiredUpgrades[id] || 0) + 1;
    this.acquiredUpgrades[id] = count;

    switch (id) {
      case 'multishot':
        this.stats.projectiles += 1;
        this.stats.spreadAngle = Math.min(0.45, 0.08 * (this.stats.projectiles - 1));
        break;
      case 'firerate':
        this.stats.fireRate *= 1.24;
        this.stats.projectileSpeed *= 1.12;
        break;
      case 'damage':
        this.stats.damage *= 1.3;
        this.stats.critChance = Math.min(0.85, this.stats.critChance + 0.08);
        break;
      case 'chain':
        this.stats.chainLightning += 1;
        break;
      case 'ricochet':
        this.stats.ricochet += 1;
        this.stats.pierce += 1;
        break;
      case 'orbitals':
        this.stats.orbitalBlades += 2;
        break;
      case 'homing':
        this.stats.homingMissiles += 2;
        break;
      case 'phantomdash':
        this.stats.phantomDash = true;
        this.stats.dashCooldown *= 0.75;
        break;
      case 'aegisshield':
        this.stats.aegisShieldCooldown =
          this.stats.aegisShieldCooldown === 0 ? 14 : Math.max(5, this.stats.aegisShieldCooldown * 0.7);
        this.player.shieldReady = true;
        this.player.shieldTimer = 0;
        break;
      case 'vampiric':
        this.stats.vampiricChance = Math.min(0.45, this.stats.vampiricChance + 0.12);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
        break;
      case 'thrusters':
        this.stats.moveSpeed *= 1.16;
        this.stats.pickupRadius *= 1.45;
        break;
      case 'hull':
        this.player.maxHp += 35;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
        break;
      case 'crit':
        this.stats.critChance = Math.min(0.9, this.stats.critChance + 0.18);
        break;
      case 'evo_storm':
        this.stats.evoStorm = true;
        this.stats.projectiles += 2;
        this.stats.spreadAngle = Math.min(0.55, 0.08 * (this.stats.projectiles - 1));
        this.stats.chainLightning += 2;
        break;
      case 'evo_vortex':
        this.stats.evoVortex = true;
        this.stats.orbitalBlades += 2;
        break;
      case 'evo_omega':
        this.stats.evoOmega = true;
        this.stats.homingMissiles += 2;
        break;
    }

    if (id.startsWith('evo_')) {
      this.callbacks.onAchievement?.('ach_evo');
    }

    this.state = 'playing';
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.75);
    this.spawnShockwave(this.player.x, this.player.y, 190, this.theme.primary, 4);
    this.pushHud();
  }

  private resetRun(attractMode: boolean): void {
    this.stats = {
      moveSpeed: 375,
      fireRate: 6.4,
      damage: 25,
      projectileSpeed: 1000,
      projectiles: 1,
      spreadAngle: 0,
      pierce: 0,
      ricochet: 0,
      chainLightning: 0,
      homingMissiles: 0,
      orbitalBlades: 0,
      dashCooldown: 1.3,
      phantomDash: false,
      vampiricChance: 0,
      pickupRadius: 160,
      critChance: 0.12,
      aegisShieldCooldown: 0,
      evoStorm: false,
      evoVortex: false,
      evoOmega: false,
    };

    this.player = {
      x: this.arenaW / 2,
      y: this.arenaH / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 16,
      hp: 100,
      maxHp: 100,
      xp: 0,
      xpToNext: 65,
      level: 1,
      dashTimer: 0,
      dashDuration: 0,
      dashDirX: 1,
      dashDirY: 0,
      invulnTimer: 0,
      novaCharge: 55,
      overclockTimer: 0,
      shieldReady: false,
      shieldTimer: 0,
      fireCooldown: 0,
      shotCounter: 0,
      trail: [],
      wingLeftTrail: [],
      wingRightTrail: [],
      afterimages: [],
      bladeAngle: 0,
    };

    this.acquiredUpgrades = {};
    this.bullets = [];
    this.enemies = [];
    this.powerups = [];
    this.particles = [];
    this.arcs = [];
    this.shockwaves = [];
    this.orbs = [];
    this.texts = [];

    this.score = 0;
    this.wave = 1;
    this.kills = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.bossActive = false;
    this.greedMult = 1;
    this.xpBuffMult = 1;
    this.blitzTimer = 180;
    this.blitzBossSpawned = false;
    this.inAbyss = false;
    this.bonusShards = 0;
    this.bossDamagedPlayer = false;
    this.slowMoTimer = 0;
    this.beamTimer = 0;
    this.ramTimer = 0;
    this.cloneTimer = 0;
    this.eventTimer = 26;
    this.powerZone = null;
    this.courier = null;
    this.meteors = [];

    if (!attractMode && this.mode === 'pvp') {
      this.player.x = this.coopRole === 'host' ? 450 : 1950;
      this.player.y = 900;
      this.player.maxHp = 200;
      this.player.hp = 200;
    }

    if (!attractMode && this.profile) {
      const m = this.profile.metaLevels;
      this.stats.damage *= 1 + (m.meta_damage || 0) * 0.08;
      this.stats.moveSpeed *= 1 + (m.meta_speed || 0) * 0.06;
      const bonusHp = (m.meta_hp || 0) * 15;
      this.player.maxHp += bonusHp;
      this.player.hp += bonusHp;
      this.greedMult = 1 + (m.meta_greed || 0) * 0.15;

      const ship = SHIP_CLASSES.find((s) => s.id === this.profile?.selectedShip) || SHIP_CLASSES[0];
      this.player.maxHp = Math.max(50, this.player.maxHp + ship.hpBonus);
      this.player.hp = this.player.maxHp;
      this.stats.moveSpeed *= ship.speedMult;
      this.stats.critChance += ship.critBonus;
      this.stats.dashCooldown *= ship.dashMult;

      for (const upgId of ship.startUpgrades) {
        this.applyUpgrade(upgId);
      }
      if ((m.meta_startlvl || 0) > 0) {
        this.player.xp = this.player.xpToNext;
      }
      if (this.profile.nextRunBuff === 'shield') {
        this.applyUpgrade('aegisshield');
      } else if (this.profile.nextRunBuff === 'xp') {
        this.xpBuffMult = 1.5;
      }
      this.profile.nextRunBuff = 'none';
    }

    this.camX = this.player.x;
    this.camY = this.player.y;

    this.startWave(1, attractMode);
  }

  private startWave(waveNum: number, attractMode = false): void {
    this.wave = waveNum;
    this.bossActive = waveNum % 5 === 0;
    this.waveSpawnRemaining =
      this.bossActive ? 6 + waveNum : waveNum === 1 ? 6 : waveNum === 2 ? 10 : 8 + waveNum * 4;
    this.spawnTimer = waveNum === 1 ? 0.8 : 0.4;

    if (this.bossActive && !attractMode) {
      this.bossDamagedPlayer = false;
      sound.playBossWarning();
      this.callbacks.onWaveBanner(
        `ВОЛНА ${String(waveNum).padStart(2, '0')} — БОСС`,
        'ПРИБЛИЖАЕТСЯ МОНОЛИТ'
      );
      this.spawnEnemy('boss');
    } else if (!attractMode && waveNum > 1) {
      this.callbacks.onWaveBanner(
        `ВОЛНА ${String(waveNum).padStart(2, '0')}`,
        'УГРОЗА СЕКТОРА УСИЛИВАЕТСЯ'
      );
    }
  }

  private spawnEnemy(forcedKind?: EnemyKind): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 480 + Math.random() * 240;
    const x = Math.max(60, Math.min(this.arenaW - 60, this.player.x + Math.cos(angle) * dist));
    const y = Math.max(60, Math.min(this.arenaH - 60, this.player.y + Math.sin(angle) * dist));

    let kind: EnemyKind = forcedKind ?? 'swarmer';
    if (!forcedKind) {
      const r = Math.random();
      if (this.wave >= 5 && r < 0.12) kind = 'spawner';
      else if (this.wave >= 4 && r < 0.25) kind = 'shielder';
      else if (this.wave >= 4 && r < 0.38) kind = 'warden';
      else if (this.wave >= 3 && r < 0.54) kind = 'sniper';
      else if (this.wave >= 2 && r < 0.7) kind = 'bomber';
      else if (this.wave >= 2 && r < 0.84) kind = 'splitter';
      else kind = 'swarmer';
    }

    const hpScale = this.wave === 1 ? 0.72 : this.wave === 2 ? 0.85 : 1 + (this.wave - 3) * 0.22;
    const speedScale = this.wave === 1 ? 0.78 : this.wave === 2 ? 0.88 : 1;
    let radius = 15;
    let hp = 32 * hpScale;
    let speed = (175 + Math.min(110, this.wave * 6)) * speedScale;
    let color = '#00f5ff';
    let xpValue = 12;
    let scoreValue = 100;

    if (kind === 'bomber') {
      radius = 16;
      hp = 36 * hpScale;
      speed = 215 + Math.min(80, this.wave * 5);
      color = '#ff7b00';
      xpValue = 16;
      scoreValue = 160;
    } else if (kind === 'shielder') {
      radius = 24;
      hp = 115 * hpScale;
      speed = 95;
      color = '#3a86ff';
      xpValue = 30;
      scoreValue = 310;
    } else if (kind === 'spawner') {
      radius = 26;
      hp = 120 * hpScale;
      speed = 75;
      color = '#00ff87';
      xpValue = 38;
      scoreValue = 380;
    } else if (kind === 'splitter') {
      radius = 22;
      hp = 68 * hpScale;
      speed = 115 + Math.min(60, this.wave * 4);
      color = '#ff2a85';
      xpValue = 22;
      scoreValue = 220;
    } else if (kind === 'mini') {
      radius = 10;
      hp = 18 * hpScale;
      speed = 235;
      color = '#ff70a6';
      xpValue = 7;
      scoreValue = 65;
    } else if (kind === 'sniper') {
      radius = 17;
      hp = 48 * hpScale;
      speed = 125;
      color = '#ffb703';
      xpValue = 25;
      scoreValue = 260;
    } else if (kind === 'warden') {
      radius = 24;
      hp = 105 * hpScale;
      speed = 105;
      color = '#b5179e';
      xpValue = 35;
      scoreValue = 360;
    } else if (kind === 'boss') {
      radius = 54;
      hp = 980 * hpScale;
      speed = 94;
      color = '#ff0054';
      xpValue = 180;
      scoreValue = 2500;
    }

    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius,
      hp,
      maxHp: hp,
      speed,
      color,
      xpValue,
      scoreValue,
      shootTimer: 1.5 + Math.random() * 1.2,
      aimTimer: 0,
      aimAngle: 0,
      hitFlash: 0,
      phase: 0,
      spin: (Math.random() - 0.5) * 2.5,
    });
  }

  private update(dt: number): void {
    this.time += dt;

    if (this.state === 'paused' || this.state === 'levelup' || this.state === 'gameover') {
      return;
    }

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    if (this.slowMoTimer > 0) {
      this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
      dt *= 0.28;
    }

    const isTitle = this.state === 'title';

    if (this.beamTimer > 0) {
      this.beamTimer = Math.max(0, this.beamTimer - dt);
      const bx = Math.cos(this.player.angle);
      const by = Math.sin(this.player.angle);
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const ex = e.x - this.player.x;
        const ey = e.y - this.player.y;
        const proj = ex * bx + ey * by;
        if (proj > 0 && proj < 900) {
          const perp = Math.abs(ex * -by + ey * bx);
          if (perp < e.radius + 26) {
            this.damageEnemy(e, (this.stats.damage * 14) * dt, false);
          }
        }
      }
    }

    if (this.ramTimer > 0) {
      this.ramTimer = Math.max(0, this.ramTimer - dt);
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (d < e.radius + 72) {
          this.damageEnemy(e, (this.stats.damage * 11) * dt, false);
        }
      }
    }

    if (this.cloneTimer > 0) {
      this.cloneTimer = Math.max(0, this.cloneTimer - dt);
    }

    if (!isTitle && this.mode !== 'pvp') {
      this.updateArenaEvents(dt);
    }

    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    if (!isTitle && this.mode === 'blitz') {
      this.blitzTimer -= dt;
      if (this.blitzTimer <= 30 && !this.blitzBossSpawned) {
        this.blitzBossSpawned = true;
        sound.playBossWarning();
        this.callbacks.onWaveBanner('ФИНАЛЬНЫЙ РЫВОК', 'ГИГА-МОНОЛИТ НА АРЕНЕ!');
        this.spawnEnemy('boss');
      }
      if (this.blitzTimer <= 0) {
        this.blitzTimer = 0;
        this.state = 'gameover';
        this.pushHud();
        const rawShards = Math.max(15, Math.floor(this.kills * 0.6 + this.wave * 10)) * 2;
        this.callbacks.onGameOver({
          score: this.score + 5000,
          wave: this.wave,
          kills: this.kills,
          maxCombo: this.maxCombo,
          shards: Math.round(rawShards * this.greedMult),
          victory: true,
          mode: this.mode,
          upgrades: { ...this.acquiredUpgrades },
        });
        return;
      }
    }

    if (!isTitle && this.mode === 'pvp' && this.remotePlayer.connected && this.remotePlayer.down) {
      this.state = 'gameover';
      this.pushHud();
      this.callbacks.onGameOver({
        score: this.score + 3000,
        wave: 1,
        kills: this.kills + 1,
        maxCombo: this.maxCombo,
        shards: 80,
        victory: true,
        mode: this.mode,
        upgrades: { ...this.acquiredUpgrades },
      });
      return;
    }

    this.updatePlayer(dt, isTitle);
    this.updateSpawning(dt, isTitle);
    this.updateEnemies(dt, isTitle);
    this.updateBullets(dt, isTitle);
    this.updatePowerUps(dt, isTitle);
    this.updateOrbs(dt);
    this.updateEffects(dt);
    this.updateCamera(dt, isTitle);

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.06) {
      this.hudSyncTimer = 0;
      this.pushHud();
    }
  }

  private updatePlayer(dt: number, isTitle: boolean): void {
    const p = this.player;
    p.bladeAngle += dt * 3.8;
    if (p.dashTimer > 0) p.dashTimer = Math.max(0, p.dashTimer - dt);
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.overclockTimer > 0) p.overclockTimer = Math.max(0, p.overclockTimer - dt);

    if (this.stats.aegisShieldCooldown > 0 && !p.shieldReady) {
      p.shieldTimer -= dt;
      if (p.shieldTimer <= 0) {
        p.shieldReady = true;
        this.spawnShockwave(p.x, p.y, 70, '#70e0ff', 2);
      }
    }

    let moveX = 0;
    let moveY = 0;

    if (isTitle) {
      const nearest = this.findNearestEnemy(p.x, p.y);
      const orbitAngle = this.time * 0.7;
      const targetX = this.arenaW / 2 + Math.cos(orbitAngle) * 320;
      const targetY = this.arenaH / 2 + Math.sin(orbitAngle * 1.3) * 240;
      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const len = Math.hypot(dx, dy) || 1;
      moveX = dx / len;
      moveY = dy / len;

      if (nearest) {
        p.angle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
        if (p.fireCooldown <= 0) this.fireWeapon(true);
      } else {
        p.angle = Math.atan2(moveY, moveX);
      }
      p.hp = p.maxHp;
    } else {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

      if (Math.abs(this.touchMoveX) > 0.04 || Math.abs(this.touchMoveY) > 0.04) {
        moveX = this.touchMoveX;
        moveY = this.touchMoveY;
      }

      const len = Math.hypot(moveX, moveY);
      if (len > 1) {
        moveX /= len;
        moveY /= len;
      }

      // Прицеливание: правый стик (вручную) -> мышь -> по курсу полёта с узким конусом (±28°)
      if (this.touchAimActive && (Math.abs(this.touchAimX) > 0.1 || Math.abs(this.touchAimY) > 0.1)) {
        p.angle = Math.atan2(this.touchAimY, this.touchAimX);
      } else if (this.isTouchDevice) {
        if (len > 0.1) {
          const moveAngle = Math.atan2(moveY, moveX);
          let bestAngle = moveAngle;
          let bestDist = 420;
          for (const e of this.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bestDist) {
              const ea = Math.atan2(e.y - p.y, e.x - p.x);
              let diff = ea - moveAngle;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              if (Math.abs(diff) < 0.48) {
                bestDist = d;
                bestAngle = ea;
              }
            }
          }
          p.angle = bestAngle;
        }
      } else {
        const worldMouseX = this.mouseScreenX + this.camX - this.width / 2;
        const worldMouseY = this.mouseScreenY + this.camY - this.height / 2;
        p.angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
      }

      const wantsFire =
        this.settings.autoFire || this.mouseDown || this.touchAimActive || this.isTouchDevice;
      if (wantsFire && p.fireCooldown <= 0) {
        this.fireWeapon(false);
      }
    }

    if (p.dashDuration > 0) {
      p.dashDuration -= dt;
      const dashSpeed = this.stats.moveSpeed * 3.1;
      p.vx = p.dashDirX * dashSpeed;
      p.vy = p.dashDirY * dashSpeed;
      p.afterimages.push({ x: p.x, y: p.y, angle: p.angle, alpha: 0.75 });
    } else {
      const accel = 14;
      const targetVx = moveX * this.stats.moveSpeed;
      const targetVy = moveY * this.stats.moveSpeed;
      p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
      p.vy += (targetVy - p.vy) * Math.min(1, accel * dt);
    }

    p.x = Math.max(p.radius + 16, Math.min(this.arenaW - p.radius - 16, p.x + p.vx * dt));
    p.y = Math.max(p.radius + 16, Math.min(this.arenaH - p.radius - 16, p.y + p.vy * dt));

    // Engine & wingtip trails
    if (Math.hypot(p.vx, p.vy) > 35) {
      p.trail.push({
        x: p.x - Math.cos(p.angle) * 14,
        y: p.y - Math.sin(p.angle) * 14,
        alpha: 0.9,
      });
      const perpX = -Math.sin(p.angle) * 13;
      const perpY = Math.cos(p.angle) * 13;
      const backX = -Math.cos(p.angle) * 12;
      const backY = -Math.sin(p.angle) * 12;
      p.wingLeftTrail.push({ x: p.x + backX + perpX, y: p.y + backY + perpY, alpha: 0.55 });
      p.wingRightTrail.push({ x: p.x + backX - perpX, y: p.y + backY - perpY, alpha: 0.55 });
    }

    const fadeTrail = (arr: Array<{ x: number; y: number; alpha: number }>, rate: number) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].alpha -= dt * rate;
        if (arr[i].alpha <= 0) arr.splice(i, 1);
      }
    };
    fadeTrail(p.trail, 3.4);
    fadeTrail(p.wingLeftTrail, 3.8);
    fadeTrail(p.wingRightTrail, 3.8);

    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].alpha -= dt * 3.5;
      if (p.afterimages[i].alpha <= 0) p.afterimages.splice(i, 1);
    }

    if (this.stats.orbitalBlades > 0) {
      const orbitR = 66;
      for (let b = 0; b < this.stats.orbitalBlades; b++) {
        const a = p.bladeAngle + (b * Math.PI * 2) / this.stats.orbitalBlades;
        const bx = p.x + Math.cos(a) * orbitR;
        const by = p.y + Math.sin(a) * orbitR;

        for (let i = this.bullets.length - 1; i >= 0; i--) {
          const bul = this.bullets[i];
          if (bul.isEnemy && Math.hypot(bul.x - bx, bul.y - by) < 18) {
            this.spawnParticles(bul.x, bul.y, 4, this.theme.primary, 120);
            this.bullets.splice(i, 1);
          }
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (Math.hypot(e.x - bx, e.y - by) < e.radius + 14) {
            this.damageEnemy(e, this.stats.damage * 0.48 * dt * 15, false);
          }
        }
      }
    }
    if (this.stats.evoVortex && !isTitle) {
      const vortexR = 86;
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const bul = this.bullets[i];
        if (bul.isEnemy && Math.hypot(bul.x - p.x, bul.y - p.y) < vortexR) {
          this.bullets.splice(i, 1);
        }
      }
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (Math.hypot(e.x - p.x, e.y - p.y) < vortexR + e.radius) {
          this.damageEnemy(e, this.stats.damage * 0.55 * dt * 12, false);
        }
      }
    }
  }

  private fireWeapon(silent: boolean): void {
    const p = this.player;
    const rateMult = p.overclockTimer > 0 ? 1.9 : 1;
    p.fireCooldown = 1 / (this.stats.fireRate * rateMult);
    p.shotCounter++;

    const count = this.stats.projectiles;
    const isCrit = Math.random() < this.stats.critChance;
    const zoneMult =
      this.powerZone && Math.hypot(p.x - this.powerZone.x, p.y - this.powerZone.y) <= this.powerZone.radius
        ? 2
        : 1;
    const dmg = this.stats.damage * (isCrit ? 2.2 : 1) * zoneMult;

    for (let i = 0; i < count; i++) {
      const offset =
        count === 1 ? 0 : (i - (count - 1) / 2) * (this.stats.spreadAngle / Math.max(1, count - 1));
      const a = p.angle + offset;
      const muzzleX = p.x + Math.cos(a) * 20;
      const muzzleY = p.y + Math.sin(a) * 20;

      this.bullets.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(a) * this.stats.projectileSpeed,
        vy: Math.sin(a) * this.stats.projectileSpeed,
        radius: isCrit ? 5.6 : 4.2,
        damage: dmg,
        isEnemy: false,
        isCrit,
        pierceLeft: this.stats.pierce,
        ricochetLeft: this.stats.ricochet,
        life: 1.5,
        color: p.overclockTimer > 0 ? '#ffb703' : isCrit ? this.theme.accent : this.theme.primary,
        trail: [],
        hitIds: new Set(),
      });
    }

    if (this.stats.homingMissiles > 0 && (this.stats.evoOmega || p.shotCounter % 3 === 0)) {
      for (let m = 0; m < this.stats.homingMissiles; m++) {
        const side = m % 2 === 0 ? 1 : -1;
        const a = p.angle + side * (0.45 + Math.floor(m / 2) * 0.25);
        this.bullets.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * (this.stats.projectileSpeed * 0.65),
          vy: Math.sin(a) * (this.stats.projectileSpeed * 0.65),
          radius: 5,
          damage: this.stats.damage * 1.15,
          isEnemy: false,
          isHoming: true,
          pierceLeft: 0,
          ricochetLeft: 0,
          life: 2.6,
          color: '#ffb703',
          trail: [],
          hitIds: new Set(),
        });
      }
    }

    if (this.cloneTimer > 0) {
      const perpX = -Math.sin(p.angle) * 46;
      const perpY = Math.cos(p.angle) * 46;
      for (const side of [-1, 1]) {
        this.bullets.push({
          x: p.x + perpX * side,
          y: p.y + perpY * side,
          vx: Math.cos(p.angle) * this.stats.projectileSpeed,
          vy: Math.sin(p.angle) * this.stats.projectileSpeed,
          radius: 4.5,
          damage: dmg * 0.75,
          isEnemy: false,
          pierceLeft: 0,
          ricochetLeft: 0,
          life: 1.4,
          color: this.theme.accent,
          trail: [],
          hitIds: new Set(),
        });
      }
    }

    if (!silent) {
      sound.playShoot(isCrit);
    }
  }

  private updateSpawning(dt: number, isTitle: boolean): void {
    if (this.coopRole === 'guest' || this.mode === 'pvp') return;
    if (this.waveSpawnRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.waveSpawnRemaining--;
        this.spawnTimer = Math.max(0.28, (this.wave === 1 ? 1.45 : this.wave === 2 ? 1.25 : 1.15) - this.wave * 0.05);
      }
    } else if (this.enemies.length === 0) {
      this.waveClearDelay += dt;
      if (this.waveClearDelay >= 1.2) {
        this.waveClearDelay = 0;
        this.startWave(this.wave + 1, isTitle);
      }
    }
  }

  private updateEnemies(dt: number, isTitle: boolean): void {
    const p = this.player;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 6);
      e.angle += e.spin * dt;

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      if (e.kind === 'swarmer' || e.kind === 'mini' || e.kind === 'splitter') {
        e.vx = dirX * e.speed;
        e.vy = dirY * e.speed;
      } else if (e.kind === 'bomber') {
        if (e.aimTimer > 0) {
          e.vx *= 0.8;
          e.vy *= 0.8;
          e.aimTimer -= dt;
          if (e.aimTimer <= 0) {
            // Detonate AoE blast
            const idx = this.enemies.indexOf(e);
            if (idx !== -1) this.enemies.splice(idx, 1);
            this.spawnShockwave(e.x, e.y, 115, '#ff7b00', 5);
            this.spawnParticles(e.x, e.y, 20, '#ff7b00', 260, 'shard');
            if (!isTitle) sound.playExplosion(1.2);
            if (!isTitle && p.invulnTimer <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < 115) {
              this.damagePlayer(22);
            }
            continue;
          }
        } else {
          e.vx = dirX * e.speed;
          e.vy = dirY * e.speed;
          if (dist < 78 && !isTitle) {
            e.aimTimer = 0.55;
          }
        }
      } else if (e.kind === 'shielder') {
        e.aimAngle = Math.atan2(dy, dx);
        e.vx = dirX * e.speed;
        e.vy = dirY * e.speed;
      } else if (e.kind === 'spawner') {
        const desired = 360;
        const push = dist > desired ? 1 : dist < desired - 70 ? -0.6 : 0;
        e.vx = dirX * e.speed * push;
        e.vy = dirY * e.speed * push;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && this.enemies.length < 48) {
          e.shootTimer = 3.2;
          this.spawnEnemy('mini');
        }
      } else if (e.kind === 'sniper') {
        if (e.aimTimer > 0) {
          e.vx *= 0.85;
          e.vy *= 0.85;
          e.aimTimer -= dt;
          e.aimAngle = Math.atan2(dy, dx);
          if (e.aimTimer <= 0) {
            this.bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(e.aimAngle) * 760,
              vy: Math.sin(e.aimAngle) * 760,
              radius: 5.5,
              damage: 18,
              isEnemy: true,
              pierceLeft: 0,
              ricochetLeft: 0,
              life: 2.2,
              color: '#ffb703',
              trail: [],
              hitIds: new Set(),
            });
            e.shootTimer = 2.6;
          }
        } else {
          const desired = 380;
          const push = dist > desired ? 1 : dist < desired - 80 ? -0.7 : 0;
          e.vx = dirX * e.speed * push;
          e.vy = dirY * e.speed * push;
          e.shootTimer -= dt;
          if (e.shootTimer <= 0 && dist < 720) {
            e.aimTimer = 0.95;
            e.aimAngle = Math.atan2(dy, dx);
          }
        }
      } else if (e.kind === 'warden') {
        const perpX = -dirY;
        const perpY = dirX;
        const radial = dist > 300 ? 0.8 : dist < 210 ? -0.6 : 0;
        e.vx = (dirX * radial + perpX * 0.85) * e.speed;
        e.vy = (dirY * radial + perpY * 0.85) * e.speed;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 2.0;
          const count = 6;
          for (let k = 0; k < count; k++) {
            const a = e.angle + (k * Math.PI * 2) / count;
            this.bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 280,
              vy: Math.sin(a) * 280,
              radius: 5,
              damage: 14,
              isEnemy: true,
              pierceLeft: 0,
              ricochetLeft: 0,
              life: 3.2,
              color: '#e0aaff',
              trail: [],
              hitIds: new Set(),
            });
          }
        }
      } else if (e.kind === 'boss') {
        e.phase = (e.phase || 0) + dt;
        const perpX = -dirY;
        const perpY = dirX;
        const radial = dist > 320 ? 1 : -0.3;
        e.vx = (dirX * radial + perpX * 0.65) * e.speed;
        e.vy = (dirY * radial + perpY * 0.65) * e.speed;

        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 0.72;
          const arms = 8;
          for (let k = 0; k < arms; k++) {
            const a = e.phase * 1.9 + (k * Math.PI * 2) / arms;
            this.bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 330,
              vy: Math.sin(a) * 330,
              radius: 6,
              damage: 16,
              isEnemy: true,
              pierceLeft: 0,
              ricochetLeft: 0,
              life: 3.5,
              color: '#ff0054',
              trail: [],
              hitIds: new Set(),
            });
          }
        }
      }

      e.x = Math.max(e.radius + 16, Math.min(this.arenaW - e.radius - 16, e.x + e.vx * dt));
      e.y = Math.max(e.radius + 16, Math.min(this.arenaH - e.radius - 16, e.y + e.vy * dt));

      if (!isTitle && p.invulnTimer <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius - 3) {
        const contactDmg = e.kind === 'boss' ? 24 : this.wave <= 2 ? 11 : 16;
        this.damagePlayer(contactDmg);
      }
    }
  }

  private updateBullets(dt: number, isTitle: boolean): void {
    const p = this.player;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.isHoming && !b.isEnemy) {
        const target = this.findNearestEnemy(b.x, b.y);
        if (target) {
          const desired = Math.atan2(target.y - b.y, target.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          const speed = Math.hypot(b.vx, b.vy);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const nextA = cur + Math.max(-dt * 7.5, Math.min(dt * 7.5, diff));
          b.vx = Math.cos(nextA) * speed;
          b.vy = Math.sin(nextA) * speed;
        }
      }

      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 6) b.trail.shift();

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      let bounced = false;
      if (b.x < 16 || b.x > this.arenaW - 16) {
        if (b.ricochetLeft > 0) {
          b.vx *= -1;
          b.x = Math.max(16, Math.min(this.arenaW - 16, b.x));
          b.ricochetLeft--;
          bounced = true;
        } else {
          this.bullets.splice(i, 1);
          continue;
        }
      }
      if (b.y < 16 || b.y > this.arenaH - 16) {
        if (b.ricochetLeft > 0) {
          b.vy *= -1;
          b.y = Math.max(16, Math.min(this.arenaH - 16, b.y));
          b.ricochetLeft--;
          bounced = true;
        } else {
          this.bullets.splice(i, 1);
          continue;
        }
      }
      if (bounced) {
        this.spawnParticles(b.x, b.y, 4, b.color, 130);
      }

      if (b.isEnemy) {
        if (!isTitle && p.invulnTimer <= 0 && Math.hypot(b.x - p.x, b.y - p.y) < b.radius + p.radius - 2) {
          this.damagePlayer(b.damage);
          this.bullets.splice(i, 1);
        }
        continue;
      }

      let consumed = false;
      if (!isTitle && this.mode === 'pvp' && this.remotePlayer.connected && !this.remotePlayer.down) {
        if (Math.hypot(b.x - this.remotePlayer.x, b.y - this.remotePlayer.y) < b.radius + 18) {
          this.callbacks.onPvpHit?.(b.damage);
          this.spawnParticles(b.x, b.y, 6, '#ff2a85', 180);
          this.bullets.splice(i, 1);
          continue;
        }
      }
      if (!isTitle && this.courier && Math.hypot(b.x - this.courier.x, b.y - this.courier.y) < b.radius + 22) {
        this.courier.hp -= b.damage;
        this.spawnParticles(b.x, b.y, 5, '#ffd166', 180);
        this.bullets.splice(i, 1);
        if (this.courier.hp <= 0) {
          this.bonusShards += 25;
          this.addFloatingText(this.courier.x, this.courier.y - 20, '+25 ✦ КУРЬЕР СБИТ!', '#ffd166', 1.25);
          this.spawnShockwave(this.courier.x, this.courier.y, 160, '#ffd166', 4);
          this.spawnParticles(this.courier.x, this.courier.y, 28, '#ffd166', 320, 'shard');
          sound.playExplosion(1.4);
          this.callbacks.onAchievement?.('ach_courier');
          this.courier = null;
        }
        continue;
      }
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (b.hitIds.has(e.id)) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.radius + e.radius) {
          b.hitIds.add(e.id);
          this.damageEnemy(e, b.damage, !isTitle, b.isCrit);

          if (this.stats.chainLightning > 0) {
            const range = this.stats.evoStorm ? 420 : 235;
            const mult = this.stats.evoStorm ? 0.85 : 0.55;
            this.triggerChainLightning(e, this.stats.chainLightning, b.damage * mult, !isTitle, range);
          }

          if (b.pierceLeft > 0) {
            b.pierceLeft--;
          } else {
            consumed = true;
            break;
          }
        }
      }
      if (consumed) {
        this.bullets.splice(i, 1);
      }
    }
  }

  private updatePowerUps(dt: number, isTitle: boolean): void {
    const p = this.player;
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.life -= dt;
      pu.pulse += dt * 5;
      if (pu.life <= 0) {
        this.powerups.splice(i, 1);
        continue;
      }
      if (!isTitle && Math.hypot(p.x - pu.x, p.y - pu.y) < p.radius + 20) {
        this.powerups.splice(i, 1);
        sound.playLevelUp();
        if (pu.kind === 'heal') {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          this.addFloatingText(p.x, p.y - 28, 'РЕМОНТ +25', '#00ff87', 1.1);
          this.spawnShockwave(p.x, p.y, 110, '#00ff87', 3);
        } else if (pu.kind === 'magnet') {
          for (const o of this.orbs) o.magnetized = true;
          this.addFloatingText(p.x, p.y - 28, 'ГИПЕР-МАГНИТ!', '#00f5ff', 1.15);
          this.spawnShockwave(p.x, p.y, 140, '#00f5ff', 3);
        } else if (pu.kind === 'overclock') {
          p.overclockTimer = 6.5;
          this.addFloatingText(p.x, p.y - 28, 'ПЕРЕГРУЗКА x2!', '#ffb703', 1.2);
          this.spawnShockwave(p.x, p.y, 140, '#ffb703', 3);
        }
      }
    }
  }

  private triggerChainLightning(source: Enemy, jumps: number, dmg: number, allowAudio: boolean, maxRange = 235): void {
    let current: Enemy = source;
    const visited = new Set<number>([source.id]);

    for (let k = 0; k < jumps; k++) {
      let best: Enemy | null = null;
      let bestDist = maxRange;
      for (const candidate of this.enemies) {
        if (visited.has(candidate.id)) continue;
        const d = Math.hypot(candidate.x - current.x, candidate.y - current.y);
        if (d < bestDist) {
          bestDist = d;
          best = candidate;
        }
      }
      if (!best) break;
      visited.add(best.id);

      const pts: Array<{ x: number; y: number }> = [{ x: current.x, y: current.y }];
      const segs = 4;
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        pts.push({
          x: current.x + (best.x - current.x) * t + (Math.random() - 0.5) * 26,
          y: current.y + (best.y - current.y) * t + (Math.random() - 0.5) * 26,
        });
      }
      pts.push({ x: best.x, y: best.y });
      this.arcs.push({ points: pts, color: '#70e0ff', life: 0.16, maxLife: 0.16 });

      this.damageEnemy(best, dmg, allowAudio, false);
      current = best;
    }
  }

  private damageEnemy(e: Enemy, amount: number, allowAudio: boolean, isCrit = false): void {
    e.hp -= amount;
    e.hitFlash = 1;
    this.spawnParticles(e.x, e.y, isCrit ? 7 : 3, e.color, 160);

    if (allowAudio) {
      sound.playHit(this.combo);
    }

    if (isCrit && this.state === 'playing') {
      this.addFloatingText(
        e.x + (Math.random() - 0.5) * 16,
        e.y - e.radius,
        `${Math.round(amount)}!`,
        this.theme.accent,
        1.05
      );
    }

    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx !== -1) this.enemies.splice(idx, 1);

      const isBoss = e.kind === 'boss';
      this.kills++;
      this.combo++;
      this.comboTimer = 3.2;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      if (this.combo >= 40 && this.state === 'playing') {
        this.callbacks.onAchievement?.('ach_combo50');
      }

      const mult = Math.min(8, 1 + Math.floor(this.combo / 5));
      this.score += e.scoreValue * mult;
      this.player.novaCharge = Math.min(100, this.player.novaCharge + (isBoss ? 50 : 4));

      if (this.stats.vampiricChance > 0 && Math.random() < this.stats.vampiricChance) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 4);
      }

      if (allowAudio) {
        sound.playExplosion(isBoss ? 2.2 : e.kind === 'splitter' ? 1.3 : 0.9);
      }
      this.addShake(isBoss ? 20 : e.kind === 'splitter' ? 6 : 3);
      if (isBoss) {
        this.hitStop = 0.08;
        this.slowMoTimer = 0.55;
        this.bossActive = false;
        this.addFloatingText(e.x, e.y - 50, 'БОСС УНИЧТОЖЕН!', '#ffb703', 1.4);
        if (!this.bossDamagedPlayer && this.state === 'playing') {
          this.callbacks.onAchievement?.('ach_no_hit_boss');
        }
        if (this.mode === 'classic' && this.wave >= 10 && !this.inAbyss && this.state === 'playing') {
          this.callbacks.onAchievement?.('ach_first_win');
          this.state = 'paused';
          this.pushHud();
          this.callbacks.onAbyssChoice?.();
          return;
        }
      }

      this.spawnParticles(e.x, e.y, isBoss ? 55 : 18, e.color, isBoss ? 420 : 240, 'shard');
      this.spawnShockwave(e.x, e.y, isBoss ? 280 : 65, e.color, isBoss ? 6 : 2.5);

      // Chance to drop bonus PowerUp
      if (this.state === 'playing' && (isBoss || Math.random() < 0.045)) {
        const kinds: PowerUpKind[] = ['heal', 'magnet', 'overclock'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        this.powerups.push({ x: e.x, y: e.y, kind, life: 14, pulse: 0 });
      }

      if (e.kind === 'splitter') {
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI * 2) / 3 + Math.random() * 0.4;
          this.enemies.push({
            id: this.nextEnemyId++,
            kind: 'mini',
            x: e.x + Math.cos(a) * 18,
            y: e.y + Math.sin(a) * 18,
            vx: Math.cos(a) * 200,
            vy: Math.sin(a) * 200,
            angle: a,
            radius: 10,
            hp: 18 * (1 + (this.wave - 1) * 0.22),
            maxHp: 18 * (1 + (this.wave - 1) * 0.22),
            speed: 235,
            color: '#ff70a6',
            xpValue: 7,
            scoreValue: 65,
            shootTimer: 2,
            aimTimer: 0,
            aimAngle: 0,
            hitFlash: 0,
            spin: 4,
          });
        }
      }

      const orbCount = isBoss ? 12 : e.kind === 'warden' ? 3 : 1;
      for (let o = 0; o < orbCount; o++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 110;
        this.orbs.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          value: Math.ceil(e.xpValue / orbCount),
          color: this.theme.primary,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  private updateArenaEvents(dt: number): void {
    this.eventTimer -= dt;
    if (this.eventTimer <= 0 && this.wave >= 2) {
      this.eventTimer = 38 + Math.random() * 18;
      const roll = Math.random();
      if (roll < 0.36) {
        const a = Math.random() * Math.PI * 2;
        this.courier = {
          x: this.player.x + Math.cos(a) * 520,
          y: this.player.y + Math.sin(a) * 520,
          vx: -Math.cos(a) * 185 + (Math.random() - 0.5) * 90,
          vy: -Math.sin(a) * 185 + (Math.random() - 0.5) * 90,
          hp: 90 + this.wave * 20,
          maxHp: 90 + this.wave * 20,
          life: 10,
        };
        this.callbacks.onWaveBanner('ЗОЛОТОЙ КУРЬЕР', 'СБЕЙ ЕГО ЗА 10 СЕК ДЛЯ +25 ✦');
      } else if (roll < 0.72) {
        this.powerZone = {
          x: Math.max(200, Math.min(this.arenaW - 200, this.player.x + (Math.random() - 0.5) * 320)),
          y: Math.max(200, Math.min(this.arenaH - 200, this.player.y + (Math.random() - 0.5) * 320)),
          radius: 135,
          life: 12,
        };
        this.callbacks.onWaveBanner('ЗОНА УСИЛЕНИЯ', 'ВСТАНЬ В КРУГ ДЛЯ 2x УРОНА');
      } else {
        for (let m = 0; m < 5; m++) {
          this.meteors.push({
            x: this.player.x + (Math.random() - 0.5) * 460,
            y: this.player.y + (Math.random() - 0.5) * 460,
            timer: 1.3 + m * 0.25,
            radius: 95,
          });
        }
        this.callbacks.onWaveBanner('МЕТЕОРНЫЙ ШТОРМ', 'УКЛОНЯЙСЯ ОТ КРАСНЫХ ЗОН!');
      }
    }

    if (this.powerZone) {
      this.powerZone.life -= dt;
      if (this.powerZone.life <= 0) this.powerZone = null;
    }

    if (this.courier) {
      this.courier.life -= dt;
      this.courier.x += this.courier.vx * dt;
      this.courier.y += this.courier.vy * dt;
      if (this.courier.life <= 0) this.courier = null;
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.timer -= dt;
      if (m.timer <= 0) {
        this.meteors.splice(i, 1);
        this.spawnShockwave(m.x, m.y, m.radius, '#ff5400', 5);
        this.spawnParticles(m.x, m.y, 18, '#ff7b00', 250, 'shard');
        sound.playExplosion(1.1);
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (Math.hypot(e.x - m.x, e.y - m.y) <= m.radius + e.radius) {
            this.damageEnemy(e, 140 + this.wave * 15, false);
          }
        }
        if (this.player.invulnTimer <= 0 && Math.hypot(this.player.x - m.x, this.player.y - m.y) < m.radius) {
          this.damagePlayer(18);
        }
      }
    }
  }

  private damagePlayer(amount: number): void {
    const p = this.player;

    if (p.shieldReady) {
      p.shieldReady = false;
      p.shieldTimer = this.stats.aegisShieldCooldown;
      p.invulnTimer = 0.7;
      sound.playDash();
    this.vibrate(20);
      this.spawnShockwave(p.x, p.y, 170, '#70e0ff', 4);
      this.addFloatingText(p.x, p.y - 30, 'ЩИТ ОТРАЗИЛ УДАР!', '#70e0ff', 1.1);
      return;
    }

    p.hp -= amount;
    if (this.bossActive) this.bossDamagedPlayer = true;
    p.invulnTimer = 0.85;
    this.combo = 0;
    sound.playDamage();
    this.vibrate(45);
    this.addShake(12);
    this.spawnShockwave(p.x, p.y, 130, '#ff2a54', 4);
    this.spawnParticles(p.x, p.y, 16, '#ff2a54', 240);

    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'gameover';
      this.pushHud();
      const rawShards = Math.max(5, Math.floor(this.kills * 0.45 + this.wave * 6)) + this.bonusShards;
      const shards = Math.round(rawShards * this.greedMult);
      this.callbacks.onGameOver({
        score: this.score,
        wave: this.wave,
        kills: this.kills,
        maxCombo: this.maxCombo,
        shards,
        victory: false,
        mode: this.mode,
        upgrades: { ...this.acquiredUpgrades },
      });
    }
  }

  private updateOrbs(dt: number): void {
    const p = this.player;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.pulse += dt * 6;
      o.vx *= 0.92;
      o.vy *= 0.92;

      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (o.magnetized || dist < this.stats.pickupRadius) {
        const pull = o.magnetized ? 980 : 600 * (1 - dist / (this.stats.pickupRadius * 1.25));
        o.vx += (dx / dist) * pull * dt * 8;
        o.vy += (dy / dist) * pull * dt * 8;
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      if (dist < p.radius + 16) {
        this.orbs.splice(i, 1);
        if (this.state === 'playing') {
          sound.playPickup();
          const xpMult = (this.mode === 'blitz' ? 1.6 : 1) * this.xpBuffMult;
          p.xp += Math.ceil(o.value * xpMult);
          p.novaCharge = Math.min(100, p.novaCharge + 1.6);
          if (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = Math.floor(p.xpToNext * 1.28 + 25);
            this.triggerLevelUp();
          }
        }
      }
    }
  }

  private triggerLevelUp(): void {
    const available = UPGRADES.filter((u) => {
      if ((this.acquiredUpgrades[u.id] || 0) >= u.maxStacks) return false;
      if (u.requires) {
        return (this.acquiredUpgrades[u.requires[0]] || 0) > 0 && (this.acquiredUpgrades[u.requires[1]] || 0) > 0;
      }
      return true;
    });
    if (available.length === 0) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
      return;
    }

    const evos = available.filter((u) => u.rarity === 'evolution');
    const regulars = available.filter((u) => u.rarity !== 'evolution').sort(() => Math.random() - 0.5);
    const choices = [...evos, ...regulars].slice(0, Math.min(3, available.length));
    this.state = 'levelup';
    sound.playLevelUp();
    this.vibrate(30);
    this.pushHud();
    this.callbacks.onLevelUp(choices, { ...this.acquiredUpgrades });
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.vx *= pt.drag;
      pt.vy *= pt.drag;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.angle !== undefined && pt.spin !== undefined) {
        pt.angle += pt.spin * dt;
      }
      pt.alpha = pt.life / pt.maxLife;
    }

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += (s.maxRadius - s.radius) * Math.min(1, dt * 11);
      s.alpha -= dt * 2.4;
      if (s.alpha <= 0) this.shockwaves.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    if (this.shakeMag > 0) {
      this.shakeMag = Math.max(0, this.shakeMag - dt * 38);
    }
  }

  private updateCamera(dt: number, isTitle: boolean): void {
    let targetX = this.player.x;
    let targetY = this.player.y;

    if (!isTitle && !this.isTouchDevice) {
      const lookX = (this.mouseScreenX - this.width / 2) * 0.14;
      const lookY = (this.mouseScreenY - this.height / 2) * 0.14;
      targetX += lookX;
      targetY += lookY;
    }

    this.camX += (targetX - this.camX) * Math.min(1, dt * 8);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 8);
  }

  private addFloatingText(x: number, y: number, text: string, color: string, scale = 1): void {
    this.texts.push({ x, y, vy: -58, text, color, life: 0.9, maxLife: 0.9, scale });
  }

  private spawnParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    maxSpeed: number,
    shape: 'circle' | 'shard' = 'circle'
  ): void {
    if (this.particles.length > 450) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * maxSpeed;
      const life = 0.25 + Math.random() * 0.45;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: shape === 'shard' ? 3 + Math.random() * 4 : 2 + Math.random() * 3,
        color,
        alpha: 1,
        life,
        maxLife: life,
        drag: 0.93,
        shape,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  private spawnShockwave(x: number, y: number, maxRadius: number, color: string, lineWidth: number): void {
    this.shockwaves.push({
      x,
      y,
      radius: 12,
      maxRadius,
      color,
      alpha: 0.9,
      lineWidth,
    });
  }

  private addShake(mag: number): void {
    if (!this.settings.screenShake) return;
    this.shakeMag = Math.min(26, Math.max(this.shakeMag, mag));
  }

  private findNearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private pushHud(): void {
    const boss = this.enemies.find((e) => e.kind === 'boss') || null;
    this.callbacks.onHudUpdate({
      state: this.state,
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      xp: this.player.xp,
      xpToNext: this.player.xpToNext,
      level: this.player.level,
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      combo: this.combo,
      maxCombo: this.maxCombo,
      comboTimer: this.comboTimer,
      novaCharge: Math.floor(this.player.novaCharge),
      dashReadyRatio:
        this.player.dashTimer <= 0 ? 1 : Math.max(0, 1 - this.player.dashTimer / this.stats.dashCooldown),
      overclockTimer: this.player.overclockTimer,
      shieldReady: this.player.shieldReady,
      mode: this.mode,
      blitzTimer: Math.max(0, Math.ceil(this.blitzTimer)),
      boss: boss ? { name: 'МОНОЛИТ ПУСТОТЫ', hp: Math.max(0, Math.ceil(boss.hp)), maxHp: boss.maxHp } : null,
      acquiredUpgrades: { ...this.acquiredUpgrades },
    });
  }

  // ==================== RENDERING ====================
  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const bgGrad = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      80,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.85
    );
    bgGrad.addColorStop(0, this.theme.bgInner);
    bgGrad.addColorStop(1, this.theme.bgOuter);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    const shakeX = (Math.random() - 0.5) * this.shakeMag;
    const shakeY = (Math.random() - 0.5) * this.shakeMag;
    const offsetX = this.width / 2 - this.camX + shakeX;
    const offsetY = this.height / 2 - this.camY + shakeY;

    for (const s of this.stars) {
      const sx = (s.x - this.camX * s.depth + this.width * 2) % this.width;
      const sy = (s.y - this.camY * s.depth + this.height * 2) % this.height;
      const alpha = 0.35 + 0.45 * Math.sin(this.time * 2.2 + s.twinkle);
      ctx.fillStyle = `rgba(220, 240, 255, ${alpha.toFixed(2)})`;
      ctx.fillRect(sx, sy, s.size, s.size);
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const nebColors = [this.theme.primary, this.theme.secondary, this.theme.accent];
    for (const n of this.nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.radius);
      g.addColorStop(0, this.hexToRgba(nebColors[n.colorIdx], 0.13));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    this.renderGrid(ctx);

    ctx.strokeStyle = this.theme.primary;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, this.arenaW - 32, this.arenaH - 32);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // XP Orbs
    for (const o of this.orbs) {
      const r = 4.5 + Math.sin(o.pulse) * 1.4;
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arena Events Render
    if (this.powerZone) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.75)';
      ctx.fillStyle = 'rgba(255, 183, 3, 0.1)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 8]);
      ctx.beginPath();
      ctx.arc(this.powerZone.x, this.powerZone.y, this.powerZone.radius, this.time * 2, this.time * 2 + Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const m of this.meteors) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 60, 0, 0.8)';
      ctx.fillStyle = 'rgba(255, 60, 0, 0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.courier) {
      ctx.save();
      ctx.translate(this.courier.x, this.courier.y);
      ctx.rotate(this.time * 4);
      ctx.strokeStyle = '#ffd166';
      ctx.fillStyle = 'rgba(255, 209, 102, 0.32)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        if (i === 0) ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
        else ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // PowerUps
    for (const pu of this.powerups) {
      const col = pu.kind === 'heal' ? '#00ff87' : pu.kind === 'magnet' ? '#00f5ff' : '#ffb703';
      const r = 13 + Math.sin(pu.pulse) * 2.5;
      ctx.strokeStyle = col;
      ctx.fillStyle = this.hexToRgba(col, 0.25);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px "Exo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pu.kind === 'heal' ? '+' : pu.kind === 'magnet' ? 'M' : '⚡', pu.x, pu.y + 1);
    }

    for (const s of this.shockwaves) {
      ctx.strokeStyle = this.hexToRgba(s.color, Math.max(0, s.alpha));
      ctx.lineWidth = s.lineWidth;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const arc of this.arcs) {
      ctx.strokeStyle = this.hexToRgba(arc.color, arc.life / arc.maxLife);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      arc.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }

    for (const pt of this.particles) {
      ctx.fillStyle = this.hexToRgba(pt.color, pt.alpha);
      if (pt.shape === 'shard') {
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.angle || 0);
        ctx.fillRect(-pt.size, -pt.size * 0.4, pt.size * 2, pt.size * 0.8);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.settings.bloomEnabled) {
      ctx.shadowBlur = 12;
    }
    for (const b of this.bullets) {
      ctx.shadowColor = b.color;
      ctx.strokeStyle = this.hexToRgba(b.color, 0.45);
      ctx.lineWidth = b.radius * 1.3;
      if (b.trail.length > 1) {
        ctx.beginPath();
        b.trail.forEach((t, idx) => {
          if (idx === 0) ctx.moveTo(t.x, t.y);
          else ctx.lineTo(t.x, t.y);
        });
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (const e of this.enemies) {
      this.renderEnemy(ctx, e);
    }

    if (this.beamTimer > 0) {
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.rotate(this.player.angle);
      ctx.fillStyle = this.hexToRgba(this.theme.primary, 0.32);
      ctx.fillRect(16, -24, 900, 48);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, -7, 900, 14);
      ctx.restore();
    }

    if (this.ramTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#ffb703';
      ctx.fillStyle = 'rgba(255, 183, 3, 0.18)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.cloneTimer > 0) {
      const perpX = -Math.sin(this.player.angle) * 46;
      const perpY = Math.cos(this.player.angle) * 46;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(this.player.x + perpX * side, this.player.y + perpY * side);
        ctx.rotate(this.player.angle);
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = 2;
        this.traceShipPath(ctx, 13);
        ctx.stroke();
        ctx.restore();
      }
    }

    this.renderPlayer(ctx);
    if (this.coopRole !== 'none' && this.remotePlayer.connected) {
      this.renderRemotePlayer(ctx);
    }

    ctx.restore(); // end lighter

    // Enemy HP bars
    for (const e of this.enemies) {
      if (e.kind !== 'boss' && e.hp < e.maxHp) {
        const w = e.radius * 2;
        const h = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w, h);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w * Math.max(0, e.hp / e.maxHp), h);
      }
    }

    ctx.textAlign = 'center';
    ctx.font = '700 14px "Exo 2", sans-serif';
    for (const t of this.texts) {
      const alpha = Math.min(1, t.life / t.maxLife);
      ctx.fillStyle = this.hexToRgba(t.color, alpha);
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.restore(); // back to screen space

    // Low HP red danger vignette
    if (this.state === 'playing' && this.player.hp / this.player.maxHp < 0.35) {
      const pulse = 0.16 + 0.12 * Math.sin(this.time * 8);
      const vig = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        this.height * 0.3,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.72
      );
      vig.addColorStop(0, 'rgba(255, 0, 50, 0)');
      vig.addColorStop(1, `rgba(255, 20, 60, ${pulse.toFixed(2)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Tactical Minimap during gameplay
    if (this.state === 'playing') {
      this.renderMinimap(ctx);
    }

    ctx.restore();
  }

  private renderMinimap(ctx: CanvasRenderingContext2D): void {
    const mw = this.isTouchDevice ? 76 : 96;
    const mh = this.isTouchDevice ? 57 : 72;
    const mx = 14;
    const my = this.height - mh - 16;

    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 24, 0.65)';
    ctx.strokeStyle = this.hexToRgba(this.theme.primary, 0.35);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 8);
    ctx.fill();
    ctx.stroke();

    const sx = mw / this.arenaW;
    const sy = mh / this.arenaH;

    for (const e of this.enemies) {
      ctx.fillStyle = e.kind === 'boss' ? '#ff0054' : '#ff70a6';
      const r = e.kind === 'boss' ? 3.5 : 1.6;
      ctx.beginPath();
      ctx.arc(mx + e.x * sx, my + e.y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = this.theme.primary;
    ctx.beginPath();
    ctx.arc(mx + this.player.x * sx, my + this.player.y * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const step = 90;
    const startX = Math.max(0, Math.floor((this.camX - this.width / 2) / step) * step);
    const endX = Math.min(this.arenaW, this.camX + this.width / 2 + step);
    const startY = Math.max(0, Math.floor((this.camY - this.height / 2) / step) * step);
    const endY = Math.min(this.arenaH, this.camY + this.height / 2 + step);

    ctx.strokeStyle = this.theme.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;

    for (const tr of p.wingLeftTrail) {
      ctx.fillStyle = this.hexToRgba(this.theme.accent, tr.alpha * 0.45);
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 2.2 * tr.alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const tr of p.wingRightTrail) {
      ctx.fillStyle = this.hexToRgba(this.theme.accent, tr.alpha * 0.45);
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 2.2 * tr.alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const tr of p.trail) {
      ctx.fillStyle = this.hexToRgba(this.theme.primary, tr.alpha * 0.6);
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 4.5 * tr.alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const img of p.afterimages) {
      ctx.save();
      ctx.translate(img.x, img.y);
      ctx.rotate(img.angle);
      ctx.strokeStyle = this.hexToRgba(this.theme.accent, img.alpha);
      ctx.lineWidth = 2;
      this.traceShipPath(ctx, p.radius);
      ctx.stroke();
      ctx.restore();
    }

    if (p.shieldReady) {
      ctx.save();
      ctx.strokeStyle = 'rgba(112, 224, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 11 + Math.sin(this.time * 5) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.stats.evoVortex) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.55)';
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 10]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 84, this.time * 4, this.time * 4 + Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.stats.orbitalBlades > 0) {
      const orbitR = 66;
      for (let b = 0; b < this.stats.orbitalBlades; b++) {
        const a = p.bladeAngle + (b * Math.PI * 2) / this.stats.orbitalBlades;
        const bx = p.x + Math.cos(a) * orbitR;
        const by = p.y + Math.sin(a) * orbitR;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = this.theme.accent;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    if (p.invulnTimer > 0 && Math.floor(this.time * 20) % 2 === 0 && p.dashDuration <= 0) {
      ctx.globalAlpha = 0.45;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (this.settings.bloomEnabled) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = p.overclockTimer > 0 ? '#ffb703' : this.theme.primary;
    }
    ctx.strokeStyle = p.overclockTimer > 0 ? '#ffb703' : this.theme.primary;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2.6;
    this.traceShipPath(ctx, p.radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private renderRemotePlayer(ctx: CanvasRenderingContext2D): void {
    const r = this.remotePlayer;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.save();
    ctx.rotate(r.angle);
    ctx.strokeStyle = r.down ? '#ff2a54' : r.color;
    ctx.fillStyle = this.hexToRgba(r.color, r.down ? 0.08 : 0.22);
    ctx.lineWidth = 2.4;
    this.traceShipPath(ctx, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Callsign nameplate & HP bar
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.callsign, 0, -28);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-18, -22, 36, 4);
    ctx.fillStyle = r.color;
    ctx.fillRect(-18, -22, 36 * Math.max(0, r.hp / Math.max(1, r.maxHp)), 4);
    ctx.restore();
  }

  private traceShipPath(ctx: CanvasRenderingContext2D, r: number): void {
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(-r * 0.9, -r * 0.85);
    ctx.lineTo(-r * 0.45, 0);
    ctx.lineTo(-r * 0.9, r * 0.85);
    ctx.closePath();
  }

  private renderEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const col = e.hitFlash > 0.2 ? '#ffffff' : e.color;

    if (e.kind === 'sniper' && e.aimTimer > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 183, 3, ${0.3 + (1 - e.aimTimer) * 0.65})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.aimAngle) * 850, e.y + Math.sin(e.aimAngle) * 850);
      ctx.stroke();
      ctx.restore();
    }

    if (e.kind === 'bomber' && e.aimTimer > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 123, 0, ${0.4 + Math.sin(this.time * 28) * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 115, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (e.kind === 'shielder') {
      ctx.save();
      ctx.strokeStyle = '#70e0ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 7, e.aimAngle - 0.9, e.aimAngle + 0.9);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    if (this.settings.bloomEnabled) {
      ctx.shadowBlur = e.kind === 'boss' ? 24 : 12;
      ctx.shadowColor = e.color;
    }
    ctx.strokeStyle = col;
    ctx.fillStyle = this.hexToRgba(col, 0.16);
    ctx.lineWidth = e.kind === 'boss' ? 3.5 : 2.2;

    const sides =
      e.kind === 'swarmer' || e.kind === 'mini'
        ? 3
        : e.kind === 'sniper' || e.kind === 'bomber'
        ? 4
        : e.kind === 'splitter' || e.kind === 'spawner'
        ? 6
        : 8;

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i * Math.PI * 2) / sides;
      const rx = Math.cos(a) * e.radius;
      const ry = Math.sin(a) * e.radius;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (e.kind === 'spawner') {
      ctx.fillStyle = '#00ff87';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (e.kind === 'boss') {
      ctx.rotate(-e.angle * 2);
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 1.4);
      ctx.stroke();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return `rgba(0, 245, 255, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
}
