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

/** @typedef {import('../paycrest-protocol.js').PaycrestCheckoutRequest} PaycrestCheckoutRequest */
/** @typedef {import('../paycrest-protocol.js').PaycrestOrderPayload} PaycrestOrderPayload */

/**
 * Server-controlled order fields. They are never taken from the client
 * request; set them here so that fee and routing policy stays on your backend.
 * @typedef {Object} PaycrestOrderDefaults
 * @property {string} [senderFee] - Fixed sender fee in crypto units. Mutually exclusive with `senderFeePercent`.
 * @property {string} [senderFeePercent] - Sender fee percentage. Mutually exclusive with `senderFee`.
 * @property {string} [senderFeeAddress] - Where your sender fee is paid.
 * @property {'sender' | 'customer'} [transactionFeePayer] - Who pays the transaction fee.
 */

export class PaycrestRequestError extends Error {
  /**
   * Thrown when a client request to the server helper is invalid.
   * @param {string} message - The error's message.
   * @param {number} [statusCode] - The HTTP status code to respond with (default: 400).
   */
  constructor (message, statusCode = 400) {
    super(message)

    this.name = 'PaycrestRequestError'

    /** @type {number} */
    this.statusCode = statusCode
  }
}

const DIRECTION_TYPES = {
  onramp: { source: 'fiat', destination: 'crypto' },
  offramp: { source: 'crypto', destination: 'fiat' }
}

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/

const _isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Validates a checkout request received from a client and builds the order
 * payload to send to Paycrest. Only the fields `PaycrestProtocol` produces are
 * kept, and fee settings come exclusively from `defaults`.
 * @param {PaycrestCheckoutRequest} request - The request body sent by the `checkoutUrl` callback.
 * @param {PaycrestOrderDefaults} [defaults] - Server-controlled order fields.
 * @returns {PaycrestOrderPayload & PaycrestOrderDefaults} The payload for `POST /v2/sender/orders`.
 * @throws {PaycrestRequestError} If the request is malformed.
 */
export function buildOrderPayload (request, defaults = {}) {
  if (!_isObject(request) || !_isObject(request.order)) {
    throw new PaycrestRequestError('Expected a JSON body of the form { direction, order }')
  }

  const { direction, order } = request
  const types = DIRECTION_TYPES[direction]

  if (!types) {
    throw new PaycrestRequestError('\'direction\' must be \'onramp\' or \'offramp\'')
  }

  if (!_isObject(order.source) || order.source.type !== types.source ||
    !_isObject(order.destination) || order.destination.type !== types.destination) {
    throw new PaycrestRequestError(`An ${direction} order needs a '${types.source}' source and a '${types.destination}' destination`)
  }

  if (typeof order.amount !== 'string' || !AMOUNT_PATTERN.test(order.amount) || Number(order.amount) <= 0) {
    throw new PaycrestRequestError('\'order.amount\' must be a positive decimal string')
  }

  if (order.amountIn !== undefined && order.amountIn !== 'crypto' && order.amountIn !== 'fiat') {
    throw new PaycrestRequestError('\'order.amountIn\' must be \'crypto\' or \'fiat\'')
  }

  const payload = {
    amount: order.amount,
    amountIn: order.amountIn ?? 'crypto',
    source: order.source,
    destination: order.destination
  }

  if (typeof order.reference === 'string') payload.reference = order.reference
  if (typeof order.rate === 'string') payload.rate = order.rate

  for (const key of ['senderFee', 'senderFeePercent', 'senderFeeAddress', 'transactionFeePayer']) {
    if (defaults[key] !== undefined) payload[key] = defaults[key]
  }

  return payload
}
