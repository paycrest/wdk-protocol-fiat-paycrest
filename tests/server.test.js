import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

import {
  PaycrestSenderClient,
  PaycrestApiError,
  PaycrestRequestError,
  buildOrderPayload,
  createPaycrestHandler,
  parseWebhookEvent,
  renderCheckoutPage,
  verifyWebhookSignature
} from '../server.js'

import PaycrestProtocol from '../index.js'

import { FIAT_RECIPIENT, KYC, ORDER_ID, REFUND_ACCOUNT, WALLET_ADDRESS, createFetchMock, jsonResponse, offrampOrder, onrampOrder, success } from './fixtures.js'

const API_KEY = 'test-api-key-placeholder'
const API_SECRET = 'test-api-secret-placeholder'

const sign = (body, secret = API_SECRET) => createHmac('sha256', secret).update(body).digest('hex')

const offrampRequest = () => ({
  direction: 'offramp',
  order: {
    amount: '100',
    amountIn: 'crypto',
    source: { type: 'crypto', currency: 'USDT', network: 'base', refundAddress: WALLET_ADDRESS },
    destination: { type: 'fiat', currency: 'NGN', recipient: FIAT_RECIPIENT }
  }
})

const onrampRequest = () => ({
  direction: 'onramp',
  order: {
    amount: '50000',
    amountIn: 'fiat',
    source: { type: 'fiat', currency: 'NGN', refundAccount: REFUND_ACCOUNT, kyc: KYC },
    destination: { type: 'crypto', currency: 'USDT', recipient: { address: WALLET_ADDRESS, network: 'base' } }
  }
})

describe('PaycrestSenderClient', () => {
  test('should require an API key', () => {
    expect(() => new PaycrestSenderClient({})).toThrow('PaycrestSenderClient requires a Paycrest Sender \'apiKey\'')
  })

  test('should create orders with the API-Key header', async () => {
    const order = offrampOrder()
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(success(order), { status: 201 }))
    const client = new PaycrestSenderClient({ apiKey: API_KEY, fetch: fetchMock })

    await expect(client.createOrder(offrampRequest().order)).resolves.toEqual(order)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.paycrest.io/v2/sender/orders')
    expect(init.method).toBe('POST')
    expect(init.headers['API-Key']).toBe(API_KEY)
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(offrampRequest().order)
  })

  test('should fetch orders by id and verify accounts', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(success(onrampOrder())))
      .mockResolvedValueOnce(jsonResponse(success('ADA LOVELACE')))
    const client = new PaycrestSenderClient({ apiKey: API_KEY, fetch: fetchMock })

    await client.getOrder(ORDER_ID)
    await expect(client.verifyAccount({ institution: 'GTBINGLA', accountIdentifier: '0000000000' })).resolves.toBe('ADA LOVELACE')

    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.paycrest.io/v2/sender/orders/${ORDER_ID}`)
    expect(fetchMock.mock.calls[0][1].headers['API-Key']).toBe(API_KEY)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.paycrest.io/v2/verify-account')
  })

  test('should surface Paycrest validation errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(
      { status: 'error', message: 'Failed to validate payload', data: { field: 'Destination', message: 'providerIds accepts at most 3 providers' } },
      { status: 400, statusText: 'Bad Request' }
    ))
    const client = new PaycrestSenderClient({ apiKey: API_KEY, fetch: fetchMock })

    const error = await client.createOrder({}).catch((e) => e)

    expect(error).toBeInstanceOf(PaycrestApiError)
    expect(error.status).toBe(400)
    expect(error.data).toEqual({ field: 'Destination', message: 'providerIds accepts at most 3 providers' })
  })

  test('should reject an empty order id', async () => {
    const client = new PaycrestSenderClient({ apiKey: API_KEY, fetch: jest.fn() })

    await expect(client.getOrder('')).rejects.toThrow('\'orderId\' must be a non-empty string')
  })
})

describe('buildOrderPayload', () => {
  test('should keep only the order fields the protocol produces', () => {
    const request = offrampRequest()
    request.order.reference = 'ref-1'
    request.order.rate = '1490.5'
    request.order.senderFeePercent = 'client-fee'
    request.order.senderFeeAddress = '0xattacker'
    request.order.unexpected = true

    expect(buildOrderPayload(request)).toEqual({ ...offrampRequest().order, reference: 'ref-1', rate: '1490.5' })
  })

  test('should take fee settings only from the server defaults', () => {
    const payload = buildOrderPayload(onrampRequest(), { senderFeePercent: 'server-fee', senderFeeAddress: '0xfee', transactionFeePayer: 'customer' })

    expect(payload.senderFeePercent).toBe('server-fee')
    expect(payload.senderFeeAddress).toBe('0xfee')
    expect(payload.transactionFeePayer).toBe('customer')
  })

  test('should default amountIn to crypto', () => {
    const request = offrampRequest()
    delete request.order.amountIn

    expect(buildOrderPayload(request).amountIn).toBe('crypto')
  })

  test.each([
    [null, 'Expected a JSON body of the form { direction, order }'],
    [{ direction: 'onramp' }, 'Expected a JSON body of the form { direction, order }'],
    [{ ...offrampRequest(), direction: 'sideways' }, '\'direction\' must be \'onramp\' or \'offramp\''],
    [{ ...offrampRequest(), direction: 'onramp' }, 'An onramp order needs a \'fiat\' source and a \'crypto\' destination'],
    [{ direction: 'offramp', order: { ...offrampRequest().order, amount: '-1' } }, '\'order.amount\' must be a positive decimal string'],
    [{ direction: 'offramp', order: { ...offrampRequest().order, amount: '0' } }, '\'order.amount\' must be a positive decimal string'],
    [{ direction: 'offramp', order: { ...offrampRequest().order, amountIn: 'usd' } }, '\'order.amountIn\' must be \'crypto\' or \'fiat\'']
  ])('should reject malformed requests %#', (request, message) => {
    expect(() => buildOrderPayload(request)).toThrow(new PaycrestRequestError(message))
  })
})

describe('webhooks', () => {
  const body = JSON.stringify({ event: 'payment_order.validated', webhookVersion: '2', data: offrampOrder('validated') })

  test('should accept a valid signature, ignoring case and whitespace', () => {
    expect(verifyWebhookSignature(body, sign(body), API_SECRET)).toBe(true)
    expect(verifyWebhookSignature(Buffer.from(body), ` ${sign(body).toUpperCase()} `, API_SECRET)).toBe(true)
  })

  test.each([
    ['a tampered body', body + ' ', sign(body), API_SECRET],
    ['the wrong secret', body, sign(body, 'other-secret'), API_SECRET],
    ['a missing signature', body, undefined, API_SECRET],
    ['a missing secret', body, sign(body), ''],
    ['a truncated signature', body, sign(body).slice(0, 10), API_SECRET],
    ['a multi-byte signature', body, 'é'.repeat(64), API_SECRET]
  ])('should reject %s', (_, rawBody, signature, secret) => {
    expect(verifyWebhookSignature(rawBody, signature, secret)).toBe(false)
  })

  test('should parse a verified event and normalise its status', () => {
    const event = parseWebhookEvent(body, sign(body), API_SECRET)

    expect(event.event).toBe('payment_order.validated')
    expect(event.wdkStatus).toBe('completed')
  })

  test('should throw on an invalid signature or payload', () => {
    expect(() => parseWebhookEvent(body, sign('other'), API_SECRET)).toThrow('Invalid Paycrest webhook signature')

    const notAnEvent = JSON.stringify({ hello: 'world' })
    expect(() => parseWebhookEvent(notAnEvent, sign(notAnEvent), API_SECRET)).toThrow('Invalid Paycrest webhook payload')
  })
})

describe('renderCheckoutPage', () => {
  test('should show off-ramp deposit instructions without recipient details', () => {
    const order = offrampOrder()
    order.providerAccount.memo = 'MEMO-1'
    const html = renderCheckoutPage(order)

    expect(html).toContain(order.providerAccount.receiveAddress)
    expect(html).toContain('100.1 USDT')
    expect(html).toContain('MEMO-1')
    expect(html).toContain('http-equiv="refresh"')
    expect(html).not.toContain(FIAT_RECIPIENT.accountIdentifier)
  })

  test('should show on-ramp virtual account instructions', () => {
    const html = renderCheckoutPage(onrampOrder())

    expect(html).toContain('1111111111')
    expect(html).toContain('50000 NGN')
    expect(html).not.toContain(REFUND_ACCOUNT.accountIdentifier)
  })

  test('should hide instructions and stop refreshing once the order is final', () => {
    const html = renderCheckoutPage(offrampOrder('settled'))

    expect(html).toContain('Completed')
    expect(html).not.toContain('receiveAddress')
    expect(html).not.toContain(offrampOrder().providerAccount.receiveAddress)
    expect(html).not.toContain('http-equiv="refresh"')
  })

  test('should escape HTML in order fields', () => {
    const order = onrampOrder()
    order.providerAccount.accountName = '<script>alert(1)</script>'

    const html = renderCheckoutPage(order)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('createPaycrestHandler', () => {
  let server
  let baseUrl
  let paycrestFetch
  let options

  const listen = async (handlerOptions) => {
    const handler = createPaycrestHandler(handlerOptions)
    server = createServer((req, res) => handler(req, res))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    return handler
  }

  beforeEach(() => {
    paycrestFetch = jest.fn(async (url, init) => {
      const { pathname } = new URL(url)
      if (pathname === '/v2/sender/orders' && init.method === 'POST') {
        const payload = JSON.parse(init.body)
        return jsonResponse(success(payload.source.type === 'fiat' ? onrampOrder() : offrampOrder()), { status: 201 })
      }
      if (pathname === `/v2/sender/orders/${ORDER_ID}`) return jsonResponse(success(offrampOrder('pending')))
      return jsonResponse({ status: 'error', message: 'Order not found', data: null }, { status: 404, statusText: 'Not Found' })
    })

    options = { apiKey: API_KEY, apiSecret: API_SECRET, fetch: paycrestFetch, publicBaseUrl: 'https://backend.example.com/paycrest/' }
  })

  afterEach(async () => {
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    server = undefined
  })

  test('should require a way to build checkout URLs', () => {
    expect(() => createPaycrestHandler({ apiKey: API_KEY })).toThrow('createPaycrestHandler requires either \'checkoutUrl\' or \'publicBaseUrl\'')
  })

  test('should create an order and return the checkout URL', async () => {
    const onOrderCreated = jest.fn()
    await listen({ ...options, onOrderCreated, orderDefaults: { senderFeePercent: 'server-fee' } })

    const request = offrampRequest()
    request.order.senderFee = 'client-fee'

    const resp = await fetch(`${baseUrl}/orders`, { method: 'POST', body: JSON.stringify(request) })
    const body = await resp.json()

    expect(resp.status).toBe(201)
    expect(body.url).toBe(`https://backend.example.com/paycrest/checkout/${ORDER_ID}`)
    expect(body.orderId).toBe(ORDER_ID)
    expect(body.order.providerAccount.receiveAddress).toBeDefined()

    const sent = JSON.parse(paycrestFetch.mock.calls[0][1].body)
    expect(sent.senderFee).toBeUndefined()
    expect(sent.senderFeePercent).toBe('server-fee')
    expect(paycrestFetch.mock.calls[0][1].headers['API-Key']).toBe(API_KEY)
    expect(onOrderCreated).toHaveBeenCalledWith(expect.objectContaining({ id: ORDER_ID }), expect.anything(), request)
  })

  test('should use a custom checkoutUrl and per-request order defaults', async () => {
    const orderDefaults = jest.fn().mockResolvedValue({ senderFeePercent: 'per-request-fee' })
    await listen({ ...options, checkoutUrl: (order) => `https://app.example.com/pay/${order.id}`, orderDefaults })

    const resp = await fetch(`${baseUrl}/orders`, { method: 'POST', body: JSON.stringify(onrampRequest()) })

    expect((await resp.json()).url).toBe(`https://app.example.com/pay/${ORDER_ID}`)
    expect(orderDefaults).toHaveBeenCalledWith(onrampRequest(), expect.anything())
  })

  test('should return an order by id', async () => {
    await listen(options)

    const resp = await fetch(`${baseUrl}/orders/${ORDER_ID}`)

    expect(resp.status).toBe(200)
    expect((await resp.json()).status).toBe('pending')
  })

  test('should serve the checkout page with a restrictive CSP', async () => {
    await listen(options)

    const resp = await fetch(`${baseUrl}/checkout/${ORDER_ID}`)

    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toContain('text/html')
    expect(resp.headers.get('content-security-policy')).toContain('default-src \'none\'')
  })

  test('should not serve the checkout page when disabled', async () => {
    await listen({ ...options, checkoutPage: false })

    expect((await fetch(`${baseUrl}/checkout/${ORDER_ID}`)).status).toBe(404)
  })

  test('should respond 403 when authorize returns false', async () => {
    const authorize = jest.fn().mockResolvedValue(false)
    await listen({ ...options, authorize })

    const create = await fetch(`${baseUrl}/orders`, { method: 'POST', body: JSON.stringify(offrampRequest()) })
    const read = await fetch(`${baseUrl}/orders/${ORDER_ID}`)

    expect(create.status).toBe(403)
    expect(read.status).toBe(403)
    expect(paycrestFetch).not.toHaveBeenCalled()
    expect(authorize.mock.calls.map(([, context]) => context.action)).toEqual(['createOrder', 'getOrder'])
  })

  test('should map request and Paycrest errors to HTTP statuses', async () => {
    await listen(options)

    const badJson = await fetch(`${baseUrl}/orders`, { method: 'POST', body: '{' })
    expect(badJson.status).toBe(400)
    expect((await badJson.json()).error).toBe('Request body must be valid JSON')

    const badRequest = await fetch(`${baseUrl}/orders`, { method: 'POST', body: JSON.stringify({ direction: 'up', order: {} }) })
    expect(badRequest.status).toBe(400)

    const missing = await fetch(`${baseUrl}/orders/unknown-id`)
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toContain('Order not found')

    const tooLarge = await fetch(`${baseUrl}/orders`, { method: 'POST', body: 'x'.repeat(200 * 1024) })
    expect(tooLarge.status).toBe(413)
  })

  test('should report upstream server errors as 502 and unexpected errors as 500', async () => {
    paycrestFetch.mockResolvedValue(jsonResponse(undefined, { status: 503, statusText: 'Service Unavailable' }))
    const onOrderCreated = jest.fn()
    await listen({ ...options, onOrderCreated })

    expect((await fetch(`${baseUrl}/orders/${ORDER_ID}`)).status).toBe(502)

    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    paycrestFetch.mockResolvedValue(jsonResponse(success(offrampOrder()), { status: 201 }))
    await listen({ ...options, onOrderCreated: () => { throw new Error('database down') } })

    const resp = await fetch(`${baseUrl}/orders`, { method: 'POST', body: JSON.stringify(offrampRequest()) })
    expect(resp.status).toBe(500)
    expect(await resp.json()).toEqual({ error: 'Internal server error' })
  })

  test('should verify and dispatch webhooks', async () => {
    const onWebhook = jest.fn()
    await listen({ ...options, onWebhook })

    const body = JSON.stringify({ event: 'payment_order.settled', webhookVersion: '2', data: onrampOrder('settled') })

    const ok = await fetch(`${baseUrl}/webhooks`, { method: 'POST', body, headers: { 'X-Paycrest-Signature': sign(body) } })
    const bad = await fetch(`${baseUrl}/webhooks`, { method: 'POST', body, headers: { 'X-Paycrest-Signature': sign('tampered') } })

    expect(ok.status).toBe(200)
    expect(bad.status).toBe(401)
    expect(onWebhook).toHaveBeenCalledTimes(1)
    expect(onWebhook.mock.calls[0][0]).toMatchObject({ event: 'payment_order.settled', wdkStatus: 'completed' })
  })

  test('should not expose the webhook route without an API secret', async () => {
    await listen({ ...options, apiSecret: undefined })

    expect((await fetch(`${baseUrl}/webhooks`, { method: 'POST', body: '{}' })).status).toBe(404)
  })

  test('should call next for unknown routes when mounted as middleware', async () => {
    const handler = createPaycrestHandler(options)
    const next = jest.fn()
    const res = { setHeader: jest.fn(), end: jest.fn() }

    await handler({ method: 'GET', url: '/elsewhere', headers: {} }, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.end).not.toHaveBeenCalled()
  })

  test('should accept a body pre-parsed by a JSON middleware', async () => {
    const handler = createPaycrestHandler(options)
    const res = { setHeader: jest.fn(), end: jest.fn() }

    await handler({ method: 'POST', url: '/orders', headers: {}, body: offrampRequest() }, res)

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.end.mock.calls[0][0]).orderId).toBe(ORDER_ID)
  })

  test('should refuse webhooks whose raw body was already parsed', async () => {
    const handler = createPaycrestHandler(options)
    const res = { setHeader: jest.fn(), end: jest.fn() }

    await handler({ method: 'POST', url: '/webhooks', headers: {}, body: { event: 'x' } }, res)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.end.mock.calls[0][0]).error).toContain('raw request body')
  })

  test('should stream raw webhook bodies from the request', async () => {
    const onWebhook = jest.fn()
    const handler = createPaycrestHandler({ ...options, onWebhook })
    const body = JSON.stringify({ event: 'payment_order.expired', data: offrampOrder('expired') })
    const req = Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', url: '/webhooks', headers: { 'x-paycrest-signature': sign(body) } })
    const res = { setHeader: jest.fn(), end: jest.fn() }

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(onWebhook.mock.calls[0][0].wdkStatus).toBe('failed')
  })
})

describe('end to end: client protocol against the server helper', () => {
  let server
  let baseUrl

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  test('should create an off-ramp order and track it without the client seeing the API key', async () => {
    const paycrestFetch = jest.fn(async (url, init = {}) => {
      const { pathname } = new URL(url)
      if (pathname === '/v2/sender/orders') return jsonResponse(success(offrampOrder()), { status: 201 })
      return jsonResponse(success(offrampOrder('validated')))
    })

    const handler = createPaycrestHandler({ apiKey: API_KEY, fetch: paycrestFetch, publicBaseUrl: 'https://backend.example.com/paycrest' })
    server = createServer((req, res) => handler(req, res))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const clientFetch = jest.fn((url, init) => fetch(url, init))
    const publicFetch = createFetchMock()

    const paycrest = new PaycrestProtocol(undefined, {
      network: 'base',
      fetch: publicFetch,
      checkoutUrl: async (request) => (await clientFetch(`${baseUrl}/orders`, { method: 'POST', body: JSON.stringify(request) })).json(),
      getOrder: async (orderId) => (await clientFetch(`${baseUrl}/orders/${orderId}`)).json()
    })

    const { sellUrl, orderId, metadata } = await paycrest.sell({
      cryptoAsset: 'USDT',
      fiatCurrency: 'NGN',
      cryptoAmount: 100_000_000n,
      refundAddress: WALLET_ADDRESS,
      config: { recipient: FIAT_RECIPIENT }
    })

    expect(sellUrl).toBe(`https://backend.example.com/paycrest/checkout/${ORDER_ID}`)
    expect(metadata.providerAccount.amountToTransfer).toBe('100.1')

    const detail = await paycrest.getTransactionDetail(orderId)
    expect(detail.status).toBe('completed')

    const clientTraffic = JSON.stringify([...clientFetch.mock.calls, ...publicFetch.mock.calls])
    expect(clientTraffic).not.toContain(API_KEY)
    expect(paycrestFetch.mock.calls.every(([, init]) => init.headers['API-Key'] === API_KEY)).toBe(true)
  })
})
