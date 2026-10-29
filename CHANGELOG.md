# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0-beta.1] - Unreleased

### Added

- `PaycrestProtocol`, a WDK `FiatProtocol` for Paycrest on-ramp (`buy`) and off-ramp (`sell`) through the Paycrest Sender API v2.
- `quoteBuy` and `quoteSell` from Paycrest's public rates, for crypto- or fiat-denominated amounts, with the ranked provider queue in `metadata`.
- `getSupportedCryptoAssets`, `getSupportedFiatCurrencies` and `getSupportedCountries` discovered from `GET /v2/tokens` and `GET /v2/currencies`.
- `getTransactionDetail` with direction-aware status mapping.
- `checkoutUrl` and `getOrder` backend callbacks, so the module never holds Paycrest credentials.
- Optional server helpers under `@paycrest/wdk-protocol-fiat-paycrest/server`: `PaycrestSenderClient`, `buildOrderPayload`, `verifyWebhookSignature`, `parseWebhookEvent`, `renderCheckoutPage` and `createPaycrestHandler`.
- Bare runtime entry point, TypeScript declarations, examples and a read-only live smoke test.
