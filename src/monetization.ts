// Модуль монетизации: поддержка Telegram Adsgram, Yandex Games SDK и встроенного Rewarded-слота.
// Чтобы подключить реальную монетизацию в Telegram Mini App, добавьте в Vercel переменную:
// VITE_ADSGRAM_BLOCK_ID = ваш Block ID из adsgram.ai

const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID || '';

interface AdsgramController {
  show: () => Promise<{ done: boolean }>;
}

declare global {
  interface Window {
    Adsgram?: { init: (cfg: { blockId: string }) => AdsgramController };
    ysdk?: {
      adv?: {
        showRewardedVideo: (opts: {
          callbacks: { onRewarded?: () => void; onClose?: () => void; onError?: () => void };
        }) => void;
      };
    };
  }
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
