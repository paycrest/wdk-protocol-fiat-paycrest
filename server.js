// Copyright 2026 Paycrest
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict'

// Server-side helpers. They hold your Paycrest API key and secret, so import
// this entry point only from backend code, never from a wallet or browser app.

/** @typedef {import('./src/server/sender-client.js').PaycrestSenderClientConfig} PaycrestSenderClientConfig */
/** @typedef {import('./src/server/sender-client.js').PaycrestVerifyAccountRequest} PaycrestVerifyAccountRequest */
/** @typedef {import('./src/server/order-policy.js').PaycrestOrderDefaults} PaycrestOrderDefaults */
/** @typedef {import('./src/server/webhook.js').PaycrestWebhookEvent} PaycrestWebhookEvent */
/** @typedef {import('./src/server/node-handler.js').PaycrestHandlerOptions} PaycrestHandlerOptions */
/** @typedef {import('./src/server/node-handler.js').PaycrestAuthorizeContext} PaycrestAuthorizeContext */

export { PaycrestSenderClient } from './src/server/sender-client.js'

export { buildOrderPayload, PaycrestRequestError } from './src/server/order-policy.js'

export { verifyWebhookSignature, parseWebhookEvent } from './src/server/webhook.js'

export { renderCheckoutPage } from './src/server/checkout-page.js'

export { createPaycrestHandler } from './src/server/node-handler.js'

export { PaycrestApiError } from './src/errors.js'

export { toWdkStatus, getOrderDirection } from './src/status.js'
