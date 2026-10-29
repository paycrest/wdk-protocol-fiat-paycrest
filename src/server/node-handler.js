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

import { PaycrestApiError } from '../errors.js'
import { PaycrestSenderClient } from './sender-client.js'
import { buildOrderPayload, PaycrestRequestError } from './order-policy.js'
import { parseWebhookEvent } from './webhook.js'
import { renderCheckoutPage } from './checkout-page.js'

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */
/** @typedef {import('../paycrest-protocol.js').PaycrestOrder} PaycrestOrder */
/** @typedef {import('../paycrest-protocol.js').PaycrestCheckoutRequest} PaycrestCheckoutRequest */
/** @typedef {import('./order-policy.js').PaycrestOrderDefaults} PaycrestOrderDefaults */
/** @typedef {import('./webhook.js').PaycrestWebhookEvent} PaycrestWebhookEvent */

/**
 * @typedef {Object} PaycrestAuthorizeContext
 * @property {'createOrder' | 'getOrder' | 'viewCheckout'} action - The action being requested.
 * @property {string} [orderId] - The order id, for 'getOrder' and 'viewCheckout'.
 * @property {PaycrestCheckoutRequest} [request] - The checkout request, for 'createOrder'.
 */

/**
 * @typedef {Object} PaycrestHandlerOptions
 * @property {string} [apiKey] - Your Paycrest Sender API key. Required unless `client` is given.
 * @property {string} [apiSecret] - Your Paycrest Sender API secret. Enables `POST /webhooks`.
 * @property {PaycrestSenderClient} [client] - A preconfigured Sender API client.
 * @property {string} [baseUrl] - Paycrest API origin, when building the client from `apiKey`.
 * @property {typeof fetch} [fetch] - Custom fetch implementation, when building the client from `apiKey`.
 * @property {string} [publicBaseUrl] - Public URL where this handler is mounted. Checkout URLs default to `${publicBaseUrl}/checkout/{orderId}`.
 * @property {(order: PaycrestOrder, req: IncomingMessage) => string | Promise<string>} [checkoutUrl] - Builds the checkout URL for a created order, e.g. a page in your own app. Overrides `publicBaseUrl`.
 * @property {PaycrestOrderDefaults | ((request: PaycrestCheckoutRequest, req: IncomingMessage) => PaycrestOrderDefaults | Promise<PaycrestOrderDefaults>)} [orderDefaults] - Server-controlled order fields, such as your sender fee settings.
 * @property {(req: IncomingMessage, context: PaycrestAuthorizeContext) => boolean | Promise<boolean>} [authorize] - Authorizes each request. Return false to respond 403. Strongly recommended in production.
 * @property {(order: PaycrestOrder, req: IncomingMessage, request: PaycrestCheckoutRequest) => void | Promise<void>} [onOrderCreated] - Called after an order is created, e.g. to store it against your user.
 * @property {(event: PaycrestWebhookEvent, req: IncomingMessage) => void | Promise<void>} [onWebhook] - Called for every verified webhook event.
 * @property {boolean} [checkoutPage] - Serve the built-in instructions page at `GET /checkout/{orderId}` (default: true).
 * @property {number} [bodyLimit] - Maximum request body size in bytes (default: 102,400).
 */

const DEFAULT_BODY_LIMIT = 100 * 1024

async function readRawBody (req, limit) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8')

  const chunks = []
  let size = 0

  for await (const chunk of req) {
    size += chunk.length

    if (size > limit) {
      throw new PaycrestRequestError('Request body is too large', 413)
    }

    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

async function readJsonBody (req, limit) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }

  const raw = await readRawBody(req, limit)

  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new PaycrestRequestError('Request body must be valid JSON')
  }
}

function send (res, statusCode, body, contentType = 'application/json; charset=utf-8') {
  res.statusCode = statusCode
  res.setHeader('content-type', contentType)
  res.setHeader('cache-control', 'no-store')
  res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body)
}

function sendError (res, error) {
  if (error instanceof PaycrestRequestError) {
    if (error.statusCode === 413) res.setHeader('connection', 'close')
    return send(res, error.statusCode, { error: error.message })
  }

  if (error instanceof PaycrestApiError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502
    return send(res, status, { error: error.message, data: error.data })
  }

  return send(res, 500, { error: 'Internal server error' })
}

/**
 * Creates a framework-agnostic `(req, res, next?)` handler that exposes the
 * backend routes `PaycrestProtocol` needs. It works with `node:http` and with
 * Express-style routers (mount it under a path such as `/paycrest`).
 *
 * Routes, relative to the mount path:
 * - `POST /orders`: creates an order from a `PaycrestCheckoutRequest` and returns `{ url, orderId, order }`.
 * - `GET /orders/{id}`: returns the Paycrest order.
 * - `GET /checkout/{id}`: serves a funding instructions page (unless `checkoutPage` is false).
 * - `POST /webhooks`: verifies and dispatches Paycrest webhooks (when `apiSecret` is set). Needs the raw body.
 *
 * @param {PaycrestHandlerOptions} options - The handler options.
 * @returns {(req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => Promise<void>} The request handler.
 */
export function createPaycrestHandler (options = {}) {
  const {
    apiKey,
    apiSecret,
    baseUrl,
    fetch: fetchImpl,
    client = new PaycrestSenderClient({ apiKey, baseUrl, fetch: fetchImpl }),
    publicBaseUrl,
    checkoutUrl,
    orderDefaults = {},
    authorize,
    onOrderCreated,
    onWebhook,
    checkoutPage = true,
    bodyLimit = DEFAULT_BODY_LIMIT
  } = options

  if (!checkoutUrl && !publicBaseUrl) {
    throw new Error('createPaycrestHandler requires either \'checkoutUrl\' or \'publicBaseUrl\'')
  }

  const buildCheckoutUrl = checkoutUrl ??
    ((order) => `${publicBaseUrl.replace(/\/+$/, '')}/checkout/${encodeURIComponent(order.id)}`)

  const isAuthorized = async (req, context) => !authorize || (await authorize(req, context)) === true

  const forbidden = (res) => send(res, 403, { error: 'Forbidden' })

  async function createOrder (req, res) {
    const request = await readJsonBody(req, bodyLimit)

    if (!(await isAuthorized(req, { action: 'createOrder', request }))) return forbidden(res)

    const defaults = typeof orderDefaults === 'function' ? await orderDefaults(request, req) : orderDefaults
    const payload = buildOrderPayload(request, defaults)
    const order = await client.createOrder(payload)

    if (onOrderCreated) await onOrderCreated(order, req, request)

    const url = await buildCheckoutUrl(order, req)

    send(res, 201, { url, orderId: order.id, order })
  }

  async function getOrder (req, res, orderId) {
    if (!(await isAuthorized(req, { action: 'getOrder', orderId }))) return forbidden(res)

    send(res, 200, await client.getOrder(orderId))
  }

  async function viewCheckout (req, res, orderId) {
    if (!(await isAuthorized(req, { action: 'viewCheckout', orderId }))) return forbidden(res)

    const order = await client.getOrder(orderId)

    res.setHeader('content-security-policy', 'default-src \'none\'; style-src \'unsafe-inline\'')
    res.setHeader('referrer-policy', 'no-referrer')
    send(res, 200, renderCheckoutPage(order), 'text/html; charset=utf-8')
  }

  async function receiveWebhook (req, res) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      throw new PaycrestRequestError('Webhook verification needs the raw request body. Mount this route before any JSON body parser')
    }

    const raw = await readRawBody(req, bodyLimit)
    let event

    try {
      event = parseWebhookEvent(raw, req.headers['x-paycrest-signature'], apiSecret)
    } catch {
      return send(res, 401, { error: 'Invalid signature' })
    }

    if (onWebhook) await onWebhook(event, req)

    send(res, 200, { received: true })
  }

  return async function paycrestHandler (req, res, next) {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost')
      const [resource, id, extra] = pathname.split('/').filter(Boolean).map(decodeURIComponent)

      if (extra === undefined) {
        if (req.method === 'POST' && resource === 'orders' && id === undefined) return await createOrder(req, res)
        if (req.method === 'GET' && resource === 'orders' && id) return await getOrder(req, res, id)
        if (req.method === 'GET' && resource === 'checkout' && id && checkoutPage) return await viewCheckout(req, res, id)
        if (req.method === 'POST' && resource === 'webhooks' && id === undefined && apiSecret) return await receiveWebhook(req, res)
      }

      if (typeof next === 'function') return next()

      send(res, 404, { error: 'Not found' })
    } catch (error) {
      sendError(res, error)
    }
  }
}
