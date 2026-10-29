// A minimal backend for PaycrestProtocol, using only node:http.
//
//   PAYCREST_API_KEY=... PAYCREST_API_SECRET=... PUBLIC_BASE_URL=https://your-backend.example.com/paycrest node examples/server.js
//
// It exposes, under /paycrest:
//   POST /orders          create an order, return { url, orderId, order }
//   GET  /orders/:id      fetch an order (backs the client's getOrder callback)
//   GET  /checkout/:id    funding instructions page (the buyUrl / sellUrl)
//   POST /webhooks        Paycrest webhooks, verified with your API secret
//
// Add real authentication in `authorize` before going to production.

import { createServer } from 'node:http'

import { createPaycrestHandler } from '@paycrest/wdk-protocol-fiat-paycrest/server'

const { PAYCREST_API_KEY, PAYCREST_API_SECRET, PUBLIC_BASE_URL, PORT = '3000' } = process.env

if (!PAYCREST_API_KEY || !PUBLIC_BASE_URL) {
  throw new Error('Set PAYCREST_API_KEY and PUBLIC_BASE_URL (see .env.example)')
}

const ordersByUser = new Map()

const paycrest = createPaycrestHandler({
  apiKey: PAYCREST_API_KEY,
  apiSecret: PAYCREST_API_SECRET,
  publicBaseUrl: PUBLIC_BASE_URL,

  // Replace with your own session or token check. The checkout page is opened
  // in a browser, so it is often authorized by the unguessable order id alone.
  authorize: async (req, { action, orderId }) => {
    const userId = req.headers['x-user-id']
    if (action === 'viewCheckout') return true
    if (!userId) return false
    if (action === 'getOrder') return ordersByUser.get(orderId) === userId
    return true
  },

  onOrderCreated: async (order, req) => {
    ordersByUser.set(order.id, req.headers['x-user-id'])
  },

  onWebhook: async ({ event, data, wdkStatus }) => {
    console.log(`Paycrest ${event} for order ${data.id}: ${wdkStatus}`)
  }
})

createServer((req, res) => {
  if (!req.url.startsWith('/paycrest/')) {
    res.statusCode = 404
    return res.end()
  }

  req.url = req.url.slice('/paycrest'.length)
  paycrest(req, res)
}).listen(Number(PORT), () => {
  console.log(`Paycrest backend listening on http://localhost:${PORT}/paycrest`)
})
