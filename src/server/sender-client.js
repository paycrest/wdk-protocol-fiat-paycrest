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

import { PAYCREST_API_ORIGIN, requestPaycrest } from '../http.js'

/** @typedef {import('../paycrest-protocol.js').PaycrestOrderPayload} PaycrestOrderPayload */
/** @typedef {import('../paycrest-protocol.js').PaycrestOrder} PaycrestOrder */

/**
 * @typedef {Object} PaycrestSenderClientConfig
 * @property {string} apiKey - Your Paycrest Sender API key. Server-side only.
 * @property {string} [baseUrl] - Paycrest API origin (default: 'https://api.paycrest.io').
 * @property {typeof fetch} [fetch] - Custom fetch implementation (default: the global `fetch`).
 */

/**
 * @typedef {Object} PaycrestVerifyAccountRequest
 * @property {string} institution - The institution code (e.g. 'GTBINGLA').
 * @property {string} accountIdentifier - The account or mobile number.
 * @property {{ channel?: 'Mobile' | 'Till' | 'Paybill', businessNumber?: string }} [metadata] - KES channel hints.
 */

/**
 * A minimal, authenticated client for the Paycrest Sender API. Use it only on
 * your backend: it sends your API key on every request.
 */
export class PaycrestSenderClient {
  /**
   * @param {PaycrestSenderClientConfig} config - The client configuration.
   */
  constructor ({ apiKey, baseUrl = PAYCREST_API_ORIGIN, fetch: fetchImpl } = {}) {
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      throw new Error('PaycrestSenderClient requires a Paycrest Sender \'apiKey\'')
    }

    /** @private */
    this._apiKey = apiKey

    /** @private */
    this._baseUrl = baseUrl

    /** @private */
    this._fetch = fetchImpl
  }

  /**
   * Creates a payment order with `POST /v2/sender/orders`.
   * @param {PaycrestOrderPayload & Record<string, unknown>} payload - The order payload.
   * @returns {Promise<PaycrestOrder>} The created order, including `providerAccount` funding instructions.
   */
  async createOrder (payload) {
    return this._request('/v2/sender/orders', 'create Paycrest order', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  /**
   * Fetches a payment order with `GET /v2/sender/orders/{id}`.
   * @param {string} orderId - The Paycrest order id.
   * @returns {Promise<PaycrestOrder>} The order.
   */
  async getOrder (orderId) {
    if (typeof orderId !== 'string' || orderId.length === 0) {
      throw new Error('\'orderId\' must be a non-empty string')
    }

    return this._request(`/v2/sender/orders/${encodeURIComponent(orderId)}`, 'fetch Paycrest order')
  }

  /**
   * Resolves an account holder name with `POST /v2/verify-account`.
   * @param {PaycrestVerifyAccountRequest} request - The account to verify.
   * @returns {Promise<string>} The resolved account name, or 'OK' when the corridor returns no name.
   */
  async verifyAccount (request) {
    return this._request('/v2/verify-account', 'verify Paycrest account', {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  /** @private */
  async _request (path, description, init = {}) {
    return requestPaycrest(this._fetch ?? globalThis.fetch, new URL(path, this._baseUrl).toString(), description, {
      ...init,
      headers: {
        'API-Key': this._apiKey,
        ...(init.body ? { 'content-type': 'application/json' } : {})
      }
    })
  }
}
