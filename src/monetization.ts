// Модуль монетизации: поддержка Telegram Adsgram, Yandex Games SDK, Telegram Stars и встроенного Rewarded-слота.

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '';

interface AdsgramController {
  show: () => Promise<{ done: boolean }>;
}

interface YsdkInstance {
  adv?: {
    showRewardedVideo: (opts: {
      callbacks: { onRewarded?: () => void; onClose?: () => void; onError?: () => void };
    }) => void;
  };
  features?: {
    LoadingAPI?: { ready?: () => void };
  };
}

declare global {
  interface Window {
    Adsgram?: { init: (cfg: { blockId: string }) => AdsgramController };
    YaGames?: { init: () => Promise<YsdkInstance> };
    ysdk?: YsdkInstance;
  }
}

export async function initYandexSdk(): Promise<boolean> {
  if (window.ysdk) return true;
  if (!window.YaGames?.init) return false;
  try {
    const ysdk = await window.YaGames.init();
    window.ysdk = ysdk;
    ysdk.features?.LoadingAPI?.ready?.();
    return true;
  } catch {
    return false;
  }
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

export async function showRewardedAd(onTick?: (secondsLeft: number) => void): Promise<boolean> {
  // 1. Telegram Adsgram (реальная монетизация в Telegram Mini App)
  if (ADSGRAM_BLOCK_ID && window.Adsgram) {
    try {
      const controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
      const res = await controller.show();
      return Boolean(res?.done);
    } catch {
      return false;
    }
  }

  // 2. Yandex Games SDK (если залито на Яндекс Игры)
  if (window.ysdk?.adv?.showRewardedVideo) {
    return new Promise((resolve) => {
      let rewarded = false;
      window.ysdk?.adv?.showRewardedVideo({
        callbacks: {
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => resolve(rewarded),
          onError: () => resolve(false),
        },
      });
    });
  }

  // 3. Встроенный Rewarded-таймер (5 секунд — пока не подключён внешний рекламный SDK)
  return new Promise((resolve) => {
    let left = 5;
    onTick?.(left);
    const timer = window.setInterval(() => {
      left--;
      onTick?.(left);
      if (left <= 0) {
        clearInterval(timer);
        resolve(true);
      }
    }, 1000);
  });
}
