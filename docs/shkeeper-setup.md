# SHKeeper crypto payments (backend)

SHKeeper replaces the active Crypto Pay/CryptoBot integration. SBP (Antilopay) and Telegram Stars keep their existing endpoints and payment-claim behavior; the shared subscription activation path now serializes different orders per user. `POST /api/payments/crypto-pay` is removed. Historical `CRYPTO_PAY` enum values and `cryptoPayInvoiceId` records are intentionally retained; they are never converted into SHKeeper invoices.

## Быстрый запуск в Railway — Endora

1. Откройте проект Endora → сервис **бэкенда `ai-bot`** → **Variables**. Добавьте:

    ```env
    SHKEEPER_API_URL=https://pay.rugbniuerbuf34bc934nc3cn.ru
    SHKEEPER_CALLBACK_URL=https://asdjasdkjasdjka.uk/api/payments/shkeeper/callback
    MINI_APP_URL=https://ai-bot-mini-app-production.up.railway.app
    ```

    Отдельно добавьте `SHKEEPER_API_KEY`: значение возьмите из локального `ai-bot/.env` и вставьте как серверную secret-переменную. Ключ не хранится в Git и сам при push не попадёт на Railway. Остальные существующие переменные (`DATABASE_URL`, настройки бота, Redis и провайдеров) не удаляйте.

2. Сохраните переменные и запустите деплой актуального `main` из `web-tg-site/ai-bot`. При Docker-деплое `docker-entrypoint.sh` уже выполняет `npx prisma migrate deploy` **перед** стартом NestJS; отдельная ручная команда миграции не нужна. Если миграция завершилась ошибкой, приложение не запустится — проверьте Deploy Logs.

3. Сервис **фронтенда `ai-bot-mini-app`** → **Variables**: серверная переменная `BOT_API_URL=https://asdjasdkjasdjka.uk` (без `/api`). Никакие SHKeeper-ключи во фронтенд не добавляйте. После готовности backend задеплойте актуальный `main` из `web-tg-site/ai-bot-mini-app`. Если включён автодеплой по push, отдельно проверьте успешность обоих деплоев.

4. Проверьте из терминала:

    ```sh
    curl --fail https://asdjasdkjasdjka.uk/health
    curl -i -X POST https://asdjasdkjasdjka.uk/api/payments/shkeeper/callback -H 'Content-Type: application/json' --data '{}'
    ```

    Первый запрос должен вернуть `200` и `{"ok":true}`. Второй — `401` (подпись намеренно отсутствует), **не `404`**. Это проверка маршрута и защиты, не успешной оплаты.

5. В Telegram откройте Endora → Тарифы → Подключить → USDT, выберите сеть и получите реквизиты. Затем проведите реальный тестовый перевод и проверьте автоматическое обновление подписки. Для полноценной приёмки повторите сценарии частичной оплаты, callback и polling из списка ниже.

По данным оператора `152.55.184.94` уже разрешён в allowlist SHKeeper. IP фронтенда `152.55.186.5` не требуется. Перед переключением обработайте оставшиеся неоплаченные счета CryptoBot старым деплоем/операторским процессом: новый код их не опрашивает.

## Configuration

Set these in the deployment secret manager, not source control:

| Variable                | Purpose                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHKEEPER_API_URL`      | SHKeeper origin, optionally with a reverse-proxy prefix, **without** `/api/v1`. HTTPS is recommended; HTTP is supported for a trusted internal network. No embedded credentials, query, or fragment.                                                                                                                |
| `SHKEEPER_API_KEY`      | Sent as `X-Shkeeper-Api-Key` on server-to-server requests. Required. Never sent to clients or logged.                                                                                                                                                                                                               |
| `SHKEEPER_CALLBACK_URL` | Full public HTTPS URL: `https://<backend>/api/payments/shkeeper/callback`. Required. No JWT authentication on this route.                                                                                                                                                                                           |
| `SHKEEPER_WEBHOOK_KEYS` | Optional comma-separated HMAC verification keys for rotation/per-wallet keys. If absent/empty, use `SHKEEPER_API_KEY`. When populated, this list replaces the fallback; include the API key explicitly if needed.                                                                                                   |
| `MINI_APP_URL`          | Existing app URL. The bot adds `payment=shkeeper`, `subscribeType` and `subscribePlan` query parameters and opens a Telegram web app. The frontend must handle these hints; they do not authorize a price or subscription. Without this URL, the bot offers network selection and sends full transfer instructions. |

Missing any required SHKeeper variable disables new provider invoice creation, webhook verification and reconciliation. Owner-scoped local recovery/reuse of existing invoices and setup-incomplete warnings remain available without provider credentials. Remove obsolete `CRYPTOBOT_KEY`/`CRYPTOBOT_API_URL` settings. No new dependency is needed.

Provider requests time out after 10 seconds, reject redirects (avoid leaking the API key), and cap responses at 1 MiB. Never log raw Axios errors, request headers, keys or webhook bodies. Protect the callback route with an ingress request-rate limit and normal JSON body-size limits. Permit SHKeeper egress and callback ingress. Public callback URLs and reachability must be checked by the operator.

## Shared SHKeeper instance and deployment identity

The configured shared instance for PuPuPu and Endora is `https://pay.rugbniuerbuf34bc934nc3cn.ru`. Set this as `SHKEEPER_API_URL` in the backend deployment, not as a callback host. The API key must be stored only in deployment secrets. A shared key does not isolate projects or authorize access only to Endora invoices; prefer an independent credential when the provider supports one. Rotate credentials exposed in messages and coordinate rotation with PuPuPu before revoking a shared key.

New Endora invoices use `endora_<UUIDv4>` for both the local `orderId` and SHKeeper `external_id`. The full identifier is persisted and used unchanged for lookup, reconciliation and callbacks. UUID-only orders from the earlier implementation remain recoverable; existing invoices are not renamed or recreated. Other project prefixes are rejected by the callback route. This prefix prevents namespace confusion, but is not a security boundary when the API key is shared.

The public backend origin is `https://asdjasdkjasdjka.uk`; the mini-app origin is `https://ai-bot-mini-app-production.up.railway.app`. Use the direct backend callback URL to avoid depending on the frontend proxy for provider delivery:

```env
SHKEEPER_CALLBACK_URL=https://asdjasdkjasdjka.uk/api/payments/shkeeper/callback
```

Live probes on 2026-10-25 confirmed HTTPS on the direct backend: `/health` returned 200 with `{"ok":true}`, while an unsigned POST to `/api/payments/shkeeper/callback` returned a NestJS 404. The callback route was not yet available in that deployment at the time of the probe. Deploy the updated backend and database migration, then verify that an unsigned POST returns 401, not 404; signed delivery must still be tested separately. Do not add Telegram JWT authorization to this provider callback. The mini-app's existing Next `/api/*` proxy still forwards browser API requests using server-only `BOT_API_URL`; it is not required for the direct callback.

The operator supplied these Endora server addresses:

| Service                      | Reported IP     | SHKeeper API allowlist                                    |
| ---------------------------- | --------------- | --------------------------------------------------------- |
| Backend (`ai-bot`)           | `152.55.184.94` | Already allowed, according to the operator                |
| Frontend (`ai-bot-mini-app`) | `152.55.186.5`  | Not needed; the browser and frontend do not call SHKeeper |

Keep existing PuPuPu allowlist entries intact. The operator confirmed that the backend address is already allowed; the agent did not change or independently inspect the SHKeeper firewall. API credentials stay only in the backend deployment. The supplied configuration is also saved in the local backend `.env`, ignored by Git and excluded from Docker build context by `.dockerignore`. This local file does not configure Railway: set the same three variables in the backend service's deployment secrets before releasing.

Use the **backend container's outbound IP**, not an inbound/DNS address. If the reported server address has not been confirmed as its egress address, verify it from a shell/SSH session inside the deployed **ai-bot backend** container (Node is available in its runtime image):

```sh
node -e 'fetch("https://api4.ipify.org", { signal: AbortSignal.timeout(10000) }).then(r => { if (!r.ok) throw new Error("IP lookup failed"); return r.text(); }).then(console.log).catch(e => { console.error(e.message); process.exitCode = 1; })'
```

This sends a single outbound request to the external IP lookup service, disclosing the container's public egress address to that service. A developer-workstation lookup does not measure Railway egress. The IPs above were supplied by the operator, not independently measured from production by the agent. No Railway CLI or deployment token was available in the local agent environment at the time of the probe. On Railway, confirm static outbound networking for the service/plan; do not assume that a public inbound hostname has the same address as outbound traffic. Deployments with changing egress addresses need stable egress before enabling the allowlist.

## Frontend API contract

All routes except the callback require the existing Telegram JWT. Invoice ownership comes from the JWT/database, never request `userId`.

- `GET /api/payments/shkeeper/networks` → `{networks:[{id,label}]}`. Only supported networks enabled in provider `/api/v1/crypto` are returned: `ton` → `TON-USDT`, `trc20` → `USDT`, `bep20` → `BNB-USDT`.
- `POST /api/payments/shkeeper` body `{subscribeType,subscribePlan,network}` → `CryptoInvoice` (201), reusing the oldest matching `PENDING` invoice for the authenticated owner, tariff, plan and network. This includes partial invoices and preserves their original stored price and receipts. A database user-row lock serializes the check/reservation across processes, and is released before contacting SHKeeper. Repeated/concurrent requests cannot create another invoice for a combination with an existing pending reservation. If setup is unresolved, return 503 with `{error,orderId}`; show an explicit setup-incomplete warning and support reference, not another checkout. Only paid subscription types and known plans/networks are accepted. New-invoice USD price is selected inside the service from `SUB_PLAN_TO_COST`; any client amount is ignored.
- `GET /api/payments/shkeeper/pending` → `{payments:CryptoInvoice[]}`, newest first, owner-scoped unpaid invoices with saved transfer instructions. Includes partial/old invoices, with no age cutoff. **Unresolved setup records without transfer instructions are deliberately omitted**, not expired or deleted; repeated checkout for that same combination returns their `orderId` and 503 for support. These static routes are registered before the order detail route.
- `GET /api/payments/:orderId` → `CryptoInvoice` for SHKeeper with transfer instructions; the original generic fields for historical/SBP/Stars payments. A SHKeeper order that is **PAID but lacks transfer instructions** also returns the generic payment object (200, including `orderId`, `provider: 'SHKEEPER'`, `status: 'PAID'`, tariff/plan, amount and timestamps), so clients can stop polling and show success without an address. An unresolved unpaid order returns 503 with `{error,orderId}`. Another owner's order returns 404. This is a local read, not a provider call; frontend polling every 5 seconds is safe.

```ts
type CryptoInvoice = {
    orderId: string;
    status: 'PENDING' | 'PAID' | 'EXPIRED';
    network: 'ton' | 'trc20' | 'bep20';
    address: string;
    amountCrypto: string;
    receivedCrypto: string;
    expiresAt: string | null;
    subscribeType: 'LITE' | 'PRO' | 'BUSINESS';
    subscribePlan: 'MONTHLY' | 'THREE_MONTHS' | 'SIX_MONTHS' | 'YEARLY';
    amountUsd: string;
};
```

Money stays decimal strings. Partial payment is `PENDING` with `receivedCrypto > 0`. Show the exact token amount, network and address, and tell users to pay network fees separately. **Do not expire, discard, or automatically replace partially funded invoices.** The initial quote is stored as `amountCrypto`; `recalculate_after` is a provider quote recalculation interval, **not an invoice expiry**. `expiresAt` is therefore always `null` for new SHKeeper invoices. This backend does not automatically re-quote an invoice; verify provider top-up/quote behavior in the live checks below before enabling checkout broadly.

## Settlement and callback security

`POST /api/payments/shkeeper/callback` requires `X-Shkeeper-Timestamp` (Unix seconds) and `X-Shkeeper-Signature` (hex SHA256 HMAC of `timestamp + '.' + exact raw request body`). Timestamp must be within ±300 seconds. Invalid authentication returns 401; malformed IDs and other project prefixes return 400. Valid requests return `{ok:true}` after reconciliation; provider/database failures return an error so delivery can retry. Raw bytes must be preserved (`rawBody: true` in Nest bootstrap).

This signature format is confirmed by the sibling application's **source/tests**, not by a live SHKeeper delivery. Do not weaken verification to accept arbitrary callback bodies if deployment differs. Correct the verified adapter/signature scheme after a controlled live capture; cron remains the fallback.

Callbacks are only hints: even valid `paid`, `status`, amounts, network and address fields cannot activate anything. The backend retrieves `GET /api/v1/invoices/{storedOrderId}` and requires exactly one matching external ID, `fiat=USD`, the exact stored USD price, a known provider status and valid decimal strings.

The response contract is verified against upstream [`models.py` at commit `e6a41284cf36c3837a155339912480c4371e7b63`](https://github.com/vsys-host/shkeeper.io/blob/e6a41284cf36c3837a155339912480c4371e7b63/shkeeper/models.py): `Invoice.to_json` combines confirmed and unconfirmed records in `txs`. `Transaction.to_json` returns `{amount,crypto,addr,txid,status:'CONFIRMED'}`; `UnconfirmedTransaction.to_json` uses the same fields with `status:'UNCONFIRMED'`. **Neither returns transaction-level `amount_fiat`.** Earlier sibling fixtures incorrectly assumed that extra field; it is not required, summed or trusted here.

Settlement validation:

- Count only matching-network USDT transactions with **explicit `CONFIRMED` status**. Ignore `UNCONFIRMED` records, including an unconfirmed copy of a confirmed hash; missing/unknown settlement transaction statuses fail closed. `receivedCrypto` is the exact confirmed token sum, never the sum of all provider history.
- Require unique confirmed settlement transaction IDs and valid exact decimal crypto amounts. Support upstream `amount` and the compatibility alias `amount_crypto`; if both appear they must agree.
- If a confirmed settlement transaction returns `addr`, it must be a nonempty string and must match the saved address when available. An omitted address is not invented. After an ambiguous creation without a saved address, there is no independent local destination comparison available.
- Ignore native fee/history entries **only for the matching network**: `TON` for `ton`, `TRX` for `trc20`, `BNB` for `bep20`, even if they share a transaction ID with a token transfer. They never contribute to the confirmed crypto sum. Reject any other unexpected currency.
- Only authenticated invoice `PAID`/`OVERPAID` with `balance_fiat >= stored amountUsd`, matching original invoice price, and **nonzero confirmed settlement tokens** can activate. Invoice aggregate fiat fields are the authority; do not reconstruct fiat value from nonexistent transaction fields.
- When the original `shkeeperAmountCrypto` is saved, require the confirmed settlement sum to meet it **exactly or exceed it, with no tolerance**. Upstream `Invoice.update_with_tx` can add native-currency fiat value to the invoice balance, so the crypto bound prevents native funds from covering missing USDT. If the quote was lost during ambiguous creation, rely on the authenticated matching invoice status/price/fiat balance plus positive confirmed token evidence; an unknown original crypto quote cannot be independently checked or guessed.

No floating-point comparisons or payment tolerances are applied. Provider `PAID` tolerances or subsequent quote recalculation can make the provider report paid while the original stored crypto/fiat bounds remain unmet; those orders fail closed for operator investigation rather than silently weakening the policy. The pinned source recalculates quotes after a wallet `recalc` interval expressed in hours; the stored initial quote is not refreshed by this backend. Verify deployment-specific rate/rounding/recalculation behavior before rollout.

Activation and the conditional `updateMany` paid claim run in the same Prisma transaction. A losing concurrent webhook/cron does not activate twice; activation failure rolls back the paid claim. Before reading subscription state, the shared `activatePaidSubscriptionInTransaction` helper obtains a parameterized PostgreSQL `SELECT ... FOR UPDATE` on the user row. This serializes extensions from different paid orders/providers, so two successful payments cannot overwrite each other's subscription duration. This does **not** change or fix the pre-existing SBP/Stars same-order read/update claim behavior. Partial receipt snapshots are serialized and cannot reduce previously recorded receipt totals. Old/locally expired orders are still reconcilable. Notifications are best-effort after activation; they are not an outbox and a process crash/Telegram error may omit a success message, without losing activation.

Cron runs every 30 seconds (no overlapping runs in one process), selecting up to 100 unpaid SHKeeper records, oldest last-check first including nulls. It checks batches of five; failed records also rotate to the end. No age cutoff or local expiry is used. Multiple instances may check the same invoice; database claims ensure activation idempotency. At high backlog/provider latency, reconciliation may take multiple ticks; monitor pending age/count and failure logs rather than assuming a guaranteed 30-second settlement SLA.

## Migration and rollout

1. Back up PostgreSQL. Before switching providers, reconcile outstanding Crypto Pay invoices using the old deployment or an operator process. The new deployment deliberately does **not** poll the retired provider. Do not relabel old orders as SHKeeper. Keep historical data for audit/refunds.
2. Install locked dependencies with a supported Node runtime (`npm ci`; Prisma 7 requires a recent Node 20/22+). Run `npx prisma validate`, `npm test -- --runInBand`, and `npm run build`.
3. Run `npx prisma migrate deploy` against the intended database **before** serving this build. Migration `20261025120000_shkeeper_payments` adds `SHKEEPER`, nullable provider metadata fields and a reconciliation index; no legacy data is deleted/rewritten. Client generation runs on install; regenerate with `npx prisma generate` if needed.
4. Configure provider credentials, callback URL, webhook rotation keys and enabled network wallets. Use a canary user to verify all live cases below, then enable frontend checkout. SBP/Stars remain available if crypto is unconfigured.
5. Monitor `SHKeeper reconciliation failed`, `SHKeeper creation incomplete` and activation notification warnings. Check status/price/network mismatches in the provider/admin view without dumping secrets. Monitor outstanding partial payments.
6. Rollback: disable crypto checkout/keys, drain/reconcile existing SHKeeper payments with a compatible worker, then roll back application code if needed. Do not drop enum values/columns or delete funded invoices; the additive migration can remain.

### Ambiguous creation / timeout recovery

An order with its owner, price, plan and network is saved **before** calling `payment_request`. A timeout can mean the provider created an invoice but the response was lost. Such records are kept and reconciled by external ID, even without transfer instructions, so a later authoritative payment can still activate. The creation failure returns 503 with `orderId` for support. Repeated checkout for the same owner/tariff/plan/network returns that unresolved order's actionable 503 without another provider creation request. After successful setup, repeated checkout returns the same complete pending invoice. Do not replay provider creation or auto-create a replacement.

The pinned invoice GET response does not return the original crypto quote or a top-level wallet. Transaction `addr` may appear after a transfer, but does not reconstruct the original prepayment quote. Incomplete records are excluded from the pending checkout list. Owner detail returns 503 with the order ID while unpaid rather than inventing an address/amount; after authoritative settlement it returns a generic `PAID` payment object even if instructions remain missing. Support must look up the exact external ID in SHKeeper, verify invoice identity/currency/price, and recover the original instructions through an approved operator workflow; do not infer an address or replay creation until provider idempotency has been verified. This limitation cannot safely be solved by guessing undocumented API behavior.

## Required live checks (not performed by unit tests)

- Confirm enabled currencies and real `payment_request` responses on TON, TRC20 and BEP20: numeric/string IDs, exact amounts, wallet, fiat price and `recalculate_after` semantics.
- Make small test transfers on **each network**: unpaid → partial → full, overpayment, late/top-up after recalculation window, duplicate callbacks and missed callback recovered by cron. Confirm `balance_fiat` represents received funds, upstream-shaped transactions without `amount_fiat`, explicit confirmed/unconfirmed status, returned destination addresses, native fee entries, fiat rounding/fees/tolerance, and whether an external ID can produce multiple invoices. Include mixed confirmed/unconfirmed/native histories and verify neither native nor unconfirmed value can fund the saved crypto quote. Strict mismatches must not activate.
- Verify real callback headers, raw-body HMAC, source keys/rotation, timestamp/retries and HTTPS reachability. Test invalid and replayed signatures and an unsigned forged `paid:true` payload.
- With PostgreSQL, race callback and cron in separate processes for the same order; check exactly one subscription extension, rollback on activation failure, and restart recovery. Also settle two different orders for the same user concurrently (including different providers), verifying both durations are preserved, and race identical checkout requests, verifying only one provider invoice is created. Unit tests use transactional/per-user-lock fakes, not real database lock tests.
- Lose/drop a creation response deliberately; verify 503 + the same `orderId` on repeated checkout, omission from the pending list, external-ID reconciliation, a generic `PAID` detail response after settlement, and operator instruction recovery without duplicate invoices. Test stale partial snapshots and provider outage/backlog fairness.
- Verify JWT authentication, another owner's 404, pending recovery after closing/reopening the app, no amount tampering, frontend query hints and fallback bot instructions. Test one real SBP and Stars payment as regression smoke checks.
- Validate initial quote versus top-up amounts after `recalculate_after`. Do not interpret it as expiry. If the provider requires refreshed quotes, add a verified quote-refresh contract before production rather than presenting guessed replacement amounts.
