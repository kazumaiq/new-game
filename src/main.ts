import './style.css';
import { trackEvent } from './analytics';
import { sound } from './audio';
import { AetherGame, drawShipPreview, HudSnapshot } from './game';
import { IconKey, ICONS, iconHtml } from './icons';
import {
  fetchClanLeaderboard,
  fetchCloudProfile,
  fetchGlobalLeaderboard,
  recordReferral,
  saveCloudProfile,
  submitGlobalScore,
} from './leaderboard';
import {
  initYandexSdk,
  isYandexPlatform,
  loadYandexPlayerInfo,
  openTelegramStarsInvoice,
  saveYandexCloudProfile,
  showInterstitialAd,
  showRewardedAd,
  submitYandexLeaderboardScore,
  yandexGameplayStart,
  yandexGameplayStop,
} from './monetization';
import { CoopNetwork } from './network';
import {
  ACHIEVEMENTS,
  applyCosmeticReward,
  BOSS_RELICS,
  EXPLOSION_DEFS,
  FRAME_DEFS,
  getMetaCost,
  getPilotRank,
  getSeasonInfo,
  getSeasonTier,
  getWeeklyMutator,
  loadProfile,
  META_UPGRADES,
  sanitizeClanTag,
  saveProfile,
  SEASON_PASS_TIERS,
  SEASON_XP_PER_TIER,
  SHIP_CLASSES,
  TRAIL_DEFS,
} from './progression';
import { HighlightRecorder } from './recorder';
import { THEMES } from './themes';
import {
  ExplosionStyleId,
  FrameId,
  GameMode,
  GameSettings,
  HighScoreEntry,
  RelicId,
  ThemePalette,
  TrailId,
  UpgradeDef,
} from './types';
import { UPGRADES } from './upgrades';

const SCORES_KEY = 'aether_rift_scores_v1';
const SETTINGS_KEY = 'aether_rift_settings_v1';
const THEME_KEY = 'aether_rift_theme_v1';
const TUTORIAL_KEY = 'aether_rift_tut_v1';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = el<HTMLCanvasElement>('game-canvas');
const hudEl = el<HTMLDivElement>('hud');
const titleScreen = el<HTMLDivElement>('title-screen');
const hangarScreen = el<HTMLDivElement>('hangar-screen');
const passScreen = el<HTMLDivElement>('pass-screen');
const questsScreen = el<HTMLDivElement>('quests-screen');
const coopScreen = el<HTMLDivElement>('coop-screen');
const levelupScreen = el<HTMLDivElement>('levelup-screen');
const relicScreen = el<HTMLDivElement>('relic-screen');
const pauseScreen = el<HTMLDivElement>('pause-screen');
const controlsScreen = el<HTMLDivElement>('controls-screen');
const scoresScreen = el<HTMLDivElement>('scores-screen');
const capsuleScreen = el<HTMLDivElement>('capsule-screen');
const abyssScreen = el<HTMLDivElement>('abyss-screen');
const reviveScreen = el<HTMLDivElement>('revive-screen');
const gameoverScreen = el<HTMLDivElement>('gameover-screen');
const tutorialScreen = el<HTMLDivElement>('tutorial-screen');
const waveBanner = el<HTMLDivElement>('wave-banner');
const touchLayer = el<HTMLDivElement>('touch-layer');

// Внедряем все векторные SVG-иконки
document.querySelectorAll<HTMLElement>('[data-ico]').forEach((node) => {
  const key = node.getAttribute('data-ico') as IconKey;
  if (key && ICONS[key]) {
    node.innerHTML = iconHtml(key);
  }
});

const recorder = new HighlightRecorder();
let activeUpgradeChoices: UpgradeDef[] = [];
let activeRelicChoices: RelicId[] = [];
let waveBannerTimer: number | null = null;
let lastHudHp = -1;
let hpFlashTimer: number | null = null;
let lastChallengeUrl = '';
let lastRunScore = 0;
let lastRunEarnedShards = 0;
let doubledShardsUsed = false;
let coopSyncTimer: number | null = null;
let pendingScoreSubmit: Promise<void> | null = null;
let selectedSoloMode: GameMode = 'classic';
let selectedOnlineMode: 'coop' | 'pvp' = 'coop';
let activeLbTab: 'daily' | 'all' | 'friends' | 'clans' | 'local' = 'daily';

let profile = loadProfile();

// Telegram Mini App integration
const TG_BOT_APP = import.meta.env.VITE_TG_BOT_APP || '';
const TG_STARS_PASS_INVOICE = import.meta.env.VITE_TG_STARS_PASS_INVOICE || '';

const tgApp = (window as unknown as {
  Telegram?: {
    WebApp?: {
      ready: () => void;
      expand: () => void;
      initData?: string;
      platform?: string;
      isFullscreen?: boolean;
      safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
      contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
      onEvent?: (eventType: string, callback: () => void) => void;
      setHeaderColor?: (c: string) => void;
      setBackgroundColor?: (c: string) => void;
      disableVerticalSwipes?: () => void;
      enableClosingConfirmation?: () => void;
      openTelegramLink?: (url: string) => void;
      initDataUnsafe?: {
        start_param?: string;
        user?: { id?: number | string; username?: string; first_name?: string };
      };
    };
  };
}).Telegram?.WebApp;

const tgInitData = tgApp?.initData || '';
const tgUser = tgApp?.initDataUnsafe?.user;
const isInsideTelegram = Boolean(
  tgApp &&
    (tgApp.initData ||
      tgApp.initDataUnsafe?.user ||
      (tgApp.platform && tgApp.platform !== 'unknown'))
);

function applyTelegramSafeArea(): void {
  if (!tgApp || !isInsideTelegram) return;
  const safeTop = Number(tgApp.safeAreaInset?.top) || 0;
  const contentTop = Number(tgApp.contentSafeAreaInset?.top) || 0;
  const safeBottom = Number(tgApp.safeAreaInset?.bottom) || 0;
  const contentBottom = Number(tgApp.contentSafeAreaInset?.bottom) || 0;
  const platform = (tgApp.platform || '').toLowerCase();
  const isMobileTg = platform === 'ios' || platform === 'android';

  // Гарантированный отступ под верхние плавающие кнопки Telegram («Закрыть» и меню «...»)
  const minTop = tgApp.isFullscreen ? (isMobileTg ? 94 : 56) : isMobileTg ? 56 : 44;
  const topPx = Math.max(minTop, safeTop + contentTop + 10);
  const botPx = Math.max(14, safeBottom + contentBottom + 10);

  document.documentElement.style.setProperty('--tg-top-pad', `${topPx}px`);
  document.documentElement.style.setProperty('--tg-bottom-pad', `${botPx}px`);
}

const adAudioCallbacks = {
  onOpen: () => sound.setAdMuted(true),
  onClose: () => sound.setAdMuted(false),
};

if (tgApp) {
  tgApp.ready();
  tgApp.expand();
  tgApp.setHeaderColor?.('#03040a');
  tgApp.setBackgroundColor?.('#03040a');
  tgApp.disableVerticalSwipes?.();
  tgApp.enableClosingConfirmation?.();
  applyTelegramSafeArea();
  tgApp.onEvent?.('safeAreaChanged', applyTelegramSafeArea);
  tgApp.onEvent?.('contentSafeAreaChanged', applyTelegramSafeArea);
  tgApp.onEvent?.('viewportChanged', applyTelegramSafeArea);
  tgApp.onEvent?.('fullscreenChanged', applyTelegramSafeArea);
  if (tgUser?.id) {
    profile.playerId = `tg_${String(tgUser.id)}`;
  }
  if (tgUser && profile.callsign.startsWith('ПИЛОТ-')) {
    profile.callsign = (tgUser.username || tgUser.first_name || 'ПИЛОТ').slice(0, 14).toUpperCase();
  }
  saveProfile(profile);
}

void initYandexSdk({
  onPause: () => {
    sound.setAdMuted(true);
    game.pauseIfPlaying();
  },
  onResume: () => {
    sound.setAdMuted(false);
  },
}).then(async (ok) => {
  if (!ok) return;
  const yaInfo = await loadYandexPlayerInfo();
  if (!yaInfo) return;
  if (!tgUser?.id && yaInfo.id) {
    profile.playerId = `ya_${yaInfo.id}`;
  }
  if (yaInfo.name && profile.callsign.startsWith('ПИЛОТ-')) {
    profile.callsign = yaInfo.name.slice(0, 14).toUpperCase();
  }
  if (yaInfo.savedProfile) {
    const savedScore = Number(yaInfo.savedProfile.totalScore) || 0;
    if (savedScore >= profile.totalScore) {
      profile = { ...profile, ...(yaInfo.savedProfile as Partial<typeof profile>) };
    }
  }
  saveProfile(profile);
  game.setProfile(profile);
  refreshLobbyUI();
});

trackEvent('session_start', { tg: Boolean(tgInitData) }, profile.playerId);

// Синхронизация профиля из облака Supabase по неизменяемому playerId
void fetchCloudProfile(profile.playerId, tgInitData).then((cloud) => {
  if (cloud && cloud.totalScore >= profile.totalScore) {
    profile = { ...profile, ...cloud };
    saveProfile(profile);
    game.setProfile(profile);
    refreshLobbyUI();
  }
});

// PWA Service Worker (не регистрируем внутри iframe Яндекс Игр)
if ('serviceWorker' in navigator && !isYandexPlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return {
        soundEnabled: true,
        musicEnabled: true,
        bloomEnabled: true,
        screenShake: true,
        autoFire: true,
        ...JSON.parse(raw),
      };
    }
  } catch {
    // ignore
  }
  return { soundEnabled: true, musicEnabled: true, bloomEnabled: true, screenShake: true, autoFire: true };
}

function saveSettings(s: GameSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    return raw ? (JSON.parse(raw) as HighScoreEntry[]) : [];
  } catch {
    return [];
  }
}

function saveScore(entry: HighScoreEntry): boolean {
  const list = loadScores();
  const prevTop = list.length > 0 ? list[0].score : 0;
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  localStorage.setItem(SCORES_KEY, JSON.stringify(list.slice(0, 15)));
  return entry.score > prevTop && entry.score > 0;
}

function applyThemeToCSS(theme: ThemePalette): void {
  document.documentElement.style.setProperty('--primary', theme.primary);
  document.documentElement.style.setProperty('--secondary', theme.secondary);
  document.documentElement.style.setProperty('--accent', theme.accent);
  localStorage.setItem(THEME_KEY, theme.id);
}

function unlockAchievement(id: string): void {
  if (profile.unlockedAchievements.includes(id)) return;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return;
  profile.unlockedAchievements.push(id);
  profile.shards += def.reward;
  if (!profile.equippedTitle) profile.equippedTitle = def.titleTag;
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  refreshLobbyUI();
  showWaveBanner(`ДОСТИЖЕНИЕ: ${def.name}`, `ТИТУЛ ${def.titleTag} +${def.reward} ОСКОЛКОВ`);
}

const game = new AetherGame(canvas, {
  onHudUpdate: renderHud,
  onLevelUp: renderLevelUp,
  onGameOver: handleGameOver,
  onWaveBanner: showWaveBanner,
  onPvpHit: (dmg) => {
    coop.send({ type: 'pvp_hit', dmg });
  },
  onCoopEvent: (pkt) => {
    coop.send(pkt);
  },
  onAchievement: unlockAchievement,
  onAbyssChoice: () => {
    pauseScreen.classList.add('hidden');
    abyssScreen.classList.remove('hidden');
  },
  onReviveOffer: () => {
    pauseScreen.classList.add('hidden');
    const shardsBtn = el<HTMLButtonElement>('btn-revive-shards');
    shardsBtn.disabled = profile.shards < 50;
    el('ad-progress-box').classList.add('hidden');
    el<HTMLButtonElement>('btn-revive-ad').disabled = false;
    reviveScreen.classList.remove('hidden');
  },
  onRelicChoice: (relics) => {
    pauseScreen.classList.add('hidden');
    renderRelicChoice(relics);
  },
  onWaveReached: (wave) => {
    if (wave >= 2) trackEvent('wave_reached', { wave, mode: selectedSoloMode }, profile.playerId);
  },
  onBossKilled: (wave) => {
    trackEvent('boss_killed', { wave }, profile.playerId);
  },
});

game.setProfile(profile);

const savedSettings = loadSettings();
game.settings = savedSettings;
sound.setSoundEnabled(savedSettings.soundEnabled);
sound.setMusicEnabled(savedSettings.musicEnabled);

const savedThemeId = localStorage.getItem(THEME_KEY);
const initialTheme = THEMES.find((t) => t.id === savedThemeId) || THEMES[0];
game.setTheme(initialTheme);
applyThemeToCSS(initialTheme);

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
game.setTouchDevice(isTouch);

// ==================== CO-OP NETWORK ====================
const coop = new CoopNetwork({
  onStatus: (status, connected) => {
    el('coop-status').textContent = status;
    el('btn-coop-invite').classList.toggle('hidden', coop.role !== 'host');
    el('btn-coop-start').classList.toggle('hidden', !(coop.role === 'host' && connected));
  },
  onPeerHello: (callsign, color) => {
    game.setRemoteHello(callsign, color);
  },
  onStartMatch: (onlineMode) => {
    coopScreen.classList.add('hidden');
    titleScreen.classList.add('hidden');
    startCoopMatch('guest', onlineMode);
  },
  onPacket: (data) => {
    if (data.type === 'pvp_hit') {
      game.applyRemoteHit(Number(data.dmg ?? 20));
    } else {
      game.applyCoopPacket(data);
    }
  },
  onDisconnect: () => {
    stopCoopLoop();
    game.setCoopRole('none');
  },
});

function startCoopMatch(role: 'host' | 'guest', onlineMode: 'coop' | 'pvp'): void {
  game.setCoopRole(role);
  game.setMode(onlineMode);
  game.setProfile(profile);
  game.startNewGame();
  trackEvent('run_start', { mode: onlineMode, ship: profile.selectedShip }, profile.playerId);
  stopCoopLoop();
  coopSyncTimer = window.setInterval(() => {
    if (game.state !== 'title' && game.state !== 'gameover' && coop.isConnected) {
      coop.sendState(game.getCoopSyncPacket());
    }
  }, 45);
}

function stopCoopLoop(): void {
  if (coopSyncTimer !== null) {
    clearInterval(coopSyncTimer);
    coopSyncTimer = null;
  }
}

// ==================== LOBBY & PROFILE UI ====================
function refreshLobbyUI(): void {
  const callsignInput = el<HTMLInputElement>('pilot-callsign');
  callsignInput.value = profile.callsign;

  const pilotHeader = el('pilot-header');
  pilotHeader.classList.remove('frame-cyber', 'frame-gold', 'frame-void');
  if (profile.selectedFrame !== 'default') {
    pilotHeader.classList.add(`frame-${profile.selectedFrame}`);
  }

  const clanEl = el('pilot-clan-tag');
  if (profile.clanTag) {
    clanEl.textContent = `[${profile.clanTag}]`;
    clanEl.classList.remove('hidden');
  } else {
    clanEl.classList.add('hidden');
  }

  const rank = getPilotRank(profile.totalScore);
  const rankEl = el('pilot-rank');
  rankEl.textContent = rank.title;
  rankEl.style.color = rank.color;

  el('pilot-shards').textContent = String(profile.shards);
  el('hangar-shards').textContent = String(profile.shards);

  const ship = SHIP_CLASSES.find((s) => s.id === profile.selectedShip) || SHIP_CLASSES[0];
  el('selected-ship-badge').textContent = ship.name;
  el('hero-ship-name').textContent = ship.name;
  el('hero-ship-ulti').textContent = `Ульта: ${ship.ultiName}`;
  el('hud-ulti-name').innerHTML = `${ICONS.bolt} ${ship.ultiName}`;

  const previewCanvas = document.getElementById('ship-preview-canvas') as HTMLCanvasElement | null;
  if (previewCanvas) {
    drawShipPreview(previewCanvas, ship.id, game.theme);
  }

  const titleEl = el('pilot-title-tag');
  if (profile.equippedTitle) {
    const ach = ACHIEVEMENTS.find((a) => a.titleTag === profile.equippedTitle);
    titleEl.textContent = profile.equippedTitle;
    titleEl.style.color = ach?.color || '#ffb703';
    titleEl.classList.remove('hidden');
  } else {
    titleEl.classList.add('hidden');
  }

  const mutPill = el('mutator-desc-pill');
  if (selectedSoloMode === 'mutator') {
    const mut = getWeeklyMutator();
    mutPill.innerHTML = `<b>${mut.name}</b> · ${mut.description}`;
    mutPill.classList.remove('hidden');
  } else {
    mutPill.classList.add('hidden');
  }

  el('btn-capsule').classList.toggle('claimed', profile.capsuleClaimedToday);

  const hasClaimable =
    !profile.dailyClaimedToday || profile.quests.some((q) => q.progress >= q.target && !q.claimed);
  el('quest-dot').classList.toggle('hidden', !hasClaimable);

  const curTier = getSeasonTier(profile.seasonXp);
  const hasPassClaim = SEASON_PASS_TIERS.some(
    (t) =>
      t.tier <= curTier &&
      (!profile.claimedFreeTiers.includes(t.tier) ||
        (profile.seasonPremium && !profile.claimedPremiumTiers.includes(t.tier)))
  );
  el('pass-dot').classList.toggle('hidden', !hasPassClaim);
}

el<HTMLInputElement>('pilot-callsign').addEventListener('change', (e) => {
  const val = (e.target as HTMLInputElement).value.trim().toUpperCase().slice(0, 14) || 'ПИЛОТ';
  profile.callsign = val;
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  refreshLobbyUI();
});

const themeGrid = el<HTMLDivElement>('theme-grid');
function renderThemes(): void {
  themeGrid.innerHTML = '';
  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.className = `theme-dot-btn ${game.theme.id === t.id ? 'active' : ''}`;
    btn.title = t.name;
    btn.style.background = `linear-gradient(135deg, ${t.primary}, ${t.accent})`;
    btn.onclick = () => {
      game.setTheme(t);
      applyThemeToCSS(t);
      renderThemes();
      refreshLobbyUI();
    };
    themeGrid.appendChild(btn);
  }
}
renderThemes();
refreshLobbyUI();

// ==================== HANGAR & COSMETICS MODAL ====================
function renderHangar(): void {
  el('hangar-shards').textContent = String(profile.shards);
  const shipsList = el('ships-list');
  shipsList.innerHTML = '';

  for (const ship of SHIP_CLASSES) {
    const unlocked = profile.unlockedShips.includes(ship.id);
    const selected = profile.selectedShip === ship.id;
    const item = document.createElement('div');
    item.className = `hangar-item ${selected ? 'selected' : ''}`;
    item.innerHTML = `
      <div class="hangar-info">
        <h4>${ship.name} <span class="rank-pill">${ship.role}</span></h4>
        <p>${ship.perkText}</p>
      </div>
    `;

    const btn = document.createElement('button');
    if (selected) {
      btn.className = 'mini-btn secondary';
      btn.textContent = 'ВЫБРАН';
      btn.disabled = true;
    } else if (unlocked) {
      btn.className = 'mini-btn';
      btn.textContent = 'ВЫБРАТЬ';
      btn.onclick = () => {
        profile.selectedShip = ship.id;
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        renderHangar();
        refreshLobbyUI();
      };
    } else {
      btn.className = 'mini-btn';
      btn.innerHTML = `ОТКРЫТЬ ${ship.cost} ${ICONS.shard}`;
      btn.disabled = profile.shards < ship.cost;
      btn.onclick = () => {
        if (profile.shards >= ship.cost) {
          profile.shards -= ship.cost;
          profile.unlockedShips.push(ship.id);
          profile.selectedShip = ship.id;
          saveProfile(profile);
          void saveCloudProfile(profile, tgInitData);
          sound.playLevelUp();
          renderHangar();
          refreshLobbyUI();
        }
      };
    }
    item.appendChild(btn);
    shipsList.appendChild(item);
  }

  const metaList = el('meta-list');
  metaList.innerHTML = '';
  for (const m of META_UPGRADES) {
    const lvl = profile.metaLevels[m.id] || 0;
    const isMax = lvl >= m.maxLevel;
    const cost = getMetaCost(m, lvl);
    const item = document.createElement('div');
    item.className = 'hangar-item';
    item.innerHTML = `
      <div class="hangar-info">
        <h4>${m.icon} ${m.name} (${lvl}/${m.maxLevel})</h4>
        <p>${m.description}</p>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    if (isMax) {
      btn.textContent = 'МАКС.';
      btn.disabled = true;
    } else {
      btn.innerHTML = `${cost} ${ICONS.shard}`;
      btn.disabled = profile.shards < cost;
      btn.onclick = () => {
        if (profile.shards >= cost) {
          profile.shards -= cost;
          profile.metaLevels[m.id] = lvl + 1;
          saveProfile(profile);
          void saveCloudProfile(profile, tgInitData);
          sound.playLevelUp();
          renderHangar();
          refreshLobbyUI();
        }
      };
    }
    item.appendChild(btn);
    metaList.appendChild(item);
  }
}

function renderCosmetics(): void {
  el('hangar-shards').textContent = String(profile.shards);
  const pane = el('hangar-cosmetics-pane');
  pane.innerHTML = '';

  const buildSection = <T extends string>(
    title: string,
    defs: Array<{ id: T; name: string; cost: number; previewColor: string; description: string }>,
    unlockedList: T[],
    selectedId: T,
    onEquip: (id: T) => void,
    onBuy: (id: T, cost: number) => void
  ) => {
    const secLabel = document.createElement('div');
    secLabel.className = 'section-label';
    secLabel.textContent = title;
    pane.appendChild(secLabel);

    const grid = document.createElement('div');
    grid.className = 'cosmetic-grid';
    for (const item of defs) {
      const owned = unlockedList.includes(item.id);
      const eq = selectedId === item.id;
      const row = document.createElement('div');
      row.className = `cosmetic-chip ${eq ? 'selected' : ''}`;
      row.innerHTML = `
        <div class="hangar-info">
          <h4><span class="cosmetic-swatch" style="background:${item.previewColor}"></span>${item.name}</h4>
          <p>${item.description}</p>
        </div>
      `;
      const btn = document.createElement('button');
      if (eq) {
        btn.className = 'mini-btn secondary';
        btn.textContent = 'НАДЕТО';
        btn.disabled = true;
      } else if (owned) {
        btn.className = 'mini-btn';
        btn.textContent = 'ВЫБРАТЬ';
        btn.onclick = () => onEquip(item.id);
      } else {
        btn.className = 'mini-btn';
        btn.innerHTML = `${item.cost} ${ICONS.shard}`;
        btn.disabled = profile.shards < item.cost;
        btn.onclick = () => onBuy(item.id, item.cost);
      }
      row.appendChild(btn);
      grid.appendChild(row);
    }
    pane.appendChild(grid);
  };

  buildSection<TrailId>(
    'СЛЕДЫ ДВИГАТЕЛЯ',
    TRAIL_DEFS,
    profile.unlockedTrails,
    profile.selectedTrail,
    (id) => {
      profile.selectedTrail = id;
      saveProfile(profile);
      void saveCloudProfile(profile, tgInitData);
      renderCosmetics();
    },
    (id, cost) => {
      if (profile.shards >= cost) {
        profile.shards -= cost;
        profile.unlockedTrails.push(id);
        profile.selectedTrail = id;
        sound.playLevelUp();
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        refreshLobbyUI();
        renderCosmetics();
      }
    }
  );

  buildSection<ExplosionStyleId>(
    'СТИЛЬ ВЗРЫВОВ ВРАГОВ',
    EXPLOSION_DEFS,
    profile.unlockedExplosions,
    profile.selectedExplosion,
    (id) => {
      profile.selectedExplosion = id;
      saveProfile(profile);
      void saveCloudProfile(profile, tgInitData);
      renderCosmetics();
    },
    (id, cost) => {
      if (profile.shards >= cost) {
        profile.shards -= cost;
        profile.unlockedExplosions.push(id);
        profile.selectedExplosion = id;
        sound.playLevelUp();
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        refreshLobbyUI();
        renderCosmetics();
      }
    }
  );

  buildSection<FrameId>(
    'РАМКА ПРОФИЛЯ',
    FRAME_DEFS,
    profile.unlockedFrames,
    profile.selectedFrame,
    (id) => {
      profile.selectedFrame = id;
      saveProfile(profile);
      void saveCloudProfile(profile, tgInitData);
      refreshLobbyUI();
      renderCosmetics();
    },
    (id, cost) => {
      if (profile.shards >= cost) {
        profile.shards -= cost;
        profile.unlockedFrames.push(id);
        profile.selectedFrame = id;
        sound.playLevelUp();
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        refreshLobbyUI();
        renderCosmetics();
      }
    }
  );
}

// ==================== SEASON BATTLE PASS ====================
function renderSeasonPass(): void {
  const s = getSeasonInfo();
  const tier = getSeasonTier(profile.seasonXp);
  const xpIntoTier = profile.seasonXp % SEASON_XP_PER_TIER;
  el('pass-season-title').textContent = s.name;
  el('pass-days-left').textContent = `${s.daysLeft} ДН.`;
  el('pass-tier-label').textContent = `УРОВЕНЬ ${tier} / 10`;
  el('pass-xp-text').textContent = tier >= 10 ? 'МАКС.' : `${xpIntoTier} / ${SEASON_XP_PER_TIER} XP`;
  el('pass-xp-bar').style.width = tier >= 10 ? '100%' : `${(xpIntoTier / SEASON_XP_PER_TIER) * 100}%`;

  const premBtn = el<HTMLButtonElement>('btn-buy-pass-prem');
  if (profile.seasonPremium) {
    premBtn.innerHTML = `${ICONS.crown} АКТИВЕН`;
    premBtn.disabled = true;
  } else if (TG_STARS_PASS_INVOICE && tgInitData) {
    premBtn.innerHTML = `${ICONS.crown} ПРЕМИУМ (STARS)`;
    premBtn.disabled = false;
  } else {
    premBtn.innerHTML = `${ICONS.crown} ПРЕМИУМ 400 ${ICONS.shard}`;
    premBtn.disabled = profile.shards < 400;
  }

  const list = el('pass-tiers-list');
  list.innerHTML = '';

  for (const t of SEASON_PASS_TIERS) {
    const reached = tier >= t.tier;
    const freeClaimed = profile.claimedFreeTiers.includes(t.tier);
    const premClaimed = profile.claimedPremiumTiers.includes(t.tier);

    const row = document.createElement('div');
    row.className = `pass-tier-row ${reached ? 'reached' : ''}`;
    row.innerHTML = `
      <div class="pass-tier-head">
        <span>ЭТАП ${t.tier}</span>
        <span>${t.tier * SEASON_XP_PER_TIER} XP</span>
      </div>
    `;

    const tracks = document.createElement('div');
    tracks.className = 'pass-tracks';

    const freeBox = document.createElement('div');
    freeBox.className = 'pass-track-box';
    freeBox.innerHTML = `<div>БЕСПЛАТНО: <b>${t.freeLabel}</b></div>`;
    const freeBtn = document.createElement('button');
    freeBtn.className = freeClaimed ? 'mini-btn secondary' : 'mini-btn';
    if (freeClaimed) {
      freeBtn.textContent = 'ПОЛУЧЕНО';
      freeBtn.disabled = true;
    } else if (reached) {
      freeBtn.textContent = 'ЗАБРАТЬ';
      freeBtn.onclick = () => {
        profile.claimedFreeTiers.push(t.tier);
        applyCosmeticReward(profile, t.freeReward);
        sound.playLevelUp();
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        trackEvent('pass_tier_claimed', { tier: t.tier, track: 'free' }, profile.playerId);
        refreshLobbyUI();
        renderSeasonPass();
      };
    } else {
      freeBtn.textContent = 'ЗАКРЫТО';
      freeBtn.disabled = true;
    }
    freeBox.appendChild(freeBtn);

    const premBox = document.createElement('div');
    premBox.className = 'pass-track-box prem';
    premBox.innerHTML = `<div>ПРЕМИУМ: <b>${t.premLabel}</b></div>`;
    const premTrackBtn = document.createElement('button');
    premTrackBtn.className = premClaimed ? 'mini-btn secondary' : 'mini-btn';
    if (premClaimed) {
      premTrackBtn.textContent = 'ПОЛУЧЕНО';
      premTrackBtn.disabled = true;
    } else if (reached && profile.seasonPremium) {
      premTrackBtn.textContent = 'ЗАБРАТЬ';
      premTrackBtn.onclick = () => {
        profile.claimedPremiumTiers.push(t.tier);
        applyCosmeticReward(profile, t.premReward);
        sound.playLevelUp();
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        trackEvent('pass_tier_claimed', { tier: t.tier, track: 'premium' }, profile.playerId);
        refreshLobbyUI();
        renderSeasonPass();
      };
    } else {
      premTrackBtn.textContent = profile.seasonPremium ? 'ЗАКРЫТО' : 'НУЖЕН ПРЕМИУМ';
      premTrackBtn.disabled = true;
    }
    premBox.appendChild(premTrackBtn);

    tracks.appendChild(freeBox);
    tracks.appendChild(premBox);
    row.appendChild(tracks);
    list.appendChild(row);
  }
}

el('btn-buy-pass-prem').onclick = async () => {
  if (profile.seasonPremium) return;
  if (TG_STARS_PASS_INVOICE && tgInitData) {
    const res = await openTelegramStarsInvoice(TG_STARS_PASS_INVOICE);
    if (res === 'paid') {
      profile.seasonPremium = true;
      sound.playLevelUp();
      saveProfile(profile);
      void saveCloudProfile(profile, tgInitData);
      refreshLobbyUI();
      renderSeasonPass();
      return;
    }
    if (res === 'cancelled' || res === 'failed') return;
  }
  if (profile.shards >= 400) {
    profile.shards -= 400;
    profile.seasonPremium = true;
    sound.playLevelUp();
    saveProfile(profile);
    void saveCloudProfile(profile, tgInitData);
    refreshLobbyUI();
    renderSeasonPass();
  }
};

// ==================== DAILY QUESTS & TITLES ====================
function renderQuests(): void {
  const bonusBox = el('daily-bonus-box');
  const reward = 35 + profile.streakDays * 15;
  bonusBox.innerHTML = `
    <div>
      <strong style="font-family:'Exo 2',sans-serif;">ЕЖЕДНЕВНЫЙ БОНУС (ДЕНЬ ${profile.streakDays})</strong>
      <div style="font-size:0.78rem;color:var(--text-dim);">Заходи каждый день за наградой!</div>
    </div>
  `;
  const bonusBtn = document.createElement('button');
  bonusBtn.className = 'mini-btn';
  if (profile.dailyClaimedToday) {
    bonusBtn.textContent = 'ПОЛУЧЕНО';
    bonusBtn.disabled = true;
  } else {
    bonusBtn.innerHTML = `ЗАБРАТЬ +${reward} ${ICONS.shard}`;
    bonusBtn.onclick = () => {
      profile.dailyClaimedToday = true;
      profile.shards += reward;
      profile.seasonXp += 45;
      saveProfile(profile);
      void saveCloudProfile(profile, tgInitData);
      sound.playLevelUp();
      renderQuests();
      refreshLobbyUI();
    };
  }
  bonusBox.appendChild(bonusBtn);

  const qList = el('quests-list');
  qList.innerHTML = '';
  for (const q of profile.quests) {
    const pct = Math.min(100, (q.progress / q.target) * 100);
    const done = q.progress >= q.target;
    const item = document.createElement('div');
    item.className = 'quest-item';
    item.innerHTML = `
      <div style="flex:1;">
        <div style="font-family:'Exo 2',sans-serif;font-weight:700;font-size:0.88rem;">${q.title}</div>
        <div style="font-size:0.74rem;color:var(--text-dim);">${Math.min(q.progress, q.target)} / ${q.target}</div>
        <div class="quest-prog-track"><div class="quest-prog-fill" style="width:${pct}%"></div></div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    if (q.claimed) {
      btn.textContent = 'ГОТОВО';
      btn.disabled = true;
    } else if (done) {
      btn.innerHTML = `+${q.reward} ${ICONS.shard}`;
      btn.onclick = () => {
        q.claimed = true;
        profile.shards += q.reward;
        profile.seasonXp += 60;
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        sound.playLevelUp();
        renderQuests();
        refreshLobbyUI();
      };
    } else {
      btn.className = 'mini-btn secondary';
      btn.innerHTML = `${q.reward} ${ICONS.shard}`;
      btn.disabled = true;
    }
    item.appendChild(btn);
    qList.appendChild(item);
  }
}

function renderTitlesModal(): void {
  const list = el('titles-list');
  list.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const unlocked = profile.unlockedAchievements.includes(a.id);
    const equipped = profile.equippedTitle === a.titleTag;
    const item = document.createElement('div');
    item.className = 'quest-item';
    item.innerHTML = `
      <div style="flex:1;">
        <div style="font-family:'Exo 2',sans-serif;font-weight:700;font-size:0.88rem;color:${a.color}">${a.titleTag} ${a.name}</div>
        <div style="font-size:0.74rem;color:var(--text-dim);">${a.description} (+${a.reward} Оск.)</div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = equipped ? 'mini-btn secondary' : 'mini-btn';
    if (!unlocked) {
      btn.textContent = 'ЗАКРЫТО';
      btn.disabled = true;
    } else if (equipped) {
      btn.textContent = 'НАДЕТО';
      btn.disabled = true;
    } else {
      btn.textContent = 'НАДЕТЬ';
      btn.onclick = () => {
        profile.equippedTitle = a.titleTag;
        saveProfile(profile);
        void saveCloudProfile(profile, tgInitData);
        renderTitlesModal();
        refreshLobbyUI();
      };
    }
    item.appendChild(btn);
    list.appendChild(item);
  }
}

// ==================== SOCIAL / CLANS / FRIENDS ====================
function renderSocialPane(): void {
  el<HTMLInputElement>('clan-tag-input').value = profile.clanTag || '';
  el('ref-code-display').textContent = profile.referralCode;
  el('ref-count-display').textContent = String(profile.referralsCount);

  const chipWrap = el('friends-chip-list');
  chipWrap.innerHTML = '';
  if (profile.friends.length === 0) {
    chipWrap.innerHTML = '<span style="font-size:0.75rem;color:var(--text-dim);">Добавь позывной друга для таблицы «Друзья»</span>';
    return;
  }
  for (const f of profile.friends) {
    const chip = document.createElement('button');
    chip.className = 'upg-chip';
    chip.style.cursor = 'pointer';
    chip.title = 'Удалить из друзей';
    chip.textContent = `${f} ×`;
    chip.onclick = () => {
      profile.friends = profile.friends.filter((x) => x !== f);
      saveProfile(profile);
      void saveCloudProfile(profile, tgInitData);
      renderSocialPane();
    };
    chipWrap.appendChild(chip);
  }
}

el('btn-save-clan').onclick = () => {
  const tag = sanitizeClanTag(el<HTMLInputElement>('clan-tag-input').value);
  profile.clanTag = tag;
  el<HTMLInputElement>('clan-tag-input').value = tag;
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  refreshLobbyUI();
  const btn = el('btn-save-clan');
  btn.textContent = 'СОХРАНЕНО!';
  window.setTimeout(() => (btn.textContent = 'СОХРАНИТЬ'), 1400);
};

el('btn-add-friend').onclick = () => {
  const inp = el<HTMLInputElement>('friend-add-input');
  const val = inp.value.trim().toUpperCase().slice(0, 14);
  if (!val || val === profile.callsign || profile.friends.includes(val)) return;
  profile.friends = [...profile.friends, val].slice(0, 20);
  inp.value = '';
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  renderSocialPane();
};

el('btn-invite-ref').onclick = () => {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const url = TG_BOT_APP
    ? `https://t.me/${TG_BOT_APP}?startapp=ref_${profile.referralCode}`
    : `${baseUrl}?ref=${profile.referralCode}`;
  void shareOrCopy(
    'AETHER RIFT — Приглашение в бой',
    `Залетай в космический рогалик AETHER RIFT по моему коду ${profile.referralCode} и забери +60 Осколков на старт:`,
    url,
    el('btn-invite-ref'),
    `${ICONS.share} ОТПРАВИТЬ ССЫЛКУ`
  );
};

// ==================== SETTINGS & HUD ====================
function renderSettingsInto(container: HTMLElement): void {
  const items: Array<{ key: keyof GameSettings; label: string }> = [
    { key: 'autoFire', label: 'Авто-огонь плазма-пушек' },
    { key: 'soundEnabled', label: 'Синтезированные звуки' },
    { key: 'musicEnabled', label: 'Адаптивный синтвейв' },
    { key: 'bloomEnabled', label: 'Неоновое свечение (Bloom)' },
    { key: 'screenShake', label: 'Тряска экрана при взрывах' },
  ];

  container.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const on = game.settings[item.key];
    row.innerHTML = `
      <span>${item.label}</span>
      <span class="toggle-pill ${on ? 'on' : ''}">${on ? 'ВКЛ' : 'ВЫКЛ'}</span>
    `;
    row.onclick = () => {
      game.settings[item.key] = !game.settings[item.key];
      if (item.key === 'soundEnabled') sound.setSoundEnabled(game.settings.soundEnabled);
      if (item.key === 'musicEnabled') sound.setMusicEnabled(game.settings.musicEnabled);
      saveSettings(game.settings);
      renderSettingsInto(el('title-settings'));
      renderSettingsInto(el('pause-settings'));
      updateMuteIcon();
    };
    container.appendChild(row);
  }
}

function updateMuteIcon(): void {
  el('btn-mute').innerHTML = game.settings.soundEnabled || game.settings.musicEnabled ? ICONS.soundOn : ICONS.soundOff;
}

function renderHud(hud: HudSnapshot): void {
  const showHud =
    hud.state === 'playing' ||
    hud.state === 'paused' ||
    hud.state === 'levelup' ||
    hud.state === 'modal';
  hudEl.classList.toggle('hidden', !showHud);
  const otherModalOpen =
    !reviveScreen.classList.contains('hidden') ||
    !relicScreen.classList.contains('hidden') ||
    !abyssScreen.classList.contains('hidden') ||
    !levelupScreen.classList.contains('hidden');
  pauseScreen.classList.toggle('hidden', hud.state !== 'paused' || otherModalOpen);
  if (isTouch) {
    touchLayer.classList.toggle('hidden', hud.state !== 'playing');
  }
  if (hud.state === 'playing') {
    yandexGameplayStart();
  } else {
    yandexGameplayStop();
  }

  const vitals = el('hud-vitals');
  const hpPct = Math.max(0, Math.min(1, hud.hp / Math.max(1, hud.maxHp)));
  el('hp-bar').style.width = `${hpPct * 100}%`;
  el('hp-trail-bar').style.width = `${hpPct * 100}%`;
  el('hp-text').textContent = `${hud.hp} / ${hud.maxHp}`;

  vitals.classList.remove('hp-state-high', 'hp-state-mid', 'hp-state-low');
  vitals.classList.add(hpPct > 0.6 ? 'hp-state-high' : hpPct > 0.3 ? 'hp-state-mid' : 'hp-state-low');
  el('hp-label').innerHTML = `${ICONS.hp} ${hpPct <= 0.3 ? 'КРИТ. ХП!' : 'ХП КОРАБЛЯ'}`;

  if (hud.state === 'playing') {
    if (lastHudHp !== -1 && hud.hp !== lastHudHp) {
      vitals.classList.remove('hp-hit', 'hp-heal');
      vitals.classList.add(hud.hp < lastHudHp ? 'hp-hit' : 'hp-heal');
      if (hpFlashTimer !== null) clearTimeout(hpFlashTimer);
      hpFlashTimer = window.setTimeout(() => vitals.classList.remove('hp-hit', 'hp-heal'), 280);
    }
    lastHudHp = hud.hp;
  } else {
    lastHudHp = -1;
  }

  el('lvl-label').textContent = `ОПЫТ · УР. ${hud.level}`;
  el('xp-bar').style.width = `${Math.min(100, (hud.xp / hud.xpToNext) * 100)}%`;
  el('hud-mode-label').textContent =
    hud.mode === 'pvp' ? 'ДУЭЛЬ' : hud.mode === 'daily' ? 'ДЕНЬ' : hud.mode === 'mutator' ? 'МУТАТОР' : 'ВОЛНА';
  el('hud-wave').textContent = hud.mode === 'pvp' ? '1v1' : String(hud.wave).padStart(2, '0');
  el('wave-prog-bar').style.width = `${Math.round(hud.waveProgress * 100)}%`;
  el('hud-score').textContent = hud.score.toLocaleString('ru-RU');

  const biomePill = el('biome-pill');
  if (hud.state === 'playing' && hud.wave >= 4 && hud.mode !== 'pvp') {
    biomePill.textContent = hud.biomeName;
    biomePill.classList.remove('hidden');
  } else {
    biomePill.classList.add('hidden');
  }

  const blitzPill = el('blitz-timer-pill');
  if (hud.mode === 'blitz') {
    blitzPill.classList.remove('hidden');
    const mins = Math.floor(hud.blitzTimer / 60);
    const secs = String(hud.blitzTimer % 60).padStart(2, '0');
    blitzPill.textContent = `${String(mins).padStart(2, '0')}:${secs}`;
  } else {
    blitzPill.classList.add('hidden');
  }

  el('overclock-pill').classList.toggle('hidden', hud.overclockTimer <= 0);

  const comboBadge = el('combo-badge');
  if (hud.combo >= 3) {
    comboBadge.classList.remove('hidden');
    const mult = Math.min(8, 1 + Math.floor(hud.combo / 5));
    el('combo-mult').textContent = `x${mult}`;
    el('combo-count').textContent = `${hud.combo} УДАР.`;
  } else {
    comboBadge.classList.add('hidden');
  }

  const bossWrap = el('boss-bar-wrap');
  if (hud.boss) {
    bossWrap.classList.remove('hidden');
    el('boss-name').textContent = hud.boss.name;
    el('boss-bar').style.width = `${(hud.boss.hp / hud.boss.maxHp) * 100}%`;
  } else {
    bossWrap.classList.add('hidden');
  }

  el('dash-bar').style.width = `${hud.dashReadyRatio * 100}%`;
  el('btn-dash').classList.toggle('ready', hud.dashReadyRatio >= 0.99);

  el('nova-bar').style.width = `${hud.novaCharge}%`;
  el('btn-nova').classList.toggle('ready', hud.novaCharge >= 100);

  const strip = el('upgrade-strip');
  const entries = Object.entries(hud.acquiredUpgrades);
  strip.innerHTML = entries
    .map(([id, count]) => {
      const def = UPGRADES.find((u) => u.id === id);
      return def ? `<div class="upg-chip" title="${def.name}">${def.icon} ×${count}</div>` : '';
    })
    .join('');
}

function renderLevelUp(choices: UpgradeDef[], acquired: Record<string, number>): void {
  activeUpgradeChoices = choices;
  const container = el('upgrade-cards');
  container.innerHTML = '';

  choices.forEach((u, idx) => {
    const rank = (acquired[u.id] || 0) + 1;
    const card = document.createElement('button');
    card.className = `upgrade-card rarity-${u.rarity}`;
    card.innerHTML = `
      <div class="card-top">
        <span class="card-icon">${u.icon}</span>
        <span class="card-tag">${u.tag} · [${idx + 1}]</span>
      </div>
      <h3>${u.name}</h3>
      <p>${u.description}</p>
      <div class="card-rank">УРОВЕНЬ ${rank} / ${u.maxStacks}</div>
    `;
    card.onclick = () => selectUpgrade(u.id);
    container.appendChild(card);
  });

  levelupScreen.classList.remove('hidden');
}

function selectUpgrade(id: string): void {
  levelupScreen.classList.add('hidden');
  activeUpgradeChoices = [];
  game.applyUpgrade(id);
}

function renderRelicChoice(relics: RelicId[]): void {
  activeRelicChoices = relics;
  const container = el('relic-cards');
  container.innerHTML = '';

  relics.forEach((rId, idx) => {
    const def = BOSS_RELICS.find((b) => b.id === rId);
    if (!def) return;
    const card = document.createElement('button');
    card.className = 'upgrade-card relic-card';
    card.innerHTML = `
      <div class="card-top">
        <span class="card-icon">${def.icon}</span>
        <span class="card-tag">${def.tag} · [${idx + 1}]</span>
      </div>
      <h3>${def.name}</h3>
      <p>${def.description}</p>
      <div class="card-rank">НАЖМИ ЧТОБЫ ВЫБРАТЬ</div>
    `;
    card.onclick = () => pickRelic(def.id);
    container.appendChild(card);
  });

  relicScreen.classList.remove('hidden');
}

function pickRelic(id: RelicId): void {
  relicScreen.classList.add('hidden');
  activeRelicChoices = [];
  trackEvent('relic_picked', { relic: id }, profile.playerId);
  game.applyRelic(id);
}

function showWaveBanner(title: string, subtitle: string): void {
  el('wave-banner-title').textContent = title;
  el('wave-banner-sub').textContent = subtitle;
  waveBanner.classList.remove('hidden');
  if (waveBannerTimer) clearTimeout(waveBannerTimer);
  waveBannerTimer = window.setTimeout(() => {
    waveBanner.classList.add('hidden');
  }, 2600);
}

function handleGameOver(summary: {
  score: number;
  wave: number;
  kills: number;
  maxCombo: number;
  shards: number;
  durationSec: number;
  victory?: boolean;
  mode: GameMode;
  upgrades: Record<string, number>;
}): void {
  stopCoopLoop();
  if (recorder.isRecording) recorder.stop();

  const seasonXpGain = Math.max(25, Math.round(summary.kills * 2 + summary.wave * 35 + (summary.victory ? 180 : 0)));
  profile.shards += summary.shards;
  profile.seasonXp += seasonXpGain;
  profile.totalKills += summary.kills;
  profile.totalScore += summary.score;
  profile.totalRuns += 1;

  for (const q of profile.quests) {
    if (q.metric === 'kills') q.progress += summary.kills;
    if (q.metric === 'wave') q.progress = Math.max(q.progress, summary.wave);
    if (q.metric === 'combo') q.progress = Math.max(q.progress, summary.maxCombo);
  }
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  void saveYandexCloudProfile(profile);
  refreshLobbyUI();

  const shipDef = SHIP_CLASSES.find((s) => s.id === profile.selectedShip) || SHIP_CLASSES[0];
  void submitYandexLeaderboardScore(summary.score);
  pendingScoreSubmit = submitGlobalScore(
    {
      player_id: profile.playerId,
      callsign: profile.callsign,
      clan_tag: profile.clanTag,
      score: summary.score,
      wave: summary.wave,
      mode: summary.mode,
      ship: shipDef.name,
      duration_sec: summary.durationSec,
    },
    tgInitData
  ).then(() => {});

  trackEvent(
    'run_end',
    {
      score: summary.score,
      wave: summary.wave,
      durationSec: summary.durationSec,
      victory: Boolean(summary.victory),
      mode: summary.mode,
    },
    profile.playerId
  );

  const isNewRecord = saveScore({
    score: summary.score,
    wave: summary.wave,
    kills: summary.kills,
    maxCombo: summary.maxCombo,
    theme: game.theme.name,
    date: new Date().toLocaleDateString('ru-RU'),
  });

  if (summary.victory && summary.mode === 'pvp') {
    unlockAchievement('ach_duel');
  }

  lastRunScore = summary.score;
  lastRunEarnedShards = summary.shards;
  doubledShardsUsed = false;

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const cleanCallsign = encodeURIComponent(profile.callsign.replace(/[^A-ZА-Я0-9_-]/gi, ''));
  lastChallengeUrl = TG_BOT_APP
    ? `https://t.me/${TG_BOT_APP}?startapp=chal_${summary.score}_${cleanCallsign}`
    : `${baseUrl}?challenge=${summary.score}&by=${encodeURIComponent(profile.callsign)}`;

  el('go-title').textContent = summary.victory ? 'ПОБЕДА' : 'СИГНАЛ ПОТЕРЯН';
  el('new-record-badge').classList.toggle('hidden', !isNewRecord);
  el('go-shards').textContent = `+${summary.shards}`;
  el('go-ad-status').classList.add('hidden');

  const dblBtn = el<HTMLButtonElement>('btn-double-shards');
  dblBtn.disabled = summary.shards <= 0;
  dblBtn.innerHTML = `${ICONS.video} x2 ОСКОЛКИ ЗА РЕКЛАМУ (+${summary.shards})`;

  el('go-score').textContent = summary.score.toLocaleString('ru-RU');
  el('go-wave').textContent = String(summary.wave);
  el('go-kills').textContent = String(summary.kills);
  el('go-combo').textContent = `${summary.maxCombo}x`;

  const upgEl = el('go-upgrades');
  upgEl.innerHTML = Object.entries(summary.upgrades)
    .map(([id, count]) => {
      const def = UPGRADES.find((u) => u.id === id);
      return def ? `<span class="upg-chip">${def.icon} ${def.name} ×${count}</span>` : '';
    })
    .join('');

  gameoverScreen.classList.remove('hidden');
}

async function renderScoresModal(): Promise<void> {
  const container = el('scores-list');
  if (activeLbTab === 'local') {
    const list = loadScores();
    if (list.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:20px;">Пока нет рекордов. Начни первый вылет!</p>';
      return;
    }
    container.innerHTML = list
      .map(
        (s, i) => `
        <div class="score-row">
          <span>#${i + 1} · Волна ${s.wave} · ${s.kills} сбито (${s.theme})</span>
          <strong>${s.score.toLocaleString('ru-RU')}</strong>
        </div>`
      )
      .join('');
    return;
  }

  if (activeLbTab === 'clans') {
    container.innerHTML = '<p style="color:var(--text-dim);padding:20px;">Загрузка эскадрилий...</p>';
    if (pendingScoreSubmit) {
      await pendingScoreSubmit.catch(() => {});
    }
    const clans = await fetchClanLeaderboard(profile.clanTag);
    if (clans.length === 0) {
      container.innerHTML =
        '<p style="color:var(--text-dim);padding:20px;">Кланов пока нет! Укажи тег эскадрильи в разделе «Онлайн → Клан и Друзья».</p>';
      return;
    }
    container.innerHTML = clans
      .map(
        (c, i) => `
        <div class="score-row" style="${c.isSelf ? 'border:1px solid var(--primary);' : ''}">
          <span>#${i + 1} · <b>[${c.clanTag}]</b> · Участн.: ${c.members} · Волна ${c.bestWave}</span>
          <strong>${c.totalScore.toLocaleString('ru-RU')}</strong>
        </div>`
      )
      .join('');
    return;
  }

  container.innerHTML = '<p style="color:var(--text-dim);padding:20px;">Загрузка рейтинга...</p>';
  if (pendingScoreSubmit) {
    await pendingScoreSubmit.catch(() => {});
  }
  const filterMode = activeLbTab === 'friends' ? 'friends' : activeLbTab === 'daily' ? 'daily' : 'all';
  const rows = await fetchGlobalLeaderboard(filterMode, profile.playerId, profile.callsign, profile.friends);
  if (rows.length === 0) {
    container.innerHTML =
      activeLbTab === 'friends'
        ? '<p style="color:var(--text-dim);padding:20px;">Добавь позывные друзей в меню «Онлайн → Клан и Друзья», чтобы видеть их рекорды здесь.</p>'
        : '<p style="color:var(--text-dim);padding:20px;">Таблица пока пуста — будь первым пилотом на сервере!</p>';
    return;
  }
  container.innerHTML = rows
    .map(
      (r, i) => `
      <div class="score-row" style="${r.isSelf ? 'border:1px solid var(--primary);' : ''}">
        <span>#${i + 1} · ${r.clan_tag ? `[${r.clan_tag}] ` : ''}<b>${r.callsign}</b> · Волна ${r.wave} (${r.ship})</span>
        <strong>${r.score.toLocaleString('ru-RU')}</strong>
      </div>`
    )
    .join('');
}

async function shareOrCopy(title: string, text: string, url: string, btn: HTMLElement, resetHtml: string): Promise<void> {
  if (tgInitData && tgApp?.openTelegramLink && !isYandexPlatform()) {
    tgApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    );
    return;
  }
  if (navigator.share && !isYandexPlatform()) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch {
      // fallback to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    btn.textContent = 'ССЫЛКА СКОПИРОВАНА!';
    setTimeout(() => (btn.innerHTML = resetHtml), 1800);
  } catch {
    // ignore
  }
}

function rollCapsuleReward(): string {
  const roll = Math.random();
  if (roll < 0.35) {
    profile.shards += 45;
    return 'Награда: +45 Эфирных Осколков!';
  }
  if (roll < 0.6) {
    profile.shards += 75;
    return 'ДЖЕКПОТ: +75 Эфирных Осколков!';
  }
  if (roll < 0.8) {
    profile.nextRunBuff = 'shield';
    return 'Награда: Стартовый Силовой Щит на следующий бой!';
  }
  profile.nextRunBuff = 'xp';
  return 'Награда: +50% Опыта на следующий бой!';
}

// ==================== BUTTON BINDINGS ====================
document.querySelectorAll('#mode-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mode-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSoloMode = (btn.getAttribute('data-mode') as GameMode) || 'classic';
    refreshLobbyUI();
  });
});

document.querySelectorAll('#hangar-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#hangar-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-hangar');
    const isCosm = tab === 'cosmetics';
    el('hangar-main-pane').classList.toggle('hidden', isCosm);
    el('hangar-cosmetics-pane').classList.toggle('hidden', !isCosm);
    if (isCosm) renderCosmetics();
    else renderHangar();
  });
});

document.querySelectorAll('#quests-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#quests-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-qt');
    const isTitles = tab === 'titles';
    el('quests-pane').classList.toggle('hidden', isTitles);
    el('titles-pane').classList.toggle('hidden', !isTitles);
    if (isTitles) renderTitlesModal();
    else renderQuests();
  });
});

document.querySelectorAll('#coop-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#coop-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const isSocial = btn.getAttribute('data-coop-tab') === 'social';
    el('coop-online-pane').classList.toggle('hidden', isSocial);
    el('coop-social-pane').classList.toggle('hidden', !isSocial);
    if (isSocial) renderSocialPane();
  });
});

document.querySelectorAll('#online-mode-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#online-mode-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedOnlineMode = btn.getAttribute('data-online') === 'pvp' ? 'pvp' : 'coop';
  });
});

document.querySelectorAll('#lb-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#lb-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeLbTab = (btn.getAttribute('data-lb') as typeof activeLbTab) || 'daily';
    void renderScoresModal();
  });
});

function launchSoloMission(): void {
  sound.init();
  game.setCoopRole('none');
  game.setMode(selectedSoloMode);
  game.setProfile(profile);
  titleScreen.classList.add('hidden');
  game.startNewGame();
  trackEvent('run_start', { mode: selectedSoloMode, ship: profile.selectedShip }, profile.playerId);
  const hint = document.getElementById('touch-hint-bar');
  if (hint) {
    hint.classList.remove('faded');
    window.setTimeout(() => hint.classList.add('faded'), 4000);
  }
}

el('btn-start').onclick = () => {
  if (!localStorage.getItem(TUTORIAL_KEY)) {
    tutorialScreen.classList.remove('hidden');
    return;
  }
  launchSoloMission();
};

el('btn-tutorial-go').onclick = () => {
  localStorage.setItem(TUTORIAL_KEY, '1');
  tutorialScreen.classList.add('hidden');
  launchSoloMission();
};

el('btn-hangar').onclick = () => {
  renderHangar();
  hangarScreen.classList.remove('hidden');
};
el('btn-close-hangar').onclick = () => hangarScreen.classList.add('hidden');

el('btn-pass').onclick = () => {
  renderSeasonPass();
  passScreen.classList.remove('hidden');
};
el('btn-close-pass').onclick = () => passScreen.classList.add('hidden');

el('btn-quests').onclick = () => {
  renderQuests();
  questsScreen.classList.remove('hidden');
};
el('btn-close-quests').onclick = () => questsScreen.classList.add('hidden');

const cycleUnlockedShip = (dir: number) => {
  const unlocked = SHIP_CLASSES.filter((s) => profile.unlockedShips.includes(s.id));
  if (unlocked.length <= 1) {
    renderHangar();
    hangarScreen.classList.remove('hidden');
    return;
  }
  const idx = unlocked.findIndex((s) => s.id === profile.selectedShip);
  const next = unlocked[(idx + dir + unlocked.length) % unlocked.length];
  profile.selectedShip = next.id;
  saveProfile(profile);
  refreshLobbyUI();
};
el('btn-prev-ship').onclick = () => cycleUnlockedShip(-1);
el('btn-next-ship').onclick = () => cycleUnlockedShip(1);

el('btn-capsule').onclick = () => {
  const btn = el<HTMLButtonElement>('btn-open-capsule');
  const adBtn = el<HTMLButtonElement>('btn-capsule-ad');
  const res = el('capsule-result');
  if (profile.capsuleClaimedToday) {
    res.textContent = 'Бесплатная капсула дня уже открыта!';
    btn.disabled = true;
    btn.textContent = 'ОТКРЫТО';
    adBtn.classList.toggle('hidden', profile.extraCapsuleAdToday);
    adBtn.disabled = profile.extraCapsuleAdToday;
    adBtn.innerHTML = `${ICONS.video} ЕЩЁ КАПСУЛА ЗА РЕКЛАМУ`;
  } else {
    res.textContent = 'Открой капсулу дня и получи случайный бонус!';
    btn.disabled = false;
    btn.textContent = 'ОТКРЫТЬ КАПСУЛУ';
    adBtn.classList.add('hidden');
  }
  capsuleScreen.classList.remove('hidden');
};
el('btn-close-capsule').onclick = () => capsuleScreen.classList.add('hidden');

el('btn-open-capsule').onclick = () => {
  if (profile.capsuleClaimedToday) return;
  profile.capsuleClaimedToday = true;
  const msg = rollCapsuleReward();
  sound.playLevelUp();
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  refreshLobbyUI();
  el('capsule-result').textContent = msg;
  const btn = el<HTMLButtonElement>('btn-open-capsule');
  btn.disabled = true;
  btn.textContent = 'ПОЛУЧЕНО';
  if (!profile.extraCapsuleAdToday) {
    el('btn-capsule-ad').classList.remove('hidden');
  }
};

el('btn-capsule-ad').onclick = async () => {
  if (profile.extraCapsuleAdToday) return;
  const adBtn = el<HTMLButtonElement>('btn-capsule-ad');
  adBtn.disabled = true;
  const ok = await showRewardedAd((sec) => {
    adBtn.textContent = sec > 0 ? `РЕКЛАМА: ${sec} СЕК...` : 'ОТКРЫВАЕМ...';
  }, adAudioCallbacks);
  if (ok) {
    profile.extraCapsuleAdToday = true;
    const msg = rollCapsuleReward();
    sound.playLevelUp();
    saveProfile(profile);
    void saveCloudProfile(profile, tgInitData);
    void saveYandexCloudProfile(profile);
    trackEvent('ad_watched', { slot: 'extra_capsule' }, profile.playerId);
    refreshLobbyUI();
    el('capsule-result').textContent = msg;
    adBtn.classList.add('hidden');
  } else {
    adBtn.disabled = false;
    adBtn.innerHTML = `${ICONS.video} ЕЩЁ КАПСУЛА ЗА РЕКЛАМУ`;
  }
};

el('btn-revive-ad').onclick = async () => {
  const adBtn = el<HTMLButtonElement>('btn-revive-ad');
  const box = el('ad-progress-box');
  adBtn.disabled = true;
  pauseScreen.classList.add('hidden');
  box.classList.remove('hidden');
  box.textContent = 'Загрузка рекламного блока...';

  const ok = await showRewardedAd((sec) => {
    box.textContent = sec > 0 ? `Спонсорский блок: осталось ${sec} сек...` : 'Готово! Реанимация...';
  }, adAudioCallbacks);

  if (ok) {
    trackEvent('ad_watched', { slot: 'revive' }, profile.playerId);
    reviveScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    game.revivePlayer();
  } else {
    box.textContent = 'Не удалось загрузить рекламу. Попробуй снова или используй Осколки.';
    adBtn.disabled = false;
  }
};

el('btn-revive-shards').onclick = () => {
  if (profile.shards < 50) return;
  profile.shards -= 50;
  saveProfile(profile);
  void saveCloudProfile(profile, tgInitData);
  void saveYandexCloudProfile(profile);
  refreshLobbyUI();
  reviveScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  game.revivePlayer();
};

el('btn-revive-skip').onclick = () => {
  reviveScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  game.declineRevive();
};

el('btn-double-shards').onclick = async () => {
  if (doubledShardsUsed || lastRunEarnedShards <= 0) return;
  const dblBtn = el<HTMLButtonElement>('btn-double-shards');
  const statusBox = el('go-ad-status');
  dblBtn.disabled = true;
  statusBox.classList.remove('hidden');
  statusBox.textContent = 'Загрузка рекламного блока...';

  const ok = await showRewardedAd((sec) => {
    statusBox.textContent = sec > 0 ? `Спонсорский блок: осталось ${sec} сек...` : 'Удваиваем Осколки!';
  }, adAudioCallbacks);

  if (ok) {
    doubledShardsUsed = true;
    profile.shards += lastRunEarnedShards;
    saveProfile(profile);
    void saveCloudProfile(profile, tgInitData);
    void saveYandexCloudProfile(profile);
    trackEvent('ad_watched', { slot: 'double_shards', extra: lastRunEarnedShards }, profile.playerId);
    refreshLobbyUI();
    el('go-shards').textContent = `+${lastRunEarnedShards * 2}`;
    statusBox.textContent = `Бонус +${lastRunEarnedShards} Осколков зачислен!`;
    dblBtn.textContent = 'НАГРАДА УДВОЕНА';
  } else {
    statusBox.textContent = 'Не удалось загрузить рекламу. Попробуй ещё раз.';
    dblBtn.disabled = false;
  }
};

el('btn-go-abyss').onclick = () => {
  abyssScreen.classList.add('hidden');
  game.continueToAbyss();
};
el('btn-claim-win').onclick = () => {
  abyssScreen.classList.add('hidden');
  game.finishVictory();
};

el('btn-coop').onclick = () => {
  renderSocialPane();
  coopScreen.classList.remove('hidden');
};
el('btn-close-coop').onclick = () => coopScreen.classList.add('hidden');

el('btn-coop-create').onclick = () => {
  coop.createRoom(profile.callsign, game.theme.primary);
};
el('btn-coop-invite').onclick = () => {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const url = TG_BOT_APP
    ? `https://t.me/${TG_BOT_APP}?startapp=room_${coop.roomCode}`
    : `${baseUrl}?room=${coop.roomCode}`;
  void shareOrCopy(
    'AETHER RIFT — Кооп Онлайн',
    `Залетай ко мне в космический рогалик AETHER RIFT! Комната ${coop.roomCode}:`,
    url,
    el('btn-coop-invite'),
    `${ICONS.share} ПРИГЛАСИТЬ ДРУГА`
  );
};
el('btn-coop-start').onclick = () => {
  coop.send({ type: 'start', mode: selectedOnlineMode });
  coopScreen.classList.add('hidden');
  titleScreen.classList.add('hidden');
  startCoopMatch('host', selectedOnlineMode);
};
el('btn-coop-join').onclick = () => {
  const code = el<HTMLInputElement>('coop-code-input').value;
  coop.joinRoom(code, profile.callsign, game.theme.primary);
};

el('btn-controls').onclick = () => {
  renderSettingsInto(el('title-settings'));
  controlsScreen.classList.remove('hidden');
};
el('btn-close-controls').onclick = () => controlsScreen.classList.add('hidden');

el('btn-scores').onclick = () => {
  void renderScoresModal();
  scoresScreen.classList.remove('hidden');
};
el('btn-close-scores').onclick = () => scoresScreen.classList.add('hidden');

el('btn-rec').onclick = () => {
  const btn = el('btn-rec');
  if (recorder.isRecording) {
    recorder.stop();
    return;
  }
  const started = recorder.start(
    canvas,
    (sec) => {
      if (sec === 10) {
        btn.classList.add('rec-active');
        showWaveBanner('ЗАПИСЬ КЛИПА', 'ИДЁТ ЗАХВАТ ЛУЧШЕГО МОМЕНТА (10 СЕК)');
      }
    },
    (status) => {
      btn.classList.remove('rec-active');
      if (status === 'saved' || status === 'shared') {
        trackEvent('clip_recorded', { status }, profile.playerId);
        showWaveBanner('КЛИП СОХРАНЁН', status === 'shared' ? 'ОТПРАВЛЕНО ДРУЗЬЯМ!' : 'ВИДЕО СКАЧАНО НА УСТРОЙСТВО');
      } else if (status === 'unsupported') {
        showWaveBanner('ЗАПИСЬ НЕДОСТУПНА', 'ЭТОТ БРАУЗЕР НЕ ПОДДЕРЖИВАЕТ ЗАХВАТ ХОЛСТА');
      }
    }
  );
  if (started) {
    btn.classList.add('rec-active');
  }
};

el('btn-pause').onclick = () => {
  renderSettingsInto(el('pause-settings'));
  game.togglePause();
};
el('btn-resume').onclick = () => game.togglePause();
el('btn-quit').onclick = () => {
  stopCoopLoop();
  if (recorder.isRecording) recorder.stop();
  pauseScreen.classList.add('hidden');
  game.returnToTitle();
  titleScreen.classList.remove('hidden');
};

el('btn-mute').onclick = () => {
  sound.init();
  const anyOn = game.settings.soundEnabled || game.settings.musicEnabled;
  game.settings.soundEnabled = !anyOn;
  game.settings.musicEnabled = !anyOn;
  sound.setSoundEnabled(game.settings.soundEnabled);
  sound.setMusicEnabled(game.settings.musicEnabled);
  saveSettings(game.settings);
  updateMuteIcon();
};

el('btn-dash').onclick = () => game.triggerDash();
el('btn-nova').onclick = () => game.triggerNova();

el('btn-retry').onclick = async () => {
  await showInterstitialAd(adAudioCallbacks);
  gameoverScreen.classList.add('hidden');
  game.setProfile(profile);
  game.startNewGame();
  trackEvent('run_start', { mode: game.mode, ship: profile.selectedShip }, profile.playerId);
};
el('btn-go-menu').onclick = async () => {
  await showInterstitialAd(adAudioCallbacks);
  gameoverScreen.classList.add('hidden');
  game.returnToTitle();
  titleScreen.classList.remove('hidden');
};
el('btn-challenge-friend').onclick = () => {
  void shareOrCopy(
    'Вызов в AETHER RIFT!',
    `Я набрал ${lastRunScore.toLocaleString('ru-RU')} очков в AETHER RIFT! Сможешь побить мой рекорд?`,
    lastChallengeUrl,
    el('btn-challenge-friend'),
    `${ICONS.swords} БРОСИТЬ ВЫЗОВ ДРУГУ`
  );
};

// ==================== URL PARAMS & TELEGRAM START_PARAM: CHALLENGE, ROOM & REFERRAL ====================
const params = new URLSearchParams(window.location.search);
const tgStartParam = tgApp?.initDataUnsafe?.start_param || params.get('startapp') || '';

let challengeScore = params.get('challenge');
let challengeBy = params.get('by');
let roomParam = params.get('room');
let refParam = params.get('ref');

if (tgStartParam.startsWith('room_')) {
  roomParam = tgStartParam.slice(5);
} else if (tgStartParam.startsWith('chal_')) {
  const parts = tgStartParam.slice(5).split('_');
  if (parts.length >= 2) {
    challengeScore = parts[0];
    challengeBy = parts.slice(1).join('_');
  }
} else if (tgStartParam.startsWith('ref_')) {
  refParam = tgStartParam.slice(4);
}

if (refParam) {
  const cleanRef = refParam.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (cleanRef && cleanRef !== profile.referralCode && !profile.referredBy) {
    profile.referredBy = cleanRef;
    profile.shards += 60;
    saveProfile(profile);
    void saveCloudProfile(profile, tgInitData);
    void recordReferral(cleanRef, profile.playerId);
    trackEvent('referral_claimed', { code: cleanRef }, profile.playerId);
    refreshLobbyUI();
    const banner = el('challenge-banner');
    banner.innerHTML = `${ICONS.gift} По приглашению <b>${cleanRef}</b> зачислено <b>+60 Осколков</b>!`;
    banner.classList.remove('hidden');
  }
}

if (challengeScore && challengeBy) {
  const banner = el('challenge-banner');
  banner.innerHTML = `${ICONS.swords} <b>${challengeBy}</b> бросает тебе вызов! Цель: <b>${Number(challengeScore).toLocaleString('ru-RU')}</b> очков`;
  banner.classList.remove('hidden');
}

if (roomParam) {
  el<HTMLInputElement>('coop-code-input').value = roomParam;
  coopScreen.classList.remove('hidden');
  coop.joinRoom(roomParam, profile.callsign, game.theme.primary);
}

// ==================== INPUT LISTENERS ====================
window.addEventListener('resize', () => game.resize());
window.visualViewport?.addEventListener('resize', () => game.resize());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sound.setAdMuted(true);
    game.pauseIfPlaying();
  } else {
    sound.setAdMuted(false);
  }
});
window.addEventListener('blur', () => {
  sound.setAdMuted(true);
  game.pauseIfPlaying();
});
window.addEventListener('focus', () => {
  sound.setAdMuted(false);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (!relicScreen.classList.contains('hidden') && activeRelicChoices.length > 0) {
    if (e.key === '1' && activeRelicChoices[0]) pickRelic(activeRelicChoices[0]);
    if (e.key === '2' && activeRelicChoices[1]) pickRelic(activeRelicChoices[1]);
    if (e.key === '3' && activeRelicChoices[2]) pickRelic(activeRelicChoices[2]);
    return;
  }
  if (game.state === 'levelup' && activeUpgradeChoices.length > 0) {
    if (e.key === '1' && activeUpgradeChoices[0]) selectUpgrade(activeUpgradeChoices[0].id);
    if (e.key === '2' && activeUpgradeChoices[1]) selectUpgrade(activeUpgradeChoices[1].id);
    if (e.key === '3' && activeUpgradeChoices[2]) selectUpgrade(activeUpgradeChoices[2].id);
    return;
  }
  if (e.code === 'Escape' && (game.state === 'playing' || game.state === 'paused')) {
    renderSettingsInto(el('pause-settings'));
  }
  game.setKey(e.code, true);
});

window.addEventListener('keyup', (e) => game.setKey(e.code, false));

canvas.addEventListener('mousemove', (e) => game.setMousePos(e.clientX, e.clientY));
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) game.setMouseDown(true);
  if (e.button === 2) game.triggerDash();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) game.setMouseDown(false);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

if (isTouch) {
  const moveBase = el<HTMLDivElement>('stick-move-base');
  const moveKnob = el<HTMLDivElement>('stick-move-knob');
  const aimBase = el<HTMLDivElement>('stick-aim-base');
  const aimKnob = el<HTMLDivElement>('stick-aim-knob');

  let moveTouchId: number | null = null;
  let moveOriginX = 0;
  let moveOriginY = 0;

  let aimTouchId: number | null = null;
  let aimOriginX = 0;
  let aimOriginY = 0;

  const maxRadius = 46;

  touchLayer.addEventListener(
    'touchstart',
    (e) => {
      sound.init();
      el('touch-hint-bar').classList.add('faded');
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth * 0.55 && moveTouchId === null) {
          moveTouchId = t.identifier;
          moveOriginX = t.clientX;
          moveOriginY = t.clientY;
          moveBase.style.left = `${t.clientX}px`;
          moveBase.style.top = `${t.clientY}px`;
          moveKnob.style.transform = 'translate(0px, 0px)';
          moveBase.classList.remove('hidden');
        } else if (t.clientX >= window.innerWidth * 0.55 && aimTouchId === null) {
          aimTouchId = t.identifier;
          aimOriginX = t.clientX;
          aimOriginY = t.clientY;
          aimBase.style.left = `${t.clientX}px`;
          aimBase.style.top = `${t.clientY}px`;
          aimKnob.style.transform = 'translate(0px, 0px)';
          aimBase.classList.remove('hidden');
        }
      }
    },
    { passive: false }
  );

  touchLayer.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === moveTouchId) {
          let dx = t.clientX - moveOriginX;
          let dy = t.clientY - moveOriginY;
          const dist = Math.hypot(dx, dy);
          if (dist > maxRadius) {
            dx = (dx / dist) * maxRadius;
            dy = (dy / dist) * maxRadius;
          }
          moveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
          game.setTouchMove(dx / maxRadius, dy / maxRadius);
        } else if (t.identifier === aimTouchId) {
          let dx = t.clientX - aimOriginX;
          let dy = t.clientY - aimOriginY;
          const dist = Math.hypot(dx, dy);
          if (dist > maxRadius) {
            dx = (dx / dist) * maxRadius;
            dy = (dy / dist) * maxRadius;
          }
          aimKnob.style.transform = `translate(${dx}px, ${dy}px)`;
          if (dist > 6) {
            game.setTouchAim(true, dx / dist, dy / dist);
          }
        }
      }
    },
    { passive: false }
  );

  const handleTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouchId) {
        moveTouchId = null;
        moveBase.classList.add('hidden');
        game.setTouchMove(0, 0);
      } else if (t.identifier === aimTouchId) {
        aimTouchId = null;
        aimBase.classList.add('hidden');
        game.setTouchAim(false, 0, 0);
      }
    }
  };

  touchLayer.addEventListener('touchend', handleTouchEnd);
  touchLayer.addEventListener('touchcancel', handleTouchEnd);
}

updateMuteIcon();
game.startLoop();
