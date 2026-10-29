# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in this package, please **do not** open a public GitHub issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/paycrest/wdk-protocol-fiat-paycrest/security/advisories/new) or by emailing **support@paycrest.io** with:

- a description of the vulnerability and its potential impact,
- steps to reproduce it, and
- any relevant logs, code snippets or a proof of concept.

We will acknowledge your report as soon as possible and work with you to understand and address the issue. Please allow a reasonable amount of time to investigate and ship a fix before any public disclosure.

## Scope

This policy covers the `@paycrest/wdk-protocol-fiat-paycrest` package: quoting, order payload construction, status mapping, and the optional server helpers (Sender API client, webhook verification, checkout page and request handler).

Report vulnerabilities in `@tetherto/wdk-wallet` or other WDK packages to the [WDK](https://github.com/tetherto/wdk) maintainers.

## Handling credentials

- Your Paycrest API key and API secret belong on your backend only. `PaycrestProtocol` refuses them in its configuration.
- Never commit real keys. Use `.env` files that are excluded from version control; `.env.example` contains placeholders only.
- If a key is exposed, rotate it from the [Paycrest dashboard](https://app.paycrest.io) immediately.
