// Модуль монетизации: поддержка Telegram Adsgram, Yandex Games SDK v2, Telegram Stars и встроенного Rewarded-слота.

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '';

interface AdsgramController {
  show: () => Promise<{ done: boolean }>;
}

interface YandexPlayer {
  getData?: () => Promise<Record<string, unknown>>;
  setData?: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
  getUniqueID?: () => string;
  getName?: () => string;
}

interface YandexLeaderboards {
  setLeaderboardScore?: (leaderboardName: string, score: number) => Promise<void>;
}

interface YsdkInstance {
  adv?: {
    showRewardedVideo?: (opts: {
      callbacks: {
        onOpen?: () => void;
        onRewarded?: () => void;
        onClose?: () => void;
        onError?: () => void;
      };
    }) => void;
    showFullscreenAdv?: (opts: {
      callbacks: {
        onOpen?: () => void;
        onClose?: (wasShown?: boolean) => void;
        onError?: () => void;
        onOffline?: () => void;
      };
    }) => void;
  };
  features?: {
    LoadingAPI?: { ready?: () => void };
    GameplayAPI?: { start?: () => void; stop?: () => void };
  };
  getPlayer?: (opts?: { scopes?: boolean }) => Promise<YandexPlayer>;
  getLeaderboards?: () => Promise<YandexLeaderboards>;
  on?: (eventName: string, cb: () => void) => void;
}

export interface AdLifecycleCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    Adsgram?: { init: (cfg: { blockId: string }) => AdsgramController };
    YaGames?: { init: () => Promise<YsdkInstance> };
    ysdk?: YsdkInstance;
  }
}

let gameplayActive = false;
let lastInterstitialTs = 0;

export function isYandexPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.ysdk || window.YaGames || /yandex/i.test(window.location.hostname));
}

export async function initYandexSdk(handlers?: {
  onPause?: () => void;
  onResume?: () => void;
}): Promise<boolean> {
  if (window.ysdk) return true;
  if (!window.YaGames?.init) return false;
  try {
    const ysdk = await window.YaGames.init();
    window.ysdk = ysdk;
    ysdk.features?.LoadingAPI?.ready?.();
    if (handlers?.onPause) ysdk.on?.('game_api_pause', handlers.onPause);
    if (handlers?.onResume) ysdk.on?.('game_api_resume', handlers.onResume);
    return true;
  } catch {
    return false;
  }
}

export function yandexGameplayStart(): void {
  if (gameplayActive) return;
  gameplayActive = true;
  try {
    window.ysdk?.features?.GameplayAPI?.start?.();
  } catch {
    // ignore outside Yandex
  }
}

export function yandexGameplayStop(): void {
  if (!gameplayActive) return;
  gameplayActive = false;
  try {
    window.ysdk?.features?.GameplayAPI?.stop?.();
  } catch {
    // ignore outside Yandex
  }
}

export async function loadYandexPlayerInfo(): Promise<{
  id: string;
  name: string;
  savedProfile: Record<string, unknown> | null;
} | null> {
  if (!window.ysdk?.getPlayer) return null;
  try {
    const player = await window.ysdk.getPlayer({ scopes: false });
    const id = player.getUniqueID?.() || '';
    const name = player.getName?.() || '';
    let savedProfile: Record<string, unknown> | null = null;
    if (player.getData) {
      const data = await player.getData();
      if (data && typeof data.profile === 'object' && data.profile !== null) {
        savedProfile = data.profile as Record<string, unknown>;
      }
    }
    return id ? { id, name, savedProfile } : null;
  } catch {
    return null;
  }
}

export async function saveYandexCloudProfile(profile: unknown): Promise<void> {
  if (!window.ysdk?.getPlayer) return;
  try {
    const player = await window.ysdk.getPlayer({ scopes: false });
    await player.setData?.({ profile }, true);
  } catch {
    // ignore outside Yandex or guest limits
  }
}

export async function submitYandexLeaderboardScore(score: number): Promise<void> {
  if (!window.ysdk?.getLeaderboards || !Number.isFinite(score) || score <= 0) return;
  try {
    const lb = await window.ysdk.getLeaderboards();
    await lb.setLeaderboardScore?.('top_score', Math.round(score));
  } catch {
    // ignore if unauthorized or leaderboard not yet created
  }
}

export async function showInterstitialAd(callbacks?: AdLifecycleCallbacks): Promise<boolean> {
  const now = Date.now();
  if (now - lastInterstitialTs < 90_000) return false;
  if (!window.ysdk?.adv?.showFullscreenAdv) return false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (shown: boolean) => {
      if (settled) return;
      settled = true;
      callbacks?.onClose?.();
      resolve(shown);
    };
    try {
      window.ysdk?.adv?.showFullscreenAdv?.({
        callbacks: {
          onOpen: () => {
            lastInterstitialTs = Date.now();
            callbacks?.onOpen?.();
          },
          onClose: (wasShown) => finish(Boolean(wasShown)),
          onError: () => finish(false),
          onOffline: () => finish(false),
        },
      });
    } catch {
      finish(false);
    }
  });
}

export async function openTelegramStarsInvoice(
  invoiceUrl: string
): Promise<'paid' | 'cancelled' | 'failed' | 'unavailable'> {
  if (!invoiceUrl) return 'unavailable';
  const tg = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          openInvoice?: (url: string, cb?: (status: string) => void) => void;
        };
      };
    }
  ).Telegram?.WebApp;

  if (!tg?.openInvoice) return 'unavailable';

  return new Promise((resolve) => {
    try {
      tg.openInvoice?.(invoiceUrl, (status: string) => {
        if (status === 'paid') resolve('paid');
        else if (status === 'cancelled') resolve('cancelled');
        else resolve('failed');
      });
    } catch {
      resolve('failed');
    }
  });
}

export async function showRewardedAd(
  onTick?: (secondsLeft: number) => void,
  callbacks?: AdLifecycleCallbacks
): Promise<boolean> {
  // 1. Telegram Adsgram (реальная монетизация в Telegram Mini App)
  if (ADSGRAM_BLOCK_ID && window.Adsgram) {
    callbacks?.onOpen?.();
    try {
      const controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
      const res = await controller.show();
      return Boolean(res?.done);
    } catch {
      return false;
    } finally {
      callbacks?.onClose?.();
    }
  }

  // 2. Yandex Games SDK (если залито на Яндекс Игры)
  if (window.ysdk?.adv?.showRewardedVideo) {
    return new Promise((resolve) => {
      let rewarded = false;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        callbacks?.onClose?.();
        resolve(ok);
      };
      try {
        window.ysdk?.adv?.showRewardedVideo?.({
          callbacks: {
            onOpen: () => {
              callbacks?.onOpen?.();
            },
            onRewarded: () => {
              rewarded = true;
            },
            onClose: () => finish(rewarded),
            onError: () => finish(false),
          },
        });
      } catch {
        finish(false);
      }
    });
  }

  // 3. Встроенный Rewarded-таймер (5 секунд — пока не подключён внешний рекламный SDK)
  callbacks?.onOpen?.();
  return new Promise((resolve) => {
    let left = 5;
    onTick?.(left);
    const timer = window.setInterval(() => {
      left--;
      onTick?.(left);
      if (left <= 0) {
        clearInterval(timer);
        callbacks?.onClose?.();
        resolve(true);
      }
    }, 1000);
  });
}
