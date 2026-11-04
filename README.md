# @paycrest/wdk-protocol-fiat-paycrest

Paycrest fiat on-ramp and off-ramp module for Tether's [Wallet Development Kit (WDK)](https://docs.wdk.tether.io/). It implements the WDK `FiatProtocol` interface from `@tetherto/wdk-wallet/protocols` on top of the [Paycrest Sender API](https://docs.paycrest.io/implementation-guides/sender-api-integration).

[Paycrest](https://paycrest.io) is a neutral, non-custodial stablecoin-fiat routing protocol. Liquidity providers compete to fill orders. Each order routes between a stablecoin on-chain and a local bank account or mobile money wallet; the stablecoin is locked in on-chain escrow until the provider confirms the fiat payout.

> This is a community module maintained by Paycrest. It is not built, endorsed or maintained by Tether or the WDK team.

> This package is in beta. Test with small amounts first: Paycrest runs on mainnet only.

## Contents

- [Features](#features)
- [Supported corridors](#supported-corridors)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Server setup](#server-setup)
- [Configuration](#configuration)
- [Usage with WDK core](#usage-with-wdk-core)
- [API reference](#api-reference)
- [Server helper reference](#server-helper-reference)
- [Differences from widget-based fiat modules](#differences-from-widget-based-fiat-modules)
- [Development](#development)

## Features

- **On-ramp** (`buy`): the user pays fiat into a virtual bank or mobile money account and receives USDT or USDC in their wallet.
- **Off-ramp** (`sell`): the user sends USDT or USDC and the recipient receives fiat in a bank account or mobile money wallet.
- **Live quotes** from Paycrest's public rates endpoint, with the ranked provider queue so the order can be routed to the quote the user saw.
- **Discovery from the API**: tokens, networks, decimals and fiat currencies come from `GET /v2/tokens` and `GET /v2/currencies`, never a hardcoded list.
- **Order tracking** with Paycrest statuses normalised to WDK's `completed`, `failed` and `in_progress`.
- **No credentials on the client.** The module never holds or sends your Paycrest API key or secret. Order creation and lookup go through callbacks to your backend, as in the Transak module.
- **Optional server helper** (`@paycrest/wdk-protocol-fiat-paycrest/server`) with a Sender API client, webhook signature verification, a funding instructions page and a framework-agnostic request handler.
- ESM, TypeScript declarations, and [Bare](https://github.com/holepunchto/bare) runtime support.

## Supported corridors

| Fiat | Country | Stablecoins | On-ramp (`buy`) | Off-ramp (`sell`) | Payout and pay-in channels |
|------|---------|-------------|-----------------|-------------------|----------------------------|
| NGN | Nigeria | USDT, USDC | Yes | Yes | Bank, mobile |
| KES | Kenya | USDT, USDC | Yes | Yes | Bank, M-Pesa (phone, Till, Paybill) |
| UGX | Uganda | USDT, USDC | No | Yes | Bank, mobile money |
| TZS | Tanzania | USDT, USDC | No | Yes | Bank, mobile money |

USDT and USDC are available on Ethereum, Base, Arbitrum One, Polygon, BNB Smart Chain, Celo, Starknet and Solana, and USDT on Tron. Treat this table as a guide: call `getSupportedCryptoAssets()` and `getSupportedFiatCurrencies()` for the live list. Availability for a specific token, network, direction and amount depends on live provider coverage, which `quoteBuy` and `quoteSell` confirm; they throw a `PaycrestApiError` with status `404` when no provider can serve the request.

## How it works

```
 Wallet app (WDK)                    Your backend                        Paycrest API
 ----------------                    ------------                        ------------
 PaycrestProtocol
   quoteBuy / quoteSell  ------------------------------------------->  GET /v2/rates/... (public)
   getSupported*         ------------------------------------------->  GET /v2/tokens, /v2/currencies (public)
   buy / sell  --checkoutUrl()-->   POST /orders          --API-Key-->  POST /v2/sender/orders
               <-- { url, orderId, order } ------------------------------  providerAccount (funding instructions)
   getTransactionDetail --getOrder()--> GET /orders/:id   --API-Key-->  GET /v2/sender/orders/:id
                                    POST /webhooks  <--signed with API secret--  payment_order.* events
```

1. Quotes and discovery use Paycrest's public endpoints, which need no key and allow cross-origin requests, so `PaycrestProtocol` can run inside the wallet app.
2. `buy` and `sell` assemble the exact `POST /v2/sender/orders` payload and hand it to your `checkoutUrl` callback. Your backend adds its API key (and any sender fee settings), creates the order and returns a URL where the user sees how to fund it.
3. `getTransactionDetail` asks your `getOrder` callback for the order and maps its status.
4. Webhooks are verified on your backend with your API secret.

## Installation

```bash
npm install @paycrest/wdk-protocol-fiat-paycrest
```

You also need a Paycrest sender account. Sign up at [app.paycrest.io](https://app.paycrest.io) and complete KYB to get:

- an **API key**, sent as the `API-Key` header on authenticated Sender API requests, and
- an **API secret**, used only to verify webhook signatures.

Both are server-side secrets. Never put them in a wallet app, a browser bundle or a mobile binary.

## Server setup

Your backend needs three routes. You can write them yourself with any framework, or mount the optional helper.

| Route | Backs | Does |
|-------|-------|------|
| `POST /orders` | `checkoutUrl` | Validates the request, adds your server-side order settings, calls `POST /v2/sender/orders` and returns `{ url, orderId, order }` |
| `GET /orders/:id` | `getOrder` | Calls `GET /v2/sender/orders/:id` after checking the order belongs to the user |
| `POST /webhooks` | your order records | Verifies `X-Paycrest-Signature` and updates your records |

### With the server helper

```js
import { createServer } from 'node:http'
import { createPaycrestHandler } from '@paycrest/wdk-protocol-fiat-paycrest/server'

const paycrest = createPaycrestHandler({
  apiKey: process.env.PAYCREST_API_KEY,
  apiSecret: process.env.PAYCREST_API_SECRET,
  publicBaseUrl: 'https://your-backend.example.com/paycrest',
  authorize: async (req, { action, orderId }) => {
    // Your session or token check. Return true to allow.
    return isAllowed(req, action, orderId)
  },
  onOrderCreated: async (order, req) => {
    // Store order.id against the authenticated user.
  },
  onWebhook: async ({ event, data, wdkStatus }) => {
    // Update your records. Branch on `event`, not on `data.status`.
  }
})

createServer((req, res) => {
  if (!req.url.startsWith('/paycrest/')) return res.writeHead(404).end()
  req.url = req.url.slice('/paycrest'.length)
  paycrest(req, res)
}).listen(3000)
```

The handler serves, relative to where it is mounted:

- `POST /orders`, `GET /orders/:id` and `POST /webhooks` as described above (the webhook route exists only when `apiSecret` is set).
- `GET /checkout/:id`, a small self-contained page with the order's funding instructions and status. By default the checkout URL returned to the wallet is `${publicBaseUrl}/checkout/{orderId}`. Pass `checkoutUrl: (order) => ...` to point users at a page in your own app instead, or `checkoutPage: false` to turn the built-in page off.

With Express, mount it as middleware. The webhook route needs the raw body, so mount the handler before any JSON body parser, or give it `express.raw()`:

```js
app.use('/paycrest', express.raw({ type: 'application/json' }), paycrest)
```

`POST /orders` accepts a body that a JSON parser already parsed, so `express.json()` on that route also works.

A complete runnable example is in [`examples/server.js`](examples/server.js).

### Security checklist

- Keep `PAYCREST_API_KEY` and `PAYCREST_API_SECRET` in your backend environment only. See [`.env.example`](.env.example).
- `POST /orders` and `GET /orders/:id` respond 403 unless `authorize` returns true, or you set `allowUnauthenticated: true`. `GET /checkout/:id` stays open. In `authorize`, check that a lookup is for an order the authenticated user created.
- Fee and routing policy is yours. The helper drops any `senderFee`, `senderFeePercent`, `senderFeeAddress` or `transactionFeePayer` sent by the client; set them through `orderDefaults` if you charge a sender fee.
- Rate-limit `POST /orders` and restrict it to your app's origins.
- The built-in checkout page shows only funding instructions and status. It never renders the recipient's bank details or KYC data.

### Writing the routes yourself

`PaycrestSenderClient`, `buildOrderPayload` and `verifyWebhookSignature` are exported separately, so you can wire them into any framework:

```js
import { PaycrestSenderClient, buildOrderPayload, verifyWebhookSignature } from '@paycrest/wdk-protocol-fiat-paycrest/server'

const client = new PaycrestSenderClient({ apiKey: process.env.PAYCREST_API_KEY })

// POST /orders
if (!(await isAllowedToCreateOrder(req))) return res.status(403).end()
const order = await client.createOrder(buildOrderPayload(req.body))
res.json({ url: `https://your-app.example.com/pay/${order.id}`, orderId: order.id, order })

// GET /orders/:id
if (!(await isOrderOwner(req, req.params.id))) return res.status(403).end()
res.json(await client.getOrder(req.params.id))

// POST /webhooks (raw body)
if (!verifyWebhookSignature(rawBody, req.headers['x-paycrest-signature'], process.env.PAYCREST_API_SECRET)) {
  return res.status(401).end()
}
```

Authorize every route against your own user and order records, rate-limit `POST /orders`, and restrict it to your own origins.

## Configuration

```js
import PaycrestProtocol from '@paycrest/wdk-protocol-fiat-paycrest'

const paycrest = new PaycrestProtocol(account, {
  network: 'base',
  checkoutUrl: async (request) => {
    const resp = await fetch('https://your-backend.example.com/paycrest/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify(request)
    })
    if (!resp.ok) throw new Error(`Checkout failed: ${resp.status}`)
    return resp.json()
  },
  getOrder: async (orderId) => {
    const resp = await fetch(`https://your-backend.example.com/paycrest/orders/${encodeURIComponent(orderId)}`, {
      headers: { authorization: `Bearer ${sessionToken}` }
    })
    if (!resp.ok) throw new Error(`Order lookup failed: ${resp.status}`)
    return resp.json()
  }
})
```

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `checkoutUrl` | `(request) => Promise<string \| { url, orderId?, order? }>` | For `buy`/`sell` | - | Receives `{ direction, order }` and returns the checkout URL from your backend. Return the object form to get `orderId` and the order (with funding instructions) back from `buy`/`sell`. |
| `getOrder` | `(orderId) => Promise<PaycrestOrder>` | For `getTransactionDetail` | - | Returns the Paycrest order from your backend. The raw API envelope `{ status, data }` is also accepted. |
| `network` | string | No | - | Default network (`base`, `ethereum`, `arbitrum-one`, `polygon`, `bnb-smart-chain`, `celo`, `starknet`, `tron`, `solana`). Needed when a token exists on several networks and a call omits `config.network`. |
| `baseUrl` | string | No | `https://api.paycrest.io` | Paycrest API origin. |
| `cacheTime` | number | No | `600000` | Milliseconds to cache tokens and currencies. |
| `fetch` | function | No | global `fetch` | Custom fetch implementation. |

The constructor throws if it receives `apiKey` or `apiSecret`, so credentials cannot end up in client code by accident.

The `account` argument is optional. It is used only as the default stablecoin recipient for `buy` and the default refund address for `sell`. With WDK core, the registered account is passed automatically.

## Usage with WDK core

Register the module with [`registerProtocol`](https://docs.wdk.tether.io/sdk/core-module/guides/protocol-integration/) and get it from an account by label:

```js
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import PaycrestProtocol from '@paycrest/wdk-protocol-fiat-paycrest'

const wdk = new WDK(seedPhrase)
  .registerWallet('base', WalletManagerEvm, { provider: 'https://mainnet.base.org' })
  .registerProtocol('base', 'paycrest', PaycrestProtocol, { network: 'base', checkoutUrl, getOrder })

const account = await wdk.getAccount('base', 0)
const paycrest = account.getFiatProtocol('paycrest')
```

All amounts are in base units, as in every WDK fiat module: crypto in the token's on-chain base unit (6 decimals for most USDT and USDC deployments, 18 on BNB Smart Chain) and fiat in its smallest unit, using the decimals Paycrest reports (2 for NGN, KES, UGX and TZS).

### Quotes

```js
// Off-ramp: how much NGN for 100 USDT?
const sellQuote = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 100_000_000n })

// On-ramp: how much USDC for 50,000 KES?
const buyQuote = await paycrest.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'KES', fiatAmount: 5_000_000n })

console.log(buyQuote.cryptoAmount, buyQuote.rate, buyQuote.metadata.providerIds)
```

Both directions accept either `cryptoAmount` or `fiatAmount`. `rate` is fiat per one token, in major units. Amounts are rounded against the user: the quote never overstates what they receive or understates what they pay. `fee` is `0n` because Paycrest's public rate already reflects the provider's price; any order-level fees are returned by your backend when it creates the order.

### Off-ramp (sell)

```js
const { sellUrl, orderId, metadata: order } = await paycrest.sell({
  cryptoAsset: 'USDT',
  fiatCurrency: 'NGN',
  cryptoAmount: 100_000_000n,
  config: {
    recipient: {
      institution: 'GTBINGLA', // from GET /v2/institutions/NGN
      accountIdentifier: '0123456789',
      accountName: 'Ada Lovelace',
      memo: 'Rent'
    },
    reference: 'your-order-id',
    rate: sellQuote.rate, // optional: lock the quoted rate
    providerIds: sellQuote.metadata.providerIds // optional: route to the quoted providers
  }
})
```

`sellUrl` is the page from your backend that tells the user where to send the stablecoin. Because the user already holds the stablecoin in their WDK wallet, you can also fund the order directly with `account.transfer`, sending exactly `order.providerAccount.amountToTransfer` to `order.providerAccount.receiveAddress` before `validUntil` (and including `providerAccount.memo` when present). See [`examples/wdk-usage.js`](examples/wdk-usage.js).

For Kenyan M-Pesa, use institution `SAFAKEPC` and set `recipient.metadata.channel` to `Mobile`, `Till` or `Paybill` (with `businessNumber` for Paybill). Optional fields: `config.kyc` (the sender), `config.recipientKyc` (the recipient), `config.country`, and `refundAddress` (defaults to the account address).

### On-ramp (buy)

Paycrest requires the paying customer's identity on every on-ramp order, and a fiat refund account in the customer's own name.

```js
const { buyUrl, orderId } = await paycrest.buy({
  cryptoAsset: 'USDC',
  fiatCurrency: 'NGN',
  fiatAmount: 5_000_000n, // 50,000.00 NGN
  config: {
    kyc: {
      entityType: 'person',
      personDetails: {
        fullName: 'Ada Lovelace',
        birthDate: '1990-04-12',
        idDocument: { type: 'BVN', number: '00000000000', issuerCountry: 'NG' }
      }
    },
    refundAccount: { institution: 'GTBINGLA', accountIdentifier: '0123456789', accountName: 'Ada Lovelace' }
  }
})
```

`buyUrl` shows the virtual account the user pays into. The stablecoin goes to `recipient` or, by default, the account address. KYC rules differ per currency (for example a BVN or NIN for NGN, and a Kenyan phone number in `contact.phoneE164` for KES); see [On-ramp customer KYC](https://docs.paycrest.io/implementation-guides/sender-api-integration#on-ramp-customer-kyc). On-ramp pins a single provider, so only the first of `config.providerIds` is sent.

### Track transactions

```js
const tx = await paycrest.getTransactionDetail(orderId)
console.log(tx.status, tx.cryptoAsset, tx.fiatCurrency, tx.metadata.status)
```

| WDK status | Off-ramp Paycrest status | On-ramp Paycrest status |
|------------|--------------------------|-------------------------|
| `completed` | `validated`, `settling`, `settled` | `settled` |
| `failed` | `refunding`, `refunded`, `expired`, `cancelled` | `refunding`, `refunded`, `expired`, `cancelled` |
| `in_progress` | `initiated`, `deposited`, `pending`, `fulfilling`, `fulfilled`, and any unknown status | `initiated`, `pending`, `fulfilling`, `validated`, `settling`, and any unknown status |

An off-ramp is complete at `validated`, when the provider confirms the fiat payout. An on-ramp is complete at `settled`, when the stablecoin is confirmed on-chain. An on-ramp held for compliance review stays `pending` (so `in_progress`) until it settles or is refunded.

### Supported assets, currencies and countries

```js
await paycrest.getSupportedCryptoAssets() // [{ code: 'USDT', networkCode: 'base', decimals: 6, metadata: { contractAddress, ... } }, ...]
await paycrest.getSupportedFiatCurrencies() // [{ code: 'NGN', decimals: 2, name: 'Nigerian Naira', ... }, ...]
await paycrest.getSupportedCountries() // [{ code: 'NG', isBuyAllowed: true, isSellAllowed: true, ... }, ...]
```

Paycrest has no countries endpoint, so countries are derived from the listed currencies.

## API reference

### `new PaycrestProtocol(account?, config?)`

Extends `FiatProtocol` from `@tetherto/wdk-wallet/protocols`. See [Configuration](#configuration).

| Method | Paycrest endpoint | Returns |
|--------|-------------------|---------|
| `quoteBuy({ cryptoAsset, fiatCurrency, cryptoAmount \| fiatAmount, config? })` | `GET /v2/rates/{network}/{token}/{amount}/{fiat}?side=buy` | `{ cryptoAmount, fiatAmount, fee, rate, metadata }` |
| `quoteSell({ cryptoAsset, fiatCurrency, cryptoAmount \| fiatAmount, config? })` | `GET /v2/rates/{network}/{token}/{amount}/{fiat}?side=sell` | `{ cryptoAmount, fiatAmount, fee, rate, metadata }` |
| `buy({ cryptoAsset, fiatCurrency, cryptoAmount \| fiatAmount, recipient?, config })` | via `checkoutUrl` to `POST /v2/sender/orders` | `{ buyUrl, orderId?, metadata? }` |
| `sell({ cryptoAsset, fiatCurrency, cryptoAmount \| fiatAmount, refundAddress?, config })` | via `checkoutUrl` to `POST /v2/sender/orders` | `{ sellUrl, orderId?, metadata? }` |
| `getTransactionDetail(orderId)` | via `getOrder` to `GET /v2/sender/orders/{id}` | `{ status, cryptoAsset, fiatCurrency, metadata }` |
| `getSupportedCryptoAssets()` | `GET /v2/tokens` | `[{ code, networkCode, decimals, name, metadata }]` |
| `getSupportedFiatCurrencies()` | `GET /v2/currencies` | `[{ code, decimals, name, metadata }]` |
| `getSupportedCountries()` | derived from `GET /v2/currencies` | `[{ code, isBuyAllowed, isSellAllowed, name, metadata }]` |

**Quote `config`:** `network`, `providerId`.

**`buy` `config`:** `kyc` (required), `refundAccount` (required), `network`, `country`, `recipientKyc`, `reference`, `rate`, `providerIds`.

**`sell` `config`:** `recipient` (required: `institution`, `accountIdentifier`, `accountName`, optional `memo` and `metadata`), `network`, `country`, `kyc`, `recipientKyc`, `reference`, `rate`, `providerIds`.

### Errors

| Error | When |
|-------|------|
| `ValueError` (from `@tetherto/wdk-wallet`) | Invalid options: both or neither amount, non-integer amounts, missing callbacks, missing KYC or accounts, ambiguous network |
| `NoSuchElementError` (from `@tetherto/wdk-wallet`) | Unknown token, currency, or token not available on the requested network |
| `PaycrestApiError` | A Paycrest request failed. Has `status`, `data` (Paycrest's error details) and `retryAfter` (seconds, on rate limiting) |

### Other exports

- `toWdkStatus(status, direction)` and `getOrderDirection(order)`: the status mapping above, for use in your own webhook handling.

## Server helper reference

Import from `@paycrest/wdk-protocol-fiat-paycrest/server`, in backend code only.

| Export | Description |
|--------|-------------|
| `createPaycrestHandler(options)` | `(req, res, next?)` handler for `node:http` and Express-style routers. Options: `apiKey`, `apiSecret`, `publicBaseUrl` or `checkoutUrl`, `authorize`, `allowUnauthenticated`, `orderDefaults`, `onOrderCreated`, `onWebhook`, `checkoutPage`, `bodyLimit`, `baseUrl`, `fetch`, `client`. |
| `PaycrestSenderClient` | `createOrder(payload)`, `getOrder(id)`, `verifyAccount({ institution, accountIdentifier, metadata? })`. Sends your API key. |
| `buildOrderPayload(request, defaults?)` | Validates a `{ direction, order }` request from the client and returns the order payload, with fee fields taken only from `defaults`. Throws `PaycrestRequestError`. |
| `verifyWebhookSignature(rawBody, signature, secret)` | Timing-safe check of `X-Paycrest-Signature` (hex HMAC-SHA256 of the raw body). |
| `parseWebhookEvent(rawBody, signature, secret)` | Verifies and parses a webhook, adding `wdkStatus`. |
| `renderCheckoutPage(order, options?)` | HTML funding instructions for an order. |

## Differences from widget-based fiat modules

The WDK fiat interface was designed around hosted checkout widgets (MoonPay, Transak): `buy` and `sell` return a URL, and the provider's widget collects payment details and KYC. Paycrest is API-first, so this module bridges the two models:

- **The URL is yours.** Paycrest has no hosted checkout widget. `buyUrl`/`sellUrl` come from your backend: the helper's instructions page or a page in your app. `buy`/`sell` also return `orderId` and the created order (with `providerAccount`) when your callback provides them.
- **Details are collected up front.** A widget would ask for payout accounts and identity. With Paycrest you pass them in `config`: the payout `recipient` for `sell`, and `kyc` plus `refundAccount` for `buy`.
- **Network is explicit.** Core options carry no network. Pass `config.network` or set a default `network`, as with the other modules.
- **No fee in quotes.** `fee` is `0n`. Public rates already reflect the provider's price; order-level fees appear only on the created order.
- **Off-ramp can skip the page.** The wallet can send the deposit itself with `account.transfer`, which a widget flow cannot do.
- **Webhooks are outside the interface.** WDK polls with `getTransactionDetail`; the server helper verifies Paycrest webhooks for your own records.
- **Mainnet only.** There is no sandbox environment; test with small amounts.

## Development

```bash
npm install
npm test            # unit tests, all HTTP mocked
npm run lint        # standard
npm run build:types # regenerate types/ from JSDoc
npm run smoke       # live, read-only quotes against Paycrest's public endpoints (no key, no orders)
```

## Resources

- [Paycrest Sender API integration](https://docs.paycrest.io/implementation-guides/sender-api-integration)
- [Paycrest API reference](https://docs.paycrest.io/api-reference/introduction)
- [Paycrest transaction lifecycle](https://docs.paycrest.io/concepts/transaction-lifecycle)
- [WDK fiat modules](https://docs.wdk.tether.io/sdk/fiat-modules/)

## License

[Apache-2.0](LICENSE)
