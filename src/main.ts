import './style.css';
import { sound } from './audio';
import { AetherGame, HudSnapshot } from './game';
import { THEMES } from './themes';
import { GameSettings, HighScoreEntry, ThemePalette, UpgradeDef } from './types';
import { UPGRADES } from './upgrades';

const SCORES_KEY = 'aether_rift_scores_v1';
const SETTINGS_KEY = 'aether_rift_settings_v1';
const THEME_KEY = 'aether_rift_theme_v1';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = el<HTMLCanvasElement>('game-canvas');
const hudEl = el<HTMLDivElement>('hud');
const titleScreen = el<HTMLDivElement>('title-screen');
const levelupScreen = el<HTMLDivElement>('levelup-screen');
const pauseScreen = el<HTMLDivElement>('pause-screen');
const controlsScreen = el<HTMLDivElement>('controls-screen');
const scoresScreen = el<HTMLDivElement>('scores-screen');
const gameoverScreen = el<HTMLDivElement>('gameover-screen');
const waveBanner = el<HTMLDivElement>('wave-banner');
const touchControls = el<HTMLDivElement>('touch-controls');

let activeUpgradeChoices: UpgradeDef[] = [];
let waveBannerTimer: number | null = null;
let lastSummaryText = '';

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { soundEnabled: true, musicEnabled: true, bloomEnabled: true, screenShake: true, autoFire: true, ...JSON.parse(raw) };
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

const game = new AetherGame(canvas, {
  onHudUpdate: renderHud,
  onLevelUp: renderLevelUp,
  onGameOver: handleGameOver,
  onWaveBanner: showWaveBanner,
});

// Init saved settings & theme
const savedSettings = loadSettings();
game.settings = savedSettings;
sound.setSoundEnabled(savedSettings.soundEnabled);
sound.setMusicEnabled(savedSettings.musicEnabled);

const savedThemeId = localStorage.getItem(THEME_KEY);
const initialTheme = THEMES.find((t) => t.id === savedThemeId) || THEMES[0];
game.setTheme(initialTheme);
applyThemeToCSS(initialTheme);

// Render Theme Selector
const themeGrid = el<HTMLDivElement>('theme-grid');
function renderThemes(): void {
  themeGrid.innerHTML = '';
  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.className = `theme-chip ${game.theme.id === t.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="theme-swatch" style="background: linear-gradient(135deg, ${t.primary}, ${t.accent})"></div>
      <div class="theme-chip-name">${t.name}</div>
    `;
    btn.onclick = () => {
      game.setTheme(t);
      applyThemeToCSS(t);
      renderThemes();
    };
    themeGrid.appendChild(btn);
  }
}
renderThemes();

function renderSettingsInto(container: HTMLElement): void {
  const items: Array<{ key: keyof GameSettings; label: string }> = [
    { key: 'autoFire', label: 'Auto-Fire Plasma Cannons' },
    { key: 'soundEnabled', label: 'Synthesized Sound FX' },
    { key: 'musicEnabled', label: 'Adaptive Synthwave Pulse' },
    { key: 'bloomEnabled', label: 'Neon Bloom Glow' },
    { key: 'screenShake', label: 'Impact Screen Shake' },
  ];

  container.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const on = game.settings[item.key];
    row.innerHTML = `
      <span>${item.label}</span>
      <span class="toggle-pill ${on ? 'on' : ''}">${on ? 'ON' : 'OFF'}</span>
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
  el('btn-mute').textContent = game.settings.soundEnabled || game.settings.musicEnabled ? '🔊' : '🔇';
}

function renderHud(hud: HudSnapshot): void {
  const showHud = hud.state === 'playing' || hud.state === 'paused' || hud.state === 'levelup';
  hudEl.classList.toggle('hidden', !showHud);
  pauseScreen.classList.toggle('hidden', hud.state !== 'paused');

  el('hp-bar').style.width = `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%`;
  el('hp-text').textContent = `${hud.hp}/${hud.maxHp}`;
  el('lvl-label').textContent = `LVL ${hud.level}`;
  el('xp-bar').style.width = `${Math.min(100, (hud.xp / hud.xpToNext) * 100)}%`;
  el('hud-wave').textContent = String(hud.wave).padStart(2, '0');
  el('hud-score').textContent = hud.score.toLocaleString();

  const comboBadge = el('combo-badge');
  if (hud.combo >= 3) {
    comboBadge.classList.remove('hidden');
    const mult = Math.min(8, 1 + Math.floor(hud.combo / 5));
    el('combo-mult').textContent = `x${mult}`;
    el('combo-count').textContent = `${hud.combo} HITS`;
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
      <div class="card-rank">RANK ${rank} / ${u.maxStacks}</div>
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
  upgrades: Record<string, number>;
}): void {
  const isNewRecord = saveScore({
    score: summary.score,
    wave: summary.wave,
    kills: summary.kills,
    maxCombo: summary.maxCombo,
    theme: game.theme.name,
    date: new Date().toLocaleDateString(),
  });

  el('new-record-badge').classList.toggle('hidden', !isNewRecord);
  el('go-score').textContent = summary.score.toLocaleString();
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

  lastSummaryText = `🚀 AETHER RIFT — Score: ${summary.score.toLocaleString()} | Wave ${summary.wave} | ${summary.kills} Kills | Max Combo ${summary.maxCombo}x (${game.theme.name})`;
  gameoverScreen.classList.remove('hidden');
}

function renderScoresModal(): void {
  const list = loadScores();
  const container = el('scores-list');
  if (list.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);padding:20px;">No missions recorded yet. Launch a run!</p>';
    return;
  }
  container.innerHTML = list
    .map(
      (s, i) => `
      <div class="score-row">
        <span>#${i + 1} · Wave ${s.wave} · ${s.kills} Kills (${s.theme})</span>
        <strong>${s.score.toLocaleString()}</strong>
      </div>`
    )
    .join('');
}

// Button Bindings
el('btn-start').onclick = () => {
  titleScreen.classList.add('hidden');
  game.startNewGame();
};

el('btn-controls').onclick = () => {
  renderSettingsInto(el('title-settings'));
  controlsScreen.classList.remove('hidden');
};
el('btn-close-controls').onclick = () => controlsScreen.classList.add('hidden');

el('btn-scores').onclick = () => {
  renderScoresModal();
  scoresScreen.classList.remove('hidden');
};
el('btn-close-scores').onclick = () => scoresScreen.classList.add('hidden');

el('btn-pause').onclick = () => {
  renderSettingsInto(el('pause-settings'));
  game.togglePause();
};
el('btn-resume').onclick = () => game.togglePause();
el('btn-quit').onclick = () => {
  pauseScreen.classList.add('hidden');
  game.returnToTitle();
  titleScreen.classList.remove('hidden');
};

el('btn-mute').onclick = () => {
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
  game.startNewGame();
};
el('btn-go-menu').onclick = () => {
  gameoverScreen.classList.add('hidden');
  game.returnToTitle();
  titleScreen.classList.remove('hidden');
};
el('btn-copy-score').onclick = async () => {
  try {
    await navigator.clipboard.writeText(lastSummaryText);
    el('btn-copy-score').textContent = 'COPIED!';
    setTimeout(() => (el('btn-copy-score').textContent = 'COPY SCORE CARD'), 1500);
  } catch {
    // ignore
  }
};

// Input Listeners
window.addEventListener('resize', () => game.resize());

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

// Touch detection
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  touchControls.classList.remove('hidden');
  const bindStick = (zone: HTMLElement, onMove: (dx: number, dy: number, active: boolean) => void) => {
    let originX = 0;
    let originY = 0;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      originX = t.clientX;
      originY = t.clientY;
    });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const dx = Math.max(-1, Math.min(1, (t.clientX - originX) / 42));
      const dy = Math.max(-1, Math.min(1, (t.clientY - originY) / 42));
      onMove(dx, dy, true);
    });
    zone.addEventListener('touchend', () => onMove(0, 0, false));
  };

  bindStick(el('touch-left'), (dx, dy) => game.setTouchMove(dx, dy));
  bindStick(el('touch-right'), (dx, dy, active) => game.setTouchAim(active, dx, dy));
}

updateMuteIcon();
game.startLoop();
