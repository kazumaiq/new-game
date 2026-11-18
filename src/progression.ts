export type ShipClassId = 'interceptor' | 'juggernaut' | 'phantom' | 'tesla';

export interface ShipClassDef {
  id: ShipClassId;
  name: string;
  role: string;
  cost: number;
  perkText: string;
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

export interface PlayerProfile {
  callsign: string;
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
  questDate: string;
  quests: DailyQuest[];
}

export const SHIP_CLASSES: ShipClassDef[] = [
  {
    id: 'interceptor',
    name: 'ИСТРЕБИТЕЛЬ',
    role: 'БАЛАНС',
    cost: 0,
    perkText: 'Быстрый и удобный корабль для старта.',
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
    hpBonus: 10,
    speedMult: 1.04,
    critBonus: 0.05,
    dashMult: 0.95,
    startUpgrades: ['chain', 'orbitals'],
  },
];

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'meta_damage',
    name: 'Урон оружия',
    icon: '◆',
    description: '+8% к урону всех пуль навсегда.',
    maxLevel: 5,
    baseCost: 40,
    costStep: 35,
  },
  {
    id: 'meta_hp',
    name: 'Прочность корпуса',
    icon: '⬡',
    description: '+15 к здоровью на старте боя.',
    maxLevel: 5,
    baseCost: 35,
    costStep: 30,
  },
  {
    id: 'meta_speed',
    name: 'Мощность двигателя',
    icon: '»',
    description: '+6% к скорости полёта навсегда.',
    maxLevel: 5,
    baseCost: 35,
    costStep: 30,
  },
  {
    id: 'meta_greed',
    name: 'Бонус кристаллов',
    icon: '✦',
    description: '+15% к награде осколками после боя.',
    maxLevel: 5,
    baseCost: 45,
    costStep: 40,
  },
  {
    id: 'meta_startlvl',
    name: 'Быстрый старт',
    icon: '⚡',
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

function generateDailyQuests(): DailyQuest[] {
  return [
    { id: 'q_kills', title: 'Уничтожить 120 врагов', metric: 'kills', target: 120, progress: 0, reward: 55, claimed: false },
    { id: 'q_wave', title: 'Дойти до 5 волны', metric: 'wave', target: 5, progress: 0, reward: 70, claimed: false },
    { id: 'q_combo', title: 'Сделать комбо x20', metric: 'combo', target: 20, progress: 0, reward: 50, claimed: false },
  ];
}

export function loadProfile(): PlayerProfile {
  const today = todayKey();
  let profile: PlayerProfile | null = null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) profile = JSON.parse(raw) as PlayerProfile;
  } catch {
    profile = null;
  }

  if (!profile) {
    profile = {
      callsign: `ПИЛОТ-${Math.floor(100 + Math.random() * 899)}`,
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
      questDate: today,
      quests: generateDailyQuests(),
    };
  }

  if (profile.questDate !== today) {
    profile.questDate = today;
    profile.quests = generateDailyQuests();
    profile.dailyClaimedToday = false;
    if (profile.lastLoginDate !== today) {
      profile.streakDays = Math.min(7, (profile.streakDays || 1) + 1);
      profile.lastLoginDate = today;
    }
  }

  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getPilotRank(totalScore: number): { title: string; color: string } {
  if (totalScore >= 250000) return { title: 'ЛЕГЕНДА ПУСТОТЫ', color: '#ffb703' };
  if (totalScore >= 100000) return { title: 'ФАНТОМ ЭФИРА', color: '#ff2a85' };
  if (totalScore >= 35000) return { title: 'АС СЕКТОРА', color: '#00f5ff' };
  if (totalScore >= 10000) return { title: 'ВЕТЕРАН', color: '#00ff87' };
  return { title: 'РЕКРУТ', color: '#9aa7c7' };
}

export function getMetaCost(def: MetaUpgradeDef, currentLevel: number): number {
  return def.baseCost + currentLevel * def.costStep;
}
