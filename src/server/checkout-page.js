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

import { toWdkStatus, getOrderDirection } from '../status.js'

/** @typedef {import('../paycrest-protocol.js').PaycrestOrder} PaycrestOrder */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])

const row = (label, value) => value === undefined || value === null || value === ''
  ? ''
  : `<tr><th>${escapeHtml(label)}</th><td><code>${escapeHtml(value)}</code></td></tr>`

const STATUS_TEXT = {
  completed: 'Completed',
  failed: 'Not completed',
  in_progress: 'In progress'
}

/**
 * Renders a minimal, self-contained HTML page with an order's funding
 * instructions. It shows only the `providerAccount` details and the order
 * status, never the recipient's account or identity details.
 * @param {PaycrestOrder} order - A Paycrest v2 order.
 * @param {Object} [options] - Rendering options.
 * @param {string} [options.title] - The page title (default: 'Complete your payment').
 * @param {number} [options.refreshSeconds] - Auto-refresh interval while the order is in progress (default: 15, 0 disables).
 * @returns {string} The HTML document.
 */
export function renderCheckoutPage (order, { title = 'Complete your payment', refreshSeconds = 15 } = {}) {
  const direction = getOrderDirection(order)
  const status = toWdkStatus(order.status, direction)
  const account = order.providerAccount ?? {}
  const awaitingDeposit = order.status === 'initiated'

  let instructions

  if (direction === 'offramp') {
    instructions = `<p>Send <strong>exactly</strong> the amount below from your wallet to this address before the deadline. A different amount may not be credited.</p>
<table>
${row('Amount', `${account.amountToTransfer ?? ''} ${account.currency ?? order.source?.currency ?? ''}`.trim())}
${row('Network', account.network ?? order.source?.network)}
${row('Address', account.receiveAddress)}
${row('Memo (required)', account.memo)}
${row('Send before', account.validUntil)}
</table>`
  } else {
    instructions = `<p>Transfer <strong>exactly</strong> the amount below from your own account to this account before the deadline. Payments from another person's account are returned.</p>
<table>
${row('Amount', `${account.amountToTransfer ?? ''} ${account.currency ?? order.source?.currency ?? ''}`.trim())}
${row('Bank or provider', account.institution)}
${row('Account number', account.accountIdentifier)}
${row('Account name', account.accountName)}
${row('Pay before', account.validUntil)}
</table>`
  }

  const refresh = status === 'in_progress' && refreshSeconds > 0
    ? `<meta http-equiv="refresh" content="${Number(refreshSeconds)}">`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${refresh}
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;color:#111;line-height:1.5}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #e5e5e5;vertical-align:top}
th{font-weight:500;color:#555;width:40%}
code{word-break:break-all}
.status{display:inline-block;padding:.2rem .6rem;border-radius:999px;background:#f1f1f1}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Status: <span class="status">${escapeHtml(STATUS_TEXT[status])}</span> <small>(${escapeHtml(order.status)})</small></p>
${awaitingDeposit ? instructions : ''}
<p><small>Order ${escapeHtml(order.id)}</small></p>
</body>
</html>`
}
