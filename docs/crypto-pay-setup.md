# Crypto Pay через @send (t.me/send)

## Переменная окружения

```env
CRYPTOBOT_KEY=<API-токен из @send → /pay>
```

Токен получают в [@send](https://t.me/send) (Crypto Bot) → `/pay` → Create App.

## Как работает

Webhook **не нужен**. Бот каждые 30 секунд опрашивает Crypto Pay API (`getInvoices`) и активирует подписку, когда счёт оплачен.

## Проверка

1. Задеплойте сервис с `CRYPTOBOT_KEY`
2. В боте: Тарифы → период → тариф → **USDT** → «Оплатить»
3. Оплатите в @send — подписка активируется в течение ~30 секунд
