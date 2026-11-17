import { sound } from './audio';
import { THEMES } from './themes';
import { UPGRADES } from './upgrades';
import {
  Bullet,
  Enemy,
  EnemyKind,
  FloatingText,
  GameSettings,
  GameState,
  LightningArc,
  Particle,
  Player,
  PlayerStats,
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
    upgrades: Record<string, number>;
  }) => void;
  onWaveBanner: (title: string, subtitle: string) => void;
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
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchAimActive = false;
  private touchAimX = 0;
  private touchAimY = 0;

  private rafId = 0;
  private lastTs = 0;
  private hudSyncTimer = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not initialize 2D context');
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.initBackdrop();
    this.resetRun(true);
    this.resize();
  }

  private initBackdrop(): void {
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.random() * this.arenaW,
        y: Math.random() * this.arenaH,
        size: 0.8 + Math.random() * 2.1,
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
    this.callbacks.onWaveBanner('WAVE 01', 'SECTOR BREACH DETECTED');
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
    if (Math.abs(this.touchMoveX) > 0.1 || Math.abs(this.touchMoveY) > 0.1) {
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
    this.player.dashDuration = 0.16;
    this.player.dashTimer = this.stats.dashCooldown;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.24);
    sound.playDash();

    this.spawnShockwave(this.player.x, this.player.y, 90, this.theme.primary, 3);
    if (this.stats.phantomDash) {
      this.phantomBlast(this.player.x, this.player.y);
    }
  }

  public triggerNova(): void {
    if (this.state !== 'playing') return;
    if (this.player.novaCharge < 100) return;

    this.player.novaCharge = 0;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.8);
    sound.playNova();
    this.addShake(18);
    this.hitStop = 0.06;

    this.spawnShockwave(this.player.x, this.player.y, 680, this.theme.primary, 8);
    this.spawnShockwave(this.player.x, this.player.y, 520, this.theme.accent, 5);

    // Vaporize enemy bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (this.bullets[i].isEnemy) {
        this.spawnParticles(this.bullets[i].x, this.bullets[i].y, 4, this.theme.accent, 140);
        this.bullets.splice(i, 1);
      }
    }

    // Blast all enemies within radius
    const novaRadius = 680;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (dist <= novaRadius) {
        const dmg = 160 + this.wave * 18;
        this.damageEnemy(e, dmg, true);
      }
    }

    this.texts.push({
      x: this.player.x,
      y: this.player.y - 40,
      vy: -60,
      text: 'AETHER NOVA!',
      color: this.theme.primary,
      life: 1.0,
      maxLife: 1.0,
      scale: 1.35,
    });
    this.pushHud();
  }

  private phantomBlast(x: number, y: number): void {
    const r = 190;
    this.spawnShockwave(x, y, r, this.theme.accent, 4);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - x, e.y - y) <= r + e.radius) {
        this.damageEnemy(e, 55 + this.stats.damage * 1.4, true);
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
    }

    this.state = 'playing';
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.7);
    this.spawnShockwave(this.player.x, this.player.y, 180, this.theme.primary, 4);
    this.pushHud();
  }

  private resetRun(attractMode: boolean): void {
    this.stats = {
      moveSpeed: 370,
      fireRate: 6.2,
      damage: 24,
      projectileSpeed: 980,
      projectiles: 1,
      spreadAngle: 0,
      pierce: 0,
      ricochet: 0,
      chainLightning: 0,
      homingMissiles: 0,
      orbitalBlades: 0,
      dashCooldown: 1.35,
      phantomDash: false,
      vampiricChance: 0,
      pickupRadius: 150,
      critChance: 0.1,
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
      xpToNext: 70,
      level: 1,
      dashTimer: 0,
      dashDuration: 0,
      dashDirX: 1,
      dashDirY: 0,
      invulnTimer: 0,
      novaCharge: 50,
      fireCooldown: 0,
      shotCounter: 0,
      trail: [],
      afterimages: [],
      bladeAngle: 0,
    };

    this.acquiredUpgrades = {};
    this.bullets = [];
    this.enemies = [];
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
    this.camX = this.player.x;
    this.camY = this.player.y;

    this.startWave(1, attractMode);
  }

  private startWave(waveNum: number, attractMode = false): void {
    this.wave = waveNum;
    this.bossActive = waveNum % 5 === 0;
    this.waveSpawnRemaining = this.bossActive ? 6 + waveNum : 8 + waveNum * 4;
    this.spawnTimer = 0.4;

    if (this.bossActive && !attractMode) {
      sound.playBossWarning();
      this.callbacks.onWaveBanner(`WAVE ${String(waveNum).padStart(2, '0')} — BOSS`, 'THE MONOLITH APPROACHES');
      this.spawnEnemy('boss');
    } else if (!attractMode && waveNum > 1) {
      this.callbacks.onWaveBanner(`WAVE ${String(waveNum).padStart(2, '0')}`, 'HOSTILE SIGNATURE ESCALATING');
    }
  }

  private spawnEnemy(forcedKind?: EnemyKind): void {
    // Spawn around player at safe distance inside arena
    const angle = Math.random() * Math.PI * 2;
    const dist = 480 + Math.random() * 240;
    const x = Math.max(60, Math.min(this.arenaW - 60, this.player.x + Math.cos(angle) * dist));
    const y = Math.max(60, Math.min(this.arenaH - 60, this.player.y + Math.sin(angle) * dist));

    let kind: EnemyKind = forcedKind ?? 'swarmer';
    if (!forcedKind) {
      const r = Math.random();
      if (this.wave >= 4 && r < 0.16) kind = 'warden';
      else if (this.wave >= 3 && r < 0.34) kind = 'sniper';
      else if (this.wave >= 2 && r < 0.56) kind = 'splitter';
      else kind = 'swarmer';
    }

    const hpScale = 1 + (this.wave - 1) * 0.22;
    let radius = 15;
    let hp = 32 * hpScale;
    let speed = 175 + Math.min(110, this.wave * 6);
    let color = '#00f5ff';
    let xpValue = 12;
    let scoreValue = 100;

    if (kind === 'splitter') {
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
      hp = 950 * hpScale;
      speed = 92;
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

    const isTitle = this.state === 'title';

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    this.updatePlayer(dt, isTitle);
    this.updateSpawning(dt, isTitle);
    this.updateEnemies(dt, isTitle);
    this.updateBullets(dt, isTitle);
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

    let moveX = 0;
    let moveY = 0;

    if (isTitle) {
      // Autonomous attract-mode AI
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
        if (p.fireCooldown <= 0) {
          this.fireWeapon(true);
        }
      } else {
        p.angle = Math.atan2(moveY, moveX);
      }
      p.hp = p.maxHp;
    } else {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

      if (Math.abs(this.touchMoveX) > 0.05 || Math.abs(this.touchMoveY) > 0.05) {
        moveX = this.touchMoveX;
        moveY = this.touchMoveY;
      }

      const len = Math.hypot(moveX, moveY);
      if (len > 1) {
        moveX /= len;
        moveY /= len;
      }

      if (this.touchAimActive) {
        p.angle = Math.atan2(this.touchAimY, this.touchAimX);
      } else {
        const worldMouseX = this.mouseScreenX + this.camX - this.width / 2;
        const worldMouseY = this.mouseScreenY + this.camY - this.height / 2;
        p.angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
      }

      const wantsFire = this.settings.autoFire || this.mouseDown || this.touchAimActive;
      if (wantsFire && p.fireCooldown <= 0) {
        this.fireWeapon(false);
      }
    }

    if (p.dashDuration > 0) {
      p.dashDuration -= dt;
      const dashSpeed = this.stats.moveSpeed * 3.1;
      p.vx = p.dashDirX * dashSpeed;
      p.vy = p.dashDirY * dashSpeed;
      p.afterimages.push({ x: p.x, y: p.y, angle: p.angle, alpha: 0.7 });
    } else {
      const accel = 14;
      const targetVx = moveX * this.stats.moveSpeed;
      const targetVy = moveY * this.stats.moveSpeed;
      p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
      p.vy += (targetVy - p.vy) * Math.min(1, accel * dt);
    }

    p.x = Math.max(p.radius + 16, Math.min(this.arenaW - p.radius - 16, p.x + p.vx * dt));
    p.y = Math.max(p.radius + 16, Math.min(this.arenaH - p.radius - 16, p.y + p.vy * dt));

    // Engine trail
    if (Math.hypot(p.vx, p.vy) > 40) {
      p.trail.push({
        x: p.x - Math.cos(p.angle) * 14,
        y: p.y - Math.sin(p.angle) * 14,
        alpha: 0.85,
      });
    }
    for (let i = p.trail.length - 1; i >= 0; i--) {
      p.trail[i].alpha -= dt * 3.2;
      if (p.trail[i].alpha <= 0) p.trail.splice(i, 1);
    }
    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].alpha -= dt * 3.5;
      if (p.afterimages[i].alpha <= 0) p.afterimages.splice(i, 1);
    }

    // Orbital blades collision
    if (this.stats.orbitalBlades > 0) {
      const orbitR = 64;
      for (let b = 0; b < this.stats.orbitalBlades; b++) {
        const a = p.bladeAngle + (b * Math.PI * 2) / this.stats.orbitalBlades;
        const bx = p.x + Math.cos(a) * orbitR;
        const by = p.y + Math.sin(a) * orbitR;

        // Destroy enemy bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
          const bul = this.bullets[i];
          if (bul.isEnemy && Math.hypot(bul.x - bx, bul.y - by) < 18) {
            this.spawnParticles(bul.x, bul.y, 4, this.theme.primary, 120);
            this.bullets.splice(i, 1);
          }
        }
        // Slice enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (Math.hypot(e.x - bx, e.y - by) < e.radius + 14) {
            this.damageEnemy(e, this.stats.damage * 0.45 * dt * 15, false);
          }
        }
      }
    }
  }

  private fireWeapon(silent: boolean): void {
    const p = this.player;
    p.fireCooldown = 1 / this.stats.fireRate;
    p.shotCounter++;

    const count = this.stats.projectiles;
    const isCrit = Math.random() < this.stats.critChance;
    const dmg = this.stats.damage * (isCrit ? 2.2 : 1);

    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * (this.stats.spreadAngle / Math.max(1, count - 1));
      const a = p.angle + offset;
      const muzzleX = p.x + Math.cos(a) * 20;
      const muzzleY = p.y + Math.sin(a) * 20;

      this.bullets.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(a) * this.stats.projectileSpeed,
        vy: Math.sin(a) * this.stats.projectileSpeed,
        radius: isCrit ? 5.5 : 4.2,
        damage: dmg,
        isEnemy: false,
        isCrit,
        pierceLeft: this.stats.pierce,
        ricochetLeft: this.stats.ricochet,
        life: 1.5,
        color: isCrit ? this.theme.accent : this.theme.primary,
        trail: [],
        hitIds: new Set(),
      });
    }

    // Homing micro-missiles every 3rd volley
    if (this.stats.homingMissiles > 0 && p.shotCounter % 3 === 0) {
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

    if (!silent) {
      sound.playShoot(isCrit);
    }
  }

  private updateSpawning(dt: number, isTitle: boolean): void {
    if (this.waveSpawnRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.waveSpawnRemaining--;
        this.spawnTimer = Math.max(0.28, 1.15 - this.wave * 0.06);
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
      } else if (e.kind === 'sniper') {
        if (e.aimTimer > 0) {
          e.vx *= 0.85;
          e.vy *= 0.85;
          e.aimTimer -= dt;
          e.aimAngle = Math.atan2(dy, dx);
          if (e.aimTimer <= 0) {
            // Fire fast sniper bolt
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
        e.vx = (dirX * radial + perpX * 0.6) * e.speed;
        e.vy = (dirY * radial + perpY * 0.6) * e.speed;

        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 0.75;
          const arms = 8;
          for (let k = 0; k < arms; k++) {
            const a = e.phase * 1.8 + (k * Math.PI * 2) / arms;
            this.bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 320,
              vy: Math.sin(a) * 320,
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

      // Player collision
      if (!isTitle && p.invulnTimer <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius - 3) {
        this.damagePlayer(e.kind === 'boss' ? 24 : 16);
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

      // Arena bounds / ricochet
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

      // Player bullet hitting enemies
      let consumed = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (b.hitIds.has(e.id)) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.radius + e.radius) {
          b.hitIds.add(e.id);
          this.damageEnemy(e, b.damage, !isTitle, b.isCrit);

          if (this.stats.chainLightning > 0) {
            this.triggerChainLightning(e, this.stats.chainLightning, b.damage * 0.55, !isTitle);
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

  private triggerChainLightning(source: Enemy, jumps: number, dmg: number, allowAudio: boolean): void {
    let current: Enemy = source;
    const visited = new Set<number>([source.id]);

    for (let k = 0; k < jumps; k++) {
      let best: Enemy | null = null;
      let bestDist = 230;
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

      // Jagged lightning points
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
      this.texts.push({
        x: e.x + (Math.random() - 0.5) * 16,
        y: e.y - e.radius,
        vy: -55,
        text: `${Math.round(amount)}!`,
        color: this.theme.accent,
        life: 0.55,
        maxLife: 0.55,
        scale: 1.05,
      });
    }

    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx !== -1) this.enemies.splice(idx, 1);

      const isBoss = e.kind === 'boss';
      this.kills++;
      this.combo++;
      this.comboTimer = 3.2;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

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
        this.bossActive = false;
      }

      this.spawnParticles(e.x, e.y, isBoss ? 55 : 18, e.color, isBoss ? 420 : 240, 'shard');
      this.spawnShockwave(e.x, e.y, isBoss ? 280 : 65, e.color, isBoss ? 6 : 2.5);

      // Splitters spawn 3 mini seekers
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

      // Drop XP orbs
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

  private damagePlayer(amount: number): void {
    const p = this.player;
    p.hp -= amount;
    p.invulnTimer = 0.85;
    this.combo = 0;
    sound.playDamage();
    this.addShake(12);
    this.spawnShockwave(p.x, p.y, 130, '#ff2a54', 4);
    this.spawnParticles(p.x, p.y, 16, '#ff2a54', 240);

    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'gameover';
      this.pushHud();
      this.callbacks.onGameOver({
        score: this.score,
        wave: this.wave,
        kills: this.kills,
        maxCombo: this.maxCombo,
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

      if (dist < this.stats.pickupRadius) {
        const pull = 580 * (1 - dist / (this.stats.pickupRadius * 1.25));
        o.vx += (dx / dist) * pull * dt * 8;
        o.vy += (dy / dist) * pull * dt * 8;
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      if (dist < p.radius + 14) {
        this.orbs.splice(i, 1);
        if (this.state === 'playing') {
          sound.playPickup();
          p.xp += o.value;
          p.novaCharge = Math.min(100, p.novaCharge + 1.5);
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
    const available = UPGRADES.filter((u) => (this.acquiredUpgrades[u.id] || 0) < u.maxStacks);
    if (available.length === 0) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
      return;
    }

    // Shuffle and pick 3
    const pool = [...available].sort(() => Math.random() - 0.5);
    const choices = pool.slice(0, Math.min(3, pool.length));
    this.state = 'levelup';
    sound.playLevelUp();
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

    if (!isTitle) {
      const lookX = (this.mouseScreenX - this.width / 2) * 0.14;
      const lookY = (this.mouseScreenY - this.height / 2) * 0.14;
      targetX += lookX;
      targetY += lookY;
    }

    this.camX += (targetX - this.camX) * Math.min(1, dt * 8);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 8);
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
      boss: boss ? { name: 'THE MONOLITH', hp: Math.max(0, Math.ceil(boss.hp)), maxHp: boss.maxHp } : null,
      acquiredUpgrades: { ...this.acquiredUpgrades },
    });
  }

  // ==================== RENDERING ====================
  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Deep cosmic background gradient
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

    // Parallax stars
    for (const s of this.stars) {
      const sx = ((s.x - this.camX * s.depth + this.width * 2) % this.width);
      const sy = ((s.y - this.camY * s.depth + this.height * 2) % this.height);
      const alpha = 0.35 + 0.45 * Math.sin(this.time * 2.2 + s.twinkle);
      ctx.fillStyle = `rgba(220, 240, 255, ${alpha.toFixed(2)})`;
      ctx.fillRect(sx, sy, s.size, s.size);
    }

    ctx.translate(offsetX, offsetY);

    // Nebula glows
    const nebColors = [this.theme.primary, this.theme.secondary, this.theme.accent];
    for (const n of this.nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.radius);
      g.addColorStop(0, this.hexToRgba(nebColors[n.colorIdx], 0.12));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cyber grid
    this.renderGrid(ctx);

    // Arena boundary
    ctx.strokeStyle = this.theme.primary;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, this.arenaW - 32, this.arenaH - 32);

    // Additive glow layer for entities & FX
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

    // Shockwaves
    for (const s of this.shockwaves) {
      ctx.strokeStyle = this.hexToRgba(s.color, Math.max(0, s.alpha));
      ctx.lineWidth = s.lineWidth;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Lightning arcs
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

    // Particles
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

    // Bullets
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

    // Enemies
    for (const e of this.enemies) {
      this.renderEnemy(ctx, e);
    }

    // Player & orbitals
    this.renderPlayer(ctx);

    ctx.restore(); // end lighter

    // Floating combat text
    ctx.textAlign = 'center';
    ctx.font = '700 14px "Orbitron", sans-serif';
    for (const t of this.texts) {
      const alpha = Math.min(1, t.life / t.maxLife);
      ctx.fillStyle = this.hexToRgba(t.color, alpha);
      ctx.fillText(t.text, t.x, t.y);
    }

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

    // Engine trail
    for (const tr of p.trail) {
      ctx.fillStyle = this.hexToRgba(this.theme.primary, tr.alpha * 0.55);
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 4.5 * tr.alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dash afterimages
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

    // Orbital blades
    if (this.stats.orbitalBlades > 0) {
      const orbitR = 64;
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

    // Invuln blink
    if (p.invulnTimer > 0 && Math.floor(this.time * 20) % 2 === 0 && p.dashDuration <= 0) {
      ctx.globalAlpha = 0.45;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    if (this.settings.bloomEnabled) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = this.theme.primary;
    }
    ctx.strokeStyle = this.theme.primary;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2.6;
    this.traceShipPath(ctx, p.radius);
    ctx.fill();
    ctx.stroke();

    // Inner core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
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

    // Sniper laser telegraph
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
        : e.kind === 'sniper'
        ? 4
        : e.kind === 'splitter'
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
