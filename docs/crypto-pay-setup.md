# Crypto Pay через @CryptoBot

## Переменная окружения

```env
CRYPTOBOT_KEY=<API-токен из @CryptoBot → Crypto Pay → My Apps>
# опционально, если приложение в testnet (@CryptoTestnetBot):
# CRYPTOBOT_API_URL=https://testnet-pay.crypt.bot/api
```

Токен получают в [@CryptoBot](https://t.me/CryptoBot) → **Crypto Pay** → **My Apps** → Create App / API Token  
(не путать с `TELEGRAM_BOT_TOKEN` от BotFather).

Проверка токена до деплоя:

```bash
curl -s https://pay.crypt.bot/api/getMe -H "Crypto-Pay-API-Token: $CRYPTOBOT_KEY"
```

Ожидается `"ok": true`. Если `"UNAUTHORIZED"` — токен отозван или скопирован неверно.

На старте сервиса в логах будет `Crypto Pay auth OK` или `Crypto Pay getMe failed`.

## Как работает

Webhook **не нужен**. Бот каждые 30 секунд опрашивает Crypto Pay API (`getInvoices`) и активирует подписку, когда счёт оплачен. Ссылки на оплату ведут в **@CryptoBot**.

## Проверка

1. Обновите `CRYPTOBOT_KEY` и в локальном `.env`, и в Railway/проде
2. Перезапустите сервис — в логах должно быть `Crypto Pay auth OK`
3. В боте: Тарифы → период → тариф → **USDT** → «Оплатить»
4. Оплатите в @CryptoBot — подписка активируется в течение ~30 секунд
