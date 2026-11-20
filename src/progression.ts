import { ICONS } from './icons';
import { ExplosionStyleId, FrameId, RelicId, TrailId } from './types';

export type ShipClassId = 'interceptor' | 'juggernaut' | 'phantom' | 'tesla' | 'carrier' | 'blade';

export interface ShipClassDef {
  id: ShipClassId;
  name: string;
  role: string;
  cost: number;
  perkText: string;
  ultiName: string;
  ultiDesc: string;
  hpBonus: number;
  speedMult: number;
  critBonus: number;
  dashMult: number;
  startUpgrades: string[];
}

export interface MetaUpgradeDef {
  id: 'meta_damage' | 'meta_hp' | 'meta_speed' | 'meta_greed' | 'meta_startlvl';
  name: string;
  icon: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costStep: number;
}

export interface DailyQuest {
  id: string;
  title: string;
  metric: 'kills' | 'wave' | 'combo' | 'runs';
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  titleTag: string;
  color: string;
  description: string;
  reward: number;
}

export interface SeasonReward {
  type: 'shards' | 'trail' | 'explosion' | 'frame';
  value: number | string;
}

export interface SeasonTierDef {
  tier: number;
  freeLabel: string;
  freeReward: SeasonReward;
  premLabel: string;
  premReward: SeasonReward;
}

export interface CosmeticDef<T extends string> {
  id: T;
  name: string;
  cost: number;
  previewColor: string;
  description: string;
}

export interface WeeklyMutatorDef {
  id: 'ricochet_week' | 'elite_hunt' | 'missile_rain' | 'glass_cannon';
  name: string;
  badge: string;
  description: string;
}

export interface BossRelicDef {
  id: RelicId;
  name: string;
  tag: string;
  icon: string;
  description: string;
}

export interface PlayerProfile {
  playerId: string;
  callsign: string;
  clanTag: string;
  referralCode: string;
  referredBy: string;
  referralsCount: number;
  friends: string[];
  shards: number;
  totalKills: number;
  totalScore: number;
  totalRuns: number;
  unlockedShips: ShipClassId[];
  selectedShip: ShipClassId;
  metaLevels: Record<MetaUpgradeDef['id'], number>;
  lastLoginDate: string;
  streakDays: number;
  dailyClaimedToday: boolean;
  capsuleClaimedToday: boolean;
  extraCapsuleAdToday: boolean;
  nextRunBuff: 'none' | 'shield' | 'xp';
  unlockedAchievements: string[];
  equippedTitle: string;
  questDate: string;
  quests: DailyQuest[];
  seasonId: number;
  seasonXp: number;
  seasonPremium: boolean;
  claimedFreeTiers: number[];
  claimedPremiumTiers: number[];
  unlockedTrails: TrailId[];
  selectedTrail: TrailId;
  unlockedExplosions: ExplosionStyleId[];
  selectedExplosion: ExplosionStyleId;
  unlockedFrames: FrameId[];
  selectedFrame: FrameId;
}

export const SEASON_XP_PER_TIER = 350;

export function getSeasonInfo(): { seasonId: number; daysLeft: number; name: string } {
  const epochDays = Math.floor(Date.now() / 86400000);
  const baseEpochDay = 20778; // Старт Сезона 1 (2026-11-20)
  const seasonLen = 30;
  const elapsed = Math.max(0, epochDays - baseEpochDay);
  const seasonId = Math.floor(elapsed / seasonLen) + 1;
  const dayInSeason = elapsed % seasonLen;
  const daysLeft = Math.max(1, seasonLen - dayInSeason);
  return { seasonId, daysLeft, name: `СЕЗОН ${seasonId}: НЕОНОВЫЙ РАЗЛОМ` };
}

export function getSeasonTier(seasonXp: number): number {
  return Math.min(10, Math.floor(Math.max(0, seasonXp) / SEASON_XP_PER_TIER));
}

export const SEASON_PASS_TIERS: SeasonTierDef[] = [
  {
    tier: 1,
    freeLabel: '+40 Осколков',
    freeReward: { type: 'shards', value: 40 },
    premLabel: 'След «Плазма»',
    premReward: { type: 'trail', value: 'plasma' },
  },
  {
    tier: 2,
    freeLabel: '+50 Осколков',
    freeReward: { type: 'shards', value: 50 },
    premLabel: '+110 Осколков',
    premReward: { type: 'shards', value: 110 },
  },
  {
    tier: 3,
    freeLabel: 'Рамка «Кибер»',
    freeReward: { type: 'frame', value: 'cyber' },
    premLabel: 'Взрыв «Кольца»',
    premReward: { type: 'explosion', value: 'rings' },
  },
  {
    tier: 4,
    freeLabel: '+65 Осколков',
    freeReward: { type: 'shards', value: 65 },
    premLabel: '+140 Осколков',
    premReward: { type: 'shards', value: 140 },
  },
  {
    tier: 5,
    freeLabel: 'След «Пламя»',
    freeReward: { type: 'trail', value: 'flame' },
    premLabel: 'След «Призма»',
    premReward: { type: 'trail', value: 'prism' },
  },
  {
    tier: 6,
    freeLabel: '+80 Осколков',
    freeReward: { type: 'shards', value: 80 },
    premLabel: '+180 Осколков',
    premReward: { type: 'shards', value: 180 },
  },
  {
    tier: 7,
    freeLabel: '+90 Осколков',
    freeReward: { type: 'shards', value: 90 },
    premLabel: 'Рамка «Золото»',
    premReward: { type: 'frame', value: 'gold' },
  },
  {
    tier: 8,
    freeLabel: 'След «Молния»',
    freeReward: { type: 'trail', value: 'lightning' },
    premLabel: '+220 Осколков',
    premReward: { type: 'shards', value: 220 },
  },
  {
    tier: 9,
    freeLabel: '+120 Осколков',
    freeReward: { type: 'shards', value: 120 },
    premLabel: 'Взрыв «Сверхновая»',
    premReward: { type: 'explosion', value: 'supernova' },
  },
  {
    tier: 10,
    freeLabel: 'Рамка «Бездна»',
    freeReward: { type: 'frame', value: 'void' },
    premLabel: '+400 Осколков',
    premReward: { type: 'shards', value: 400 },
  },
];

export const TRAIL_DEFS: CosmeticDef<TrailId>[] = [
  { id: 'neon', name: 'Неон Стандарт', cost: 0, previewColor: '#00f5ff', description: 'Классический шлейф реактора.' },
  { id: 'plasma', name: 'Плазма-Кольца', cost: 160, previewColor: '#ff2a85', description: 'Пульсирующие кольца за кормой.' },
  { id: 'flame', name: 'Солнечное Пламя', cost: 210, previewColor: '#ff7b00', description: 'Огненный реактивный поток.' },
  { id: 'lightning', name: 'Дуговой Разряд', cost: 250, previewColor: '#70e0ff', description: 'Искры высокого напряжения.' },
  { id: 'prism', name: 'Спектр Призмы', cost: 340, previewColor: '#00ff87', description: 'Переливающийся радужный след.' },
];

export const EXPLOSION_DEFS: CosmeticDef<ExplosionStyleId>[] = [
  { id: 'shards', name: 'Осколки', cost: 0, previewColor: '#00f5ff', description: 'Чёткие неоновые грани.' },
  { id: 'rings', name: 'Энерго-Кольца', cost: 200, previewColor: '#c77dff', description: 'Двойная ударная волна и искры.' },
  { id: 'supernova', name: 'Сверхновая', cost: 320, previewColor: '#ffb703', description: 'Ослепительная звёздная вспышка.' },
];

export const FRAME_DEFS: CosmeticDef<FrameId>[] = [
  { id: 'default', name: 'Стандарт', cost: 0, previewColor: '#9aa7c7', description: 'Базовый контур карточки пилота.' },
  { id: 'cyber', name: 'Кибер-Неон', cost: 140, previewColor: '#00f5ff', description: 'Светящаяся бирюзовая окантовка.' },
  { id: 'gold', name: 'Золото Аса', cost: 260, previewColor: '#ffb703', description: 'Элитная золотая рамка командира.' },
  { id: 'void', name: 'Энергия Бездны', cost: 360, previewColor: '#ff2a85', description: 'Неоново-алое сияние разлома.' },
];

export const WEEKLY_MUTATORS: WeeklyMutatorDef[] = [
  {
    id: 'ricochet_week',
    name: 'НЕДЕЛЯ РИКОШЕТА',
    badge: 'РИКОШЕТ +2 / ВРАГИ +20% СК.',
    description: 'Все пули рикошетят на +2 раза больше, но враги быстрее на 20%. Награда +35% Осколков!',
  },
  {
    id: 'elite_hunt',
    name: 'ОХОТА НА ЭЛИТУ',
    badge: 'ЭЛИТА x2 / ОПЫТ +30%',
    description: 'Вдвое больше элитных врагов, зато кристаллы опыта дают на 30% больше. Награда +40% Осколков!',
  },
  {
    id: 'missile_rain',
    name: 'РАКЕТНЫЙ ШКВАЛ',
    badge: 'САМОНАВЕДЕНИЕ / ВРАГИ +25% ХП',
    description: 'Стартуешь с самонаводящимися ракетами, враги прочнее на 25%. Награда +35% Осколков!',
  },
  {
    id: 'glass_cannon',
    name: 'ХРУПКАЯ ЯРОСТЬ',
    badge: 'УРОН +45% / ХП -25%',
    description: 'Огромный урон пушек при уменьшенной броне. Максимальный адреналин и +45% Осколков!',
  },
];

export function getWeeklyMutator(): WeeklyMutatorDef {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - oneJan.getTime()) / 86400000);
  const weekNum = Math.floor((days + oneJan.getDay()) / 7) + now.getFullYear() * 53;
  return WEEKLY_MUTATORS[Math.abs(weekNum) % WEEKLY_MUTATORS.length];
}

export const BOSS_RELICS: BossRelicDef[] = [
  {
    id: 'relic_blackhole',
    name: 'СИНГУЛЯРНОСТЬ',
    tag: 'РЕЛИКВИЯ БОССА',
    icon: ICONS.vortex,
    description: 'Каждый 10-й выстрел создаёт мини-чёрную дыру, стягивающую и сжигающую врагов.',
  },
  {
    id: 'relic_dashnova',
    name: 'РЫВОК СВЕРХНОВОЙ',
    tag: 'РЕЛИКВИЯ БОССА',
    icon: ICONS.dash,
    description: 'Каждый Фазовый Рывок выпускает веер из 6 пробивающих плазменных зарядов.',
  },
  {
    id: 'relic_echo',
    name: 'КВАНТОВОЕ ЭХО',
    tag: 'РЕЛИКВИЯ БОССА',
    icon: ICONS.relic,
    description: '25% шанс мгновенно выпустить второй залп из всех орудий без задержки.',
  },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach_first_win',
    name: 'Покоритель Сектора',
    titleTag: '[ЧЕМПИОН]',
    color: '#00f5ff',
    description: 'Пройти 10 волн и победить финального босса.',
    reward: 80,
  },
  {
    id: 'ach_no_hit_boss',
    name: 'Неуловимый',
    titleTag: '[ПРИЗРАК]',
    color: '#c77dff',
    description: 'Убить любого босса, не получив урона во время боя с ним.',
    reward: 90,
  },
  {
    id: 'ach_evo',
    name: 'Мастер Оружия',
    titleTag: '[ИНЖЕНЕР]',
    color: '#ffb703',
    description: 'Собрать любое Супер-оружие (Эволюцию).',
    reward: 60,
  },
  {
    id: 'ach_courier',
    name: 'Золотая Лихорадка',
    titleTag: '[ОХОТНИК]',
    color: '#ffd166',
    description: 'Сбить Золотого Дрона-Курьера на арене.',
    reward: 50,
  },
  {
    id: 'ach_combo50',
    name: 'Машина Разрушения',
    titleTag: '[БЕРСЕРК]',
    color: '#ff2a54',
    description: 'Набрать серию комбо 40+ ударов.',
    reward: 65,
  },
  {
    id: 'ach_duel',
    name: 'Король Арены',
    titleTag: '[ДУЭЛЯНТ]',
    color: '#00ff87',
    description: 'Одержать победу в онлайн-дуэли 1х1.',
    reward: 75,
  },
];

export const SHIP_CLASSES: ShipClassDef[] = [
  {
    id: 'interceptor',
    name: 'ИСТРЕБИТЕЛЬ',
    role: 'БАЛАНС',
    cost: 0,
    perkText: 'Быстрый и удобный корабль для старта.',
    ultiName: 'ГИПЕР-ЛУЧ',
    ultiDesc: 'Прожигает всех врагов на линии мощным лазером.',
    hpBonus: 0,
    speedMult: 1,
    critBonus: 0,
    dashMult: 1,
    startUpgrades: [],
  },
  {
    id: 'juggernaut',
    name: 'ТАНК',
    role: 'БРОНЯ + 2 ПУЛИ',
    cost: 120,
    perkText: '+40 ХП и сразу стреляет двумя пулями.',
    ultiName: 'ЭНЕРГО-ТАРАН',
    ultiDesc: '3.5 сек неуязвимости и таранный щит, сносящий врагов.',
    hpBonus: 40,
    speedMult: 0.92,
    critBonus: 0,
    dashMult: 1.05,
    startUpgrades: ['multishot'],
  },
  {
    id: 'phantom',
    name: 'НИНДЗЯ',
    role: 'СКОРОСТЬ / КРИТ',
    cost: 260,
    perkText: '+15% скорости, +15% крита и быстрый рывок.',
    ultiName: 'ТЕНЕВЫЕ КЛОНЫ',
    ultiDesc: '2 теневых клона 5.5 сек стреляют вместе с тобой.',
    hpBonus: -10,
    speedMult: 1.15,
    critBonus: 0.15,
    dashMult: 0.72,
    startUpgrades: [],
  },
  {
    id: 'tesla',
    name: 'ЭЛЕКТРО',
    role: 'МОЛНИИ + КЛИНКИ',
    cost: 450,
    perkText: 'Сразу бьёт цепной молнией и имеет защитные клинки.',
    ultiName: 'ГРОЗОВАЯ БУРЯ',
    ultiDesc: 'Бьёт мощнейшими молниями всех врагов на экране.',
    hpBonus: 10,
    speedMult: 1.04,
    critBonus: 0.05,
    dashMult: 0.95,
    startUpgrades: ['chain', 'orbitals'],
  },
  {
    id: 'carrier',
    name: 'НОСИТЕЛЬ',
    role: 'ДРОНЫ-ОХОТНИКИ',
    cost: 520,
    perkText: '2 автономных дрона атакуют врагов и наводят ракеты.',
    ultiName: 'РОЙ ДРОНОВ',
    ultiDesc: 'На 6 сек выпускает 6 штурмовых дронов с удвоенным огнём.',
    hpBonus: 15,
    speedMult: 0.96,
    critBonus: 0.04,
    dashMult: 1,
    startUpgrades: ['homing'],
  },
  {
    id: 'blade',
    name: 'БЕРСЕРК',
    role: 'БЛИЖНИЙ БОЙ',
    cost: 600,
    perkText: 'Рубит врагов широкой плазменной дугой и режет пули.',
    ultiName: 'ВИХРЬ КЛИНКОВ',
    ultiDesc: '4.5 сек кругового шторма, уничтожающего врагов и снаряды вокруг.',
    hpBonus: 25,
    speedMult: 1.12,
    critBonus: 0.12,
    dashMult: 0.8,
    startUpgrades: ['vampiric'],
  },
];

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'meta_damage',
    name: 'Урон оружия',
    icon: ICONS.shard,
    description: '+8% к урону всех пуль навсегда.',
    maxLevel: 5,
    baseCost: 40,
    costStep: 35,
  },
  {
    id: 'meta_hp',
    name: 'Прочность корпуса',
    icon: ICONS.hangar,
    description: '+15 к здоровью на старте боя.',
    maxLevel: 5,
    baseCost: 35,
    costStep: 30,
  },
  {
    id: 'meta_speed',
    name: 'Мощность двигателя',
    icon: ICONS.dash,
    description: '+6% к скорости полёта навсегда.',
    maxLevel: 5,
    baseCost: 35,
    costStep: 30,
  },
  {
    id: 'meta_greed',
    name: 'Бонус кристаллов',
    icon: ICONS.prism,
    description: '+15% к награде осколками после боя.',
    maxLevel: 5,
    baseCost: 45,
    costStep: 40,
  },
  {
    id: 'meta_startlvl',
    name: 'Быстрый старт',
    icon: ICONS.bolt,
    description: 'Выбирай первый апгрейд сразу в начале боя!',
    maxLevel: 1,
    baseCost: 150,
    costStep: 0,
  },
];

const PROFILE_KEY = 'aether_rift_profile_v2';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function generateRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function sanitizeClanTag(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-ZА-Я0-9]/gi, '').slice(0, 5);
}

function generateDailyQuests(): DailyQuest[] {
  return [
    { id: 'q_kills', title: 'Уничтожить 120 врагов', metric: 'kills', target: 120, progress: 0, reward: 55, claimed: false },
    { id: 'q_wave', title: 'Дойти до 5 волны', metric: 'wave', target: 5, progress: 0, reward: 70, claimed: false },
    { id: 'q_combo', title: 'Сделать комбо x20', metric: 'combo', target: 20, progress: 0, reward: 50, claimed: false },
  ];
}

export function loadProfile(): PlayerProfile {
  const today = todayKey();
  const season = getSeasonInfo();
  let profile: PlayerProfile | null = null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) profile = JSON.parse(raw) as PlayerProfile;
  } catch {
    profile = null;
  }

  if (!profile) {
    profile = {
      playerId: generateId('web'),
      callsign: `ПИЛОТ-${Math.floor(100 + Math.random() * 899)}`,
      clanTag: '',
      referralCode: generateRefCode(),
      referredBy: '',
      referralsCount: 0,
      friends: [],
      shards: 40,
      totalKills: 0,
      totalScore: 0,
      totalRuns: 0,
      unlockedShips: ['interceptor'],
      selectedShip: 'interceptor',
      metaLevels: {
        meta_damage: 0,
        meta_hp: 0,
        meta_speed: 0,
        meta_greed: 0,
        meta_startlvl: 0,
      },
      lastLoginDate: today,
      streakDays: 1,
      dailyClaimedToday: false,
      capsuleClaimedToday: false,
      extraCapsuleAdToday: false,
      nextRunBuff: 'none',
      unlockedAchievements: [],
      equippedTitle: '',
      questDate: today,
      quests: generateDailyQuests(),
      seasonId: season.seasonId,
      seasonXp: 0,
      seasonPremium: false,
      claimedFreeTiers: [],
      claimedPremiumTiers: [],
      unlockedTrails: ['neon'],
      selectedTrail: 'neon',
      unlockedExplosions: ['shards'],
      selectedExplosion: 'shards',
      unlockedFrames: ['default'],
      selectedFrame: 'default',
    };
  }

  // Backward-compat defaults
  if (!profile.playerId) profile.playerId = generateId('web');
  if (profile.clanTag === undefined) profile.clanTag = '';
  if (!profile.referralCode) profile.referralCode = generateRefCode();
  if (profile.referredBy === undefined) profile.referredBy = '';
  if (profile.referralsCount === undefined) profile.referralsCount = 0;
  if (!Array.isArray(profile.friends)) profile.friends = [];
  if (profile.capsuleClaimedToday === undefined) profile.capsuleClaimedToday = false;
  if (profile.extraCapsuleAdToday === undefined) profile.extraCapsuleAdToday = false;
  if (!profile.nextRunBuff) profile.nextRunBuff = 'none';
  if (!profile.unlockedAchievements) profile.unlockedAchievements = [];
  if (profile.equippedTitle === undefined) profile.equippedTitle = '';
  if (!Array.isArray(profile.unlockedTrails)) profile.unlockedTrails = ['neon'];
  if (!profile.selectedTrail) profile.selectedTrail = 'neon';
  if (!Array.isArray(profile.unlockedExplosions)) profile.unlockedExplosions = ['shards'];
  if (!profile.selectedExplosion) profile.selectedExplosion = 'shards';
  if (!Array.isArray(profile.unlockedFrames)) profile.unlockedFrames = ['default'];
  if (!profile.selectedFrame) profile.selectedFrame = 'default';
  if (profile.seasonId !== season.seasonId) {
    const advancingToNewSeason = profile.seasonId !== undefined && profile.seasonId < season.seasonId;
    profile.seasonId = season.seasonId;
    if (advancingToNewSeason) {
      profile.seasonXp = 0;
      profile.seasonPremium = false;
      profile.claimedFreeTiers = [];
      profile.claimedPremiumTiers = [];
    }
  }
  if (!Array.isArray(profile.claimedFreeTiers)) profile.claimedFreeTiers = [];
  if (!Array.isArray(profile.claimedPremiumTiers)) profile.claimedPremiumTiers = [];

  if (profile.questDate !== today) {
    profile.questDate = today;
    profile.quests = generateDailyQuests();
    profile.dailyClaimedToday = false;
    profile.capsuleClaimedToday = false;
    profile.extraCapsuleAdToday = false;
    if (profile.lastLoginDate !== today) {
      profile.streakDays = Math.min(7, (profile.streakDays || 1) + 1);
      profile.lastLoginDate = today;
    }
  }

  saveProfile(profile);
  return profile;
}

export function applyCosmeticReward(profile: PlayerProfile, reward: SeasonReward): void {
  if (reward.type === 'shards') {
    profile.shards += Number(reward.value) || 0;
  } else if (reward.type === 'trail') {
    const id = reward.value as TrailId;
    if (!profile.unlockedTrails.includes(id)) profile.unlockedTrails.push(id);
    profile.selectedTrail = id;
  } else if (reward.type === 'explosion') {
    const id = reward.value as ExplosionStyleId;
    if (!profile.unlockedExplosions.includes(id)) profile.unlockedExplosions.push(id);
    profile.selectedExplosion = id;
  } else if (reward.type === 'frame') {
    const id = reward.value as FrameId;
    if (!profile.unlockedFrames.includes(id)) profile.unlockedFrames.push(id);
    profile.selectedFrame = id;
  }
}

export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getPilotRank(totalScore: number): { title: string; color: string } {
  if (totalScore >= 250000) return { title: 'ЛЕГЕНДА', color: '#ffb703' };
  if (totalScore >= 100000) return { title: 'ФАНТОМ', color: '#ff2a85' };
  if (totalScore >= 35000) return { title: 'АС', color: '#00f5ff' };
  if (totalScore >= 10000) return { title: 'ВЕТЕРАН', color: '#00ff87' };
  return { title: 'РЕКРУТ', color: '#9aa7c7' };
}

export function getMetaCost(def: MetaUpgradeDef, currentLevel: number): number {
  return def.baseCost + currentLevel * def.costStep;
}
