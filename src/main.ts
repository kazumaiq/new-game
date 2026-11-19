import './style.css';
import { sound } from './audio';
import { AetherGame, drawShipPreview, HudSnapshot } from './game';
import { IconKey, ICONS, iconHtml } from './icons';
import { fetchCloudProfile, fetchGlobalLeaderboard, saveCloudProfile, submitGlobalScore } from './leaderboard';
import { showRewardedAd } from './monetization';
import { CoopNetwork } from './network';
import {
  ACHIEVEMENTS,
  getMetaCost,
  getPilotRank,
  loadProfile,
  META_UPGRADES,
  saveProfile,
  SHIP_CLASSES,
} from './progression';
import { THEMES } from './themes';
import { GameMode, GameSettings, HighScoreEntry, ThemePalette, UpgradeDef } from './types';
import { UPGRADES } from './upgrades';

const SCORES_KEY = 'aether_rift_scores_v1';
const SETTINGS_KEY = 'aether_rift_settings_v1';
const THEME_KEY = 'aether_rift_theme_v1';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = el<HTMLCanvasElement>('game-canvas');
const hudEl = el<HTMLDivElement>('hud');
const titleScreen = el<HTMLDivElement>('title-screen');
const hangarScreen = el<HTMLDivElement>('hangar-screen');
const questsScreen = el<HTMLDivElement>('quests-screen');
const coopScreen = el<HTMLDivElement>('coop-screen');
const levelupScreen = el<HTMLDivElement>('levelup-screen');
const pauseScreen = el<HTMLDivElement>('pause-screen');
const controlsScreen = el<HTMLDivElement>('controls-screen');
const scoresScreen = el<HTMLDivElement>('scores-screen');
const titlesScreen = el<HTMLDivElement>('titles-screen');
const capsuleScreen = el<HTMLDivElement>('capsule-screen');
const abyssScreen = el<HTMLDivElement>('abyss-screen');
const reviveScreen = el<HTMLDivElement>('revive-screen');
const gameoverScreen = el<HTMLDivElement>('gameover-screen');

// Внедряем все векторные SVG-иконки
document.querySelectorAll<HTMLElement>('[data-ico]').forEach((node) => {
  const key = node.getAttribute('data-ico') as IconKey;
  if (key && ICONS[key]) {
    node.innerHTML = iconHtml(key);
  }
});
const waveBanner = el<HTMLDivElement>('wave-banner');
const touchLayer = el<HTMLDivElement>('touch-layer');

let activeUpgradeChoices: UpgradeDef[] = [];
let waveBannerTimer: number | null = null;
let lastChallengeUrl = '';
let lastRunScore = 0;
let coopSyncTimer: number | null = null;
let selectedSoloMode: GameMode = 'classic';
let selectedOnlineMode: 'coop' | 'pvp' = 'coop';
let activeLbTab: 'daily' | 'all' | 'local' = 'daily';

const TUTORIAL_KEY = 'aether_rift_tut_v1';
const tutorialScreen = el<HTMLDivElement>('tutorial-screen');

let profile = loadProfile();

// Попытка синхронизации профиля из облака Supabase при старте
void fetchCloudProfile(profile.callsign).then((cloud) => {
  if (cloud && cloud.totalScore >= profile.totalScore) {
    profile = { ...profile, ...cloud };
    saveProfile(profile);
    game.setProfile(profile);
    refreshLobbyUI();
  }
});

// Telegram Mini App integration
const TG_BOT_APP = import.meta.env.VITE_TG_BOT_APP || '';
const tgApp = (window as unknown as {
  Telegram?: {
    WebApp?: {
      ready: () => void;
      expand: () => void;
      initData?: string;
      setHeaderColor?: (c: string) => void;
      setBackgroundColor?: (c: string) => void;
      disableVerticalSwipes?: () => void;
      enableClosingConfirmation?: () => void;
      openTelegramLink?: (url: string) => void;
      initDataUnsafe?: {
        start_param?: string;
        user?: { username?: string; first_name?: string };
      };
    };
  };
}).Telegram?.WebApp;

if (tgApp) {
  tgApp.ready();
  tgApp.expand();
  tgApp.setHeaderColor?.('#03040a');
  tgApp.setBackgroundColor?.('#03040a');
  tgApp.disableVerticalSwipes?.();
  tgApp.enableClosingConfirmation?.();
  const tgUser = tgApp.initDataUnsafe?.user;
  if (tgUser && profile.callsign.startsWith('ПИЛОТ-')) {
    profile.callsign = (tgUser.username || tgUser.first_name || 'ПИЛОТ').slice(0, 14).toUpperCase();
    saveProfile(profile);
  }
}

// PWA Service Worker
if ('serviceWorker' in navigator) {
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
  localStorage.setItem(SCORES_KEY, JSON.stringify(list.slice(0, 10)));
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
  void saveCloudProfile(profile);
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
  onAchievement: unlockAchievement,
  onAbyssChoice: () => {
    abyssScreen.classList.remove('hidden');
  },
  onReviveOffer: () => {
    const shardsBtn = el<HTMLButtonElement>('btn-revive-shards');
    shardsBtn.disabled = profile.shards < 50;
    el('ad-progress-box').classList.add('hidden');
    el<HTMLButtonElement>('btn-revive-ad').disabled = false;
    reviveScreen.classList.remove('hidden');
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
  stopCoopLoop();
  coopSyncTimer = window.setInterval(() => {
    if (game.state === 'playing' && coop.isConnected) {
      coop.send(game.getCoopSyncPacket());
    }
  }, 50);
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

  el('btn-capsule').classList.toggle('claimed', profile.capsuleClaimedToday);

  const hasClaimable =
    !profile.dailyClaimedToday || profile.quests.some((q) => q.progress >= q.target && !q.claimed);
  el('quest-dot').classList.toggle('hidden', !hasClaimable);
}

el<HTMLInputElement>('pilot-callsign').addEventListener('change', async (e) => {
  const val = (e.target as HTMLInputElement).value.trim().toUpperCase() || 'ПИЛОТ';
  profile.callsign = val;
  const cloud = await fetchCloudProfile(val);
  if (cloud && cloud.totalScore > profile.totalScore) {
    profile = { ...profile, ...cloud };
    game.setProfile(profile);
    refreshLobbyUI();
  }
  saveProfile(profile);
  void saveCloudProfile(profile);
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

// ==================== HANGAR MODAL ====================
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
        void saveCloudProfile(profile);
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
          void saveCloudProfile(profile);
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
          void saveCloudProfile(profile);
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

// ==================== DAILY QUESTS MODAL ====================
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
      saveProfile(profile);
      void saveCloudProfile(profile);
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
        saveProfile(profile);
        void saveCloudProfile(profile);
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
  const showHud = hud.state === 'playing' || hud.state === 'paused' || hud.state === 'levelup';
  hudEl.classList.toggle('hidden', !showHud);
  pauseScreen.classList.toggle('hidden', hud.state !== 'paused');
  if (isTouch) {
    touchLayer.classList.toggle('hidden', hud.state !== 'playing');
  }

  el('hp-bar').style.width = `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%`;
  el('hp-text').textContent = `${hud.hp}/${hud.maxHp}`;
  el('lvl-label').textContent = `УР. ${hud.level}`;
  el('xp-bar').style.width = `${Math.min(100, (hud.xp / hud.xpToNext) * 100)}%`;
  el('hud-mode-label').textContent = hud.mode === 'pvp' ? 'ДУЭЛЬ' : hud.mode === 'daily' ? 'ДЕНЬ' : 'ВОЛНА';
  el('hud-wave').textContent = hud.mode === 'pvp' ? '1v1' : String(hud.wave).padStart(2, '0');
  el('hud-score').textContent = hud.score.toLocaleString('ru-RU');

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
  victory?: boolean;
  mode: GameMode;
  upgrades: Record<string, number>;
}): void {
  stopCoopLoop();
  profile.shards += summary.shards;
  profile.totalKills += summary.kills;
  profile.totalScore += summary.score;
  profile.totalRuns += 1;

  for (const q of profile.quests) {
    if (q.metric === 'kills') q.progress += summary.kills;
    if (q.metric === 'wave') q.progress = Math.max(q.progress, summary.wave);
    if (q.metric === 'combo') q.progress = Math.max(q.progress, summary.maxCombo);
  }
  saveProfile(profile);
  void saveCloudProfile(profile);
  refreshLobbyUI();

  const shipDef = SHIP_CLASSES.find((s) => s.id === profile.selectedShip) || SHIP_CLASSES[0];
  void submitGlobalScore({
    callsign: profile.callsign,
    score: summary.score,
    wave: summary.wave,
    mode: summary.mode,
    ship: shipDef.name,
  });

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
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const cleanCallsign = encodeURIComponent(profile.callsign.replace(/[^A-ZА-Я0-9_-]/gi, ''));
  lastChallengeUrl = TG_BOT_APP
    ? `https://t.me/${TG_BOT_APP}?startapp=chal_${summary.score}_${cleanCallsign}`
    : `${baseUrl}?challenge=${summary.score}&by=${encodeURIComponent(profile.callsign)}`;

  el('go-title').textContent = summary.victory ? 'ПОБЕДА' : 'СИГНАЛ ПОТЕРЯН';
  el('new-record-badge').classList.toggle('hidden', !isNewRecord);
  el('go-shards').textContent = `+${summary.shards}`;
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

  container.innerHTML = '<p style="color:var(--text-dim);padding:20px;">Загрузка рейтинга...</p>';
  const rows = await fetchGlobalLeaderboard(activeLbTab === 'daily' ? 'daily' : 'all', profile.callsign);
  container.innerHTML = rows
    .map(
      (r, i) => `
      <div class="score-row" style="${r.isSelf ? 'border:1px solid var(--primary);' : ''}">
        <span>#${i + 1} · <b>${r.callsign}</b> · Волна ${r.wave} (${r.ship})</span>
        <strong>${r.score.toLocaleString('ru-RU')}</strong>
      </div>`
    )
    .join('');
}

async function shareOrCopy(title: string, text: string, url: string, btn: HTMLElement, resetHtml: string): Promise<void> {
  if (tgApp?.initData && tgApp.openTelegramLink) {
    tgApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    );
    return;
  }
  if (navigator.share) {
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

// ==================== BUTTON BINDINGS ====================
document.querySelectorAll('#mode-tabs .mode-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mode-tabs .mode-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSoloMode = (btn.getAttribute('data-mode') as GameMode) || 'classic';
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
    activeLbTab = (btn.getAttribute('data-lb') as 'daily' | 'all' | 'local') || 'daily';
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

el('btn-quests').onclick = () => {
  renderQuests();
  questsScreen.classList.remove('hidden');
};

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
        void saveCloudProfile(profile);
        renderTitlesModal();
        refreshLobbyUI();
      };
    }
    item.appendChild(btn);
    list.appendChild(item);
  }
}

el('btn-titles').onclick = () => {
  renderTitlesModal();
  titlesScreen.classList.remove('hidden');
};
el('btn-close-titles').onclick = () => titlesScreen.classList.add('hidden');

el('btn-capsule').onclick = () => {
  const btn = el<HTMLButtonElement>('btn-open-capsule');
  const res = el('capsule-result');
  if (profile.capsuleClaimedToday) {
    res.textContent = 'Ты уже открыл капсулу сегодня! Заходи завтра за новым бонусом.';
    btn.disabled = true;
    btn.textContent = 'ОТКРЫТО';
  } else {
    res.textContent = 'Открой капсулу дня и получи случайный бонус!';
    btn.disabled = false;
    btn.textContent = 'ОТКРЫТЬ КАПСУЛУ';
  }
  capsuleScreen.classList.remove('hidden');
};
el('btn-close-capsule').onclick = () => capsuleScreen.classList.add('hidden');

el('btn-open-capsule').onclick = () => {
  if (profile.capsuleClaimedToday) return;
  profile.capsuleClaimedToday = true;
  const roll = Math.random();
  let msg = '';
  if (roll < 0.35) {
    profile.shards += 45;
    msg = 'Награда: +45 Эфирных Осколков!';
  } else if (roll < 0.6) {
    profile.shards += 75;
    msg = 'ДЖЕКПОТ: +75 Эфирных Осколков!';
  } else if (roll < 0.8) {
    profile.nextRunBuff = 'shield';
    msg = 'Награда: Стартовый Силовой Щит на следующий бой!';
  } else {
    profile.nextRunBuff = 'xp';
    msg = 'Награда: +50% Опыта на следующий бой!';
  }
  sound.playLevelUp();
  saveProfile(profile);
  void saveCloudProfile(profile);
  refreshLobbyUI();
  el('capsule-result').textContent = msg;
  const btn = el<HTMLButtonElement>('btn-open-capsule');
  btn.disabled = true;
  btn.textContent = 'ПОЛУЧЕНО';
};

el('btn-revive-ad').onclick = async () => {
  const adBtn = el<HTMLButtonElement>('btn-revive-ad');
  const box = el('ad-progress-box');
  adBtn.disabled = true;
  box.classList.remove('hidden');
  box.textContent = 'Загрузка рекламного блока...';

  const ok = await showRewardedAd((sec) => {
    box.textContent = sec > 0 ? `Спонсорский блок: осталось ${sec} сек...` : 'Готово! Реанимация...';
  });

  if (ok) {
    reviveScreen.classList.add('hidden');
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
  void saveCloudProfile(profile);
  refreshLobbyUI();
  reviveScreen.classList.add('hidden');
  game.revivePlayer();
};

el('btn-revive-skip').onclick = () => {
  reviveScreen.classList.add('hidden');
  game.declineRevive();
};

el('btn-go-abyss').onclick = () => {
  abyssScreen.classList.add('hidden');
  game.continueToAbyss();
};
el('btn-claim-win').onclick = () => {
  abyssScreen.classList.add('hidden');
  game.finishVictory();
};
el('btn-close-quests').onclick = () => questsScreen.classList.add('hidden');

el('btn-coop').onclick = () => coopScreen.classList.remove('hidden');
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

el('btn-pause').onclick = () => {
  renderSettingsInto(el('pause-settings'));
  game.togglePause();
};
el('btn-resume').onclick = () => game.togglePause();
el('btn-quit').onclick = () => {
  stopCoopLoop();
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

el('btn-retry').onclick = () => {
  gameoverScreen.classList.add('hidden');
  game.setProfile(profile);
  game.startNewGame();
};
el('btn-go-menu').onclick = () => {
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

// ==================== URL PARAMS & TELEGRAM START_PARAM: CHALLENGE & CO-OP ROOM ====================
const params = new URLSearchParams(window.location.search);
const tgStartParam = tgApp?.initDataUnsafe?.start_param || params.get('startapp') || '';

let challengeScore = params.get('challenge');
let challengeBy = params.get('by');
let roomParam = params.get('room');

if (tgStartParam.startsWith('room_')) {
  roomParam = tgStartParam.slice(5);
} else if (tgStartParam.startsWith('chal_')) {
  const parts = tgStartParam.slice(5).split('_');
  if (parts.length >= 2) {
    challengeScore = parts[0];
    challengeBy = parts.slice(1).join('_');
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

window.addEventListener('keydown', (e) => {
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
