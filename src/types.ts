export type GameState = 'title' | 'playing' | 'paused' | 'levelup' | 'modal' | 'gameover';

export type GameMode = 'classic' | 'blitz' | 'daily' | 'mutator' | 'coop' | 'pvp';

export type RelicId = 'relic_blackhole' | 'relic_dashnova' | 'relic_echo';

export type TrailId = 'neon' | 'plasma' | 'prism' | 'flame' | 'lightning';

export type ExplosionStyleId = 'shards' | 'rings' | 'supernova';

export type FrameId = 'default' | 'cyber' | 'gold' | 'void';

export type BiomeId = 'deep' | 'cryo' | 'rift';

export interface GhostSample {
  t: number;
  x: number;
  y: number;
  a: number;
}

export type EnemyKind = 'swarmer' | 'bomber' | 'splitter' | 'mini' | 'sniper' | 'shielder' | 'spawner' | 'warden' | 'boss';

export type PowerUpKind = 'heal' | 'magnet' | 'overclock';

export interface ThemePalette {
  id: string;
  name: string;
  subtitle: string;
  primary: string;
  secondary: string;
  accent: string;
  bgInner: string;
  bgOuter: string;
  gridColor: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  tag: string;
  rarity: 'common' | 'rare' | 'epic' | 'evolution';
  icon: string;
  description: string;
  maxStacks: number;
  requires?: [string, string];
}

export interface PlayerStats {
  moveSpeed: number;
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  projectiles: number;
  spreadAngle: number;
  pierce: number;
  ricochet: number;
  chainLightning: number;
  homingMissiles: number;
  orbitalBlades: number;
  dashCooldown: number;
  phantomDash: boolean;
  vampiricChance: number;
  pickupRadius: number;
  critChance: number;
  aegisShieldCooldown: number;
  evoStorm: boolean;
  evoVortex: boolean;
  evoOmega: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  dashTimer: number;
  dashDuration: number;
  dashDirX: number;
  dashDirY: number;
  invulnTimer: number;
  novaCharge: number;
  overclockTimer: number;
  shieldReady: boolean;
  shieldTimer: number;
  fireCooldown: number;
  shotCounter: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
  wingLeftTrail: Array<{ x: number; y: number; alpha: number }>;
  wingRightTrail: Array<{ x: number; y: number; alpha: number }>;
  afterimages: Array<{ x: number; y: number; angle: number; alpha: number }>;
  bladeAngle: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  isEnemy: boolean;
  isVisualOnly?: boolean;
  isHoming?: boolean;
  isCrit?: boolean;
  pierceLeft: number;
  ricochetLeft: number;
  life: number;
  color: string;
  trail: Array<{ x: number; y: number }>;
  hitIds: Set<number>;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  color: string;
  xpValue: number;
  scoreValue: number;
  shootTimer: number;
  aimTimer: number;
  aimAngle: number;
  hitFlash: number;
  phase?: number;
  spin: number;
  isElite?: boolean;
  flankSign?: number;
  attackStep?: number;
  chargeTimer?: number;
  chargeDirX?: number;
  chargeDirY?: number;
}

export interface PowerUp {
  x: number;
  y: number;
  kind: PowerUpKind;
  life: number;
  pulse: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
  shape: 'circle' | 'shard' | 'ring';
  angle?: number;
  spin?: number;
}

export interface LightningArc {
  points: Array<{ x: number; y: number }>;
  color: string;
  life: number;
  maxLife: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

export interface XpOrb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  color: string;
  pulse: number;
  magnetized?: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface HighScoreEntry {
  score: number;
  wave: number;
  kills: number;
  maxCombo: number;
  theme: string;
  date: string;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  bloomEnabled: boolean;
  screenShake: boolean;
  autoFire: boolean;
}
