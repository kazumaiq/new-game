# Полная инструкция по запуску AETHER RIFT (Supabase, Vercel, Онлайн, Telegram и Яндекс Игры)

## 1. Настройка Supabase (профили, лидерборд, кланы, рефералы, аналитика)
1. Зайдите на [supabase.com](https://supabase.com), создайте проект (бесплатного тарифа хватит).
2. Откройте **SQL Editor → New Query**, вставьте целиком файл `supabase/schema.sql` и нажмите **Run**.
   - Будут созданы 4 таблицы: `profiles`, `scores`, `referrals`, `analytics_events` с нужными индексами и правилами RLS.
3. Откройте **Project Settings → API** и скопируйте 3 значения:
   - `Project URL` → понадобится как `VITE_SUPABASE_URL`
   - `anon` / `public` key → понадобится как `VITE_SUPABASE_ANON_KEY`
   - `service_role` key (секретный!) → понадобится как `SUPABASE_SERVICE_ROLE_KEY` **только на сервере Vercel** (именно через него `/api/score` и `/api/profile` обходят RLS и защищают базу от накруток).

---

## 2. Настройка Vercel и защита от экрана входа в Telegram Mini App
1. Откройте проект на Vercel → **Settings → Deployment Protection**.
2. В пункте **Vercel Authentication** выберите **Disabled** (или **Only Preview Deployments**) и нажмите **Save**, чтобы Telegram WebView открывал сразу игру, а не экран входа Vercel.
3. Перейдите в **Settings → Environment Variables** и добавьте:
   - `VITE_SUPABASE_URL` — URL из Supabase
   - `VITE_SUPABASE_ANON_KEY` — `anon` ключ из Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` — секретный `service_role` ключ из Supabase
   - `TELEGRAM_BOT_TOKEN` — токен вашего бота от `@BotFather` (для проверки подписи Telegram `initData`)
   - `VITE_TG_BOT_APP` — короткое имя Mini App без `https://t.me/` (например, `MyGameBot/app`)
   - `VITE_ADSGRAM_BLOCK_ID` — Block ID из `adsgram.ai` для рекламы в Telegram Mini App
   - *(Опционально)* `VITE_TG_STARS_PASS_INVOICE` — ссылка инвойса Telegram Stars для Премиум-пропуска
   - *(Опционально для мобильного Co-op/PvP через 4G/LTE)* `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_CRED`
4. После добавления переменных перейдите во вкладку **Deployments → ... → Redeploy**, чтобы пересобрать клиент с новыми `VITE_*` ключами.

---

## 3. Полноценный Онлайн (Co-op и Дуэль 1х1)
- Онлайн в игре работает по технологии **PeerJS (WebRTC P2P)**:
  - Игрок нажимает **Онлайн → Создать комнату**, получает 4-значный код или ссылку-приглашение.
  - На Wi-Fi и большинстве домашних роутеров соединение устанавливается напрямую через встроенные STUN-серверы (`stun.l.google.com:19302` и `global.stun.twilio.com:3478`).
- **Если друзья играют с мобильного интернета (4G/LTE со строгим NAT) и не соединяет:**
  1. Зарегистрируйте бесплатный TURN-сервер на [metered.ca/tools/openrelay](https://www.metered.ca/tools/openrelay/) (Open Relay — до 20 ГБ бесплатно).
  2. Добавьте в Vercel **Environment Variables**:
     - `VITE_TURN_URL` = например `turn:a.relay.metered.ca:80`
     - `VITE_TURN_USER` = ваш username из Metered
     - `VITE_TURN_CRED` = ваш credential из Metered
  3. Сделайте **Redeploy** в Vercel.

---

## 4. Залив на Яндекс Игры и заработок на рекламе
1. Соберите готовый ZIP-архив одной командой в корне проекта:
   ```bash
   npm run build:yandex
   ```
   В корне появится архив `aether-rift-yandex.zip` (без Telegram/Adsgram скриптов и Service Worker, с подключённым `<script src="/sdk.js"></script>` и вызовами `LoadingAPI`, `GameplayAPI`, `game_api_pause`, облаком игрока `getPlayer/setData`, отключением звука на время рекламы и блокировкой контекстного меню).
2. Откройте [Яндекс Игры Консоль](https://console.yandex.ru/games) → **Добавить приложение**.
3. В разделе **Архив** загрузите `aether-rift-yandex.zip` (файл `index.html` лежит строго в корне архива).
4. **Таблица рекордов (чтобы работала синхронизация с Яндексом):**
   - В консоли Яндекс Игр перейдите в **Лидерборды → Добавить лидерборд**.
   - Укажите техническое имя (ID): **`top_score`**, сортировка — по убыванию (больше — лучше).
5. **Реклама и монетизация:**
   - В коде уже интегрированы оба вида рекламы:
     - **Rewarded Video** (`showRewardedVideo`): 1) второй шанс после смерти, 2) `x2 Осколки` после боя, 3) дополнительная «Капсула дня».
     - **Межстраничная полноэкранная реклама** (`showFullscreenAdv`): при нажатии **ЕЩЁ РАЗ** или **В ГЛАВНОЕ МЕНЮ** с ограничением не чаще 1 раза в 90 секунд.
   - После прохождения модерации Яндекс Игр включите **Рекламную сеть Яндекса (РСЯ)** в настройках игры в консоли — показ и доход включатся автоматически, архив пересобирать не нужно.
6. **Чеклист для модерации Яндекс Игр:**
   - Ориентация: **Любая (адаптивная)** — работает и на ПК, и на смартфоне.
   - Звук автоматически отключается во время любой рекламы и при сворачивании вкладки.
   - Контекстное меню правой кнопки отключено.
   - Внешние ссылки на сторонние мессенджеры на доменах Яндекса отключены (кнопка приглашения копирует текст в буфер).
