# Antilopay — оплата подписки в рублях (карта / СБП)

## Переменные окружения

```env
PUBLIC_BASE_URL=https://your-api.example.com
ANTILOPAY_SECRET_ID=<X-Apay-Secret-Id мерчанта>
ANTILOPAY_PRIVATE_KEY=<приватный ключ Base64 или PEM для подписи API>
ANTILOPAY_PROJECT_ID=<project_identificator проекта>
ANTILOPAY_CALLBACK_PUBLIC_KEY=<публичный ключ проекта для проверки callback>
# Prod (default): https://lk.antilopay.com/api/v1
# Тестовые ключи Antilopay работают только на stage:
ANTILOPAY_API_URL=https://stage.antilopay.com/api/v1
# ANTILOPAY_VAT=22   # только если СНО = ОСНО (10 или 22)
```

Ключи берут в личном кабинете Antilopay после подтверждения проекта.

`gate.antilopay.com` — платёжный фронт/редиректы, API мерчанта: `lk` (prod) или `stage` (тест).

## IP покупателя

Antilopay сверяет `customer.ip` с IP, с которого открывают платёжную ссылку.
В Telegram у бота нет IP пользователя, поэтому:

1. Бот создаёт локальную сессию и шлёт ссылку на `/payments/antilopay/checkout/:orderId`
2. Пользователь открывает её в браузере — сервер берёт реальный IP (`X-Forwarded-For`)
3. Только тогда вызывается `payment/create` с `customer.ip`

## Callback в ЛК

URL для приёма Callback:

```text
https://your-api.example.com/api/payments/antilopay/callback
```

Требования Antilopay: HTTPS, TLS ≥ 1.2, валидный сертификат. Ответ всегда HTTP 200.

Success / fail redirect после оплаты:

- `https://your-api.example.com/payments/antilopay/success`
- `https://your-api.example.com/payments/antilopay/fail`

Верификация домена (meta `apay-tag`) уже на `GET /` через `APAY_VERIFICATION_TAG`.

## Как работает

1. В боте: Тарифы → период → тариф → **СБП**
2. Если email ещё не сохранён — бот просит его один раз и пишет в `users.email`
3. Создаётся платёж `payment/create`, пользователь получает ссылку на оплату
4. После оплаты Antilopay шлёт callback → подписка активируется; дополнительно раз в 30 с идёт polling статуса

## Проверка

1. Задеплойте сервис с env выше и примените миграции Prisma
2. Укажите callback URL в ЛК Antilopay
3. Оплатите тестовый тариф через СБП / карту — подписка должна активироваться, в Telegram придёт сообщение об успехе
