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

import { createHmac, timingSafeEqual } from 'node:crypto'

import { toWdkStatus, getOrderDirection } from '../status.js'

/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionStatus} FiatTransactionStatus */

/**
 * A verified Paycrest v2 webhook event.
 * @see https://docs.paycrest.io/implementation-guides/sender-api-integration#webhook-events
 * @typedef {Object} PaycrestWebhookEvent
 * @property {string} event - The event name (e.g. 'payment_order.settled'). Branch on this, not on `data.status`.
 * @property {string} [webhookVersion] - The payload version ('2' for v2 senders).
 * @property {Object} data - The order snapshot.
 * @property {FiatTransactionStatus} wdkStatus - The order's status normalised to the WDK fiat statuses.
 */

/**
 * Verifies the `X-Paycrest-Signature` header of a webhook delivery: a hex
 * HMAC-SHA256 of the raw request body, keyed with your API secret.
 * @param {Buffer | string} rawBody - The raw, unparsed request body.
 * @param {string | undefined} signature - The `X-Paycrest-Signature` header value.
 * @param {string} secret - Your Paycrest Sender API secret.
 * @returns {boolean} True if the signature is valid.
 */
export function verifyWebhookSignature (rawBody, signature, secret) {
  const sig = (signature && String(signature).trim().toLowerCase()) || ''
  const key = String(secret || '').trim()

  if (!sig || !key || rawBody === undefined || rawBody === null) return false

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')
  const computed = createHmac('sha256', key).update(body).digest('hex')

  if (computed.length !== sig.length) return false

  const expected = Buffer.from(computed, 'utf8')
  const received = Buffer.from(sig, 'utf8')

  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Verifies and parses a Paycrest webhook delivery.
 * @param {Buffer | string} rawBody - The raw, unparsed request body.
 * @param {string | undefined} signature - The `X-Paycrest-Signature` header value.
 * @param {string} secret - Your Paycrest Sender API secret.
 * @returns {PaycrestWebhookEvent} The verified event.
 * @throws {Error} If the signature is invalid or the body is not a webhook payload.
 */
export function parseWebhookEvent (rawBody, signature, secret) {
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    throw new Error('Invalid Paycrest webhook signature')
  }

  const payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody))

  if (!payload || typeof payload.event !== 'string' || !payload.data || typeof payload.data !== 'object') {
    throw new Error('Invalid Paycrest webhook payload')
  }

  return {
    ...payload,
    wdkStatus: toWdkStatus(payload.data.status, getOrderDirection(payload.data))
  }
}
