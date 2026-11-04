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

/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionStatus} FiatTransactionStatus */

/**
 * A Paycrest v2 order status.
 * @see https://docs.paycrest.io/concepts/transaction-lifecycle
 * @typedef {'initiated' | 'deposited' | 'pending' | 'fulfilling' | 'fulfilled' | 'validated' | 'settling' | 'settled' | 'cancelled' | 'refunding' | 'refunded' | 'expired'} PaycrestOrderStatus
 */

/** @typedef {'onramp' | 'offramp'} PaycrestOrderDirection */

const FAILED_STATUSES = new Set(['cancelled', 'refunding', 'refunded', 'expired'])

// `validated` means the provider confirmed the fiat payout, which is when an
// off-ramp user has their money. An on-ramp user has theirs only at `settled`.
const OFFRAMP_COMPLETED_STATUSES = new Set(['validated', 'settling', 'settled'])
const ONRAMP_COMPLETED_STATUSES = new Set(['settled'])

/**
 * Infers an order's direction from its `direction` field, or from its source type.
 * @param {{ direction?: string, source?: { type?: string } }} order - A Paycrest v2 order.
 * @returns {PaycrestOrderDirection} The order's direction.
 */
export function getOrderDirection (order) {
  if (order?.direction === 'onramp' || order?.direction === 'offramp') {
    return order.direction
  }

  return order?.source?.type === 'fiat' ? 'onramp' : 'offramp'
}

/**
 * Converts a Paycrest order status to a standardized WDK fiat transaction status.
 * @param {PaycrestOrderStatus | string} status - The status from the Paycrest API.
 * @param {PaycrestOrderDirection} direction - The order's direction.
 * @returns {FiatTransactionStatus} The standardized status.
 */
export function toWdkStatus (status, direction) {
  if (FAILED_STATUSES.has(status)) {
    return 'failed'
  }

  const completed = direction === 'onramp' ? ONRAMP_COMPLETED_STATUSES : OFFRAMP_COMPLETED_STATUSES

  return completed.has(status) ? 'completed' : 'in_progress'
}
