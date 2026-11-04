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

import { PaycrestApiError } from './errors.js'

export const PAYCREST_API_ORIGIN = 'https://api.paycrest.io'

/**
 * Sends a request to the Paycrest API and unwraps the `{ status, message, data }` envelope.
 *
 * @internal
 * @param {typeof fetch} fetchImpl - The fetch implementation to use.
 * @param {string} url - The absolute request URL.
 * @param {string} description - A short description of the request, used in error messages.
 * @param {RequestInit} [init] - Additional fetch options.
 * @returns {Promise<*>} The envelope's `data` field.
 * @throws {PaycrestApiError} If the request fails or the response is not a successful envelope.
 */
export async function requestPaycrest (fetchImpl, url, description, init = {}) {
  let resp

  try {
    resp = await fetchImpl(url, {
      ...init,
      headers: { accept: 'application/json', ...init.headers }
    })
  } catch (error) {
    throw new PaycrestApiError(`Failed to ${description}: ${error.message}`)
  }

  let body

  try {
    body = await resp.json()
  } catch {
    body = undefined
  }

  if (!resp.ok || body?.status !== 'success') {
    const reason = body?.message || resp.statusText || 'unexpected response'
    const retryAfter = Number(resp.headers?.get?.('retry-after')) || undefined

    throw new PaycrestApiError(`Failed to ${description}: ${resp.status} ${reason}`, {
      status: resp.status,
      data: body?.data,
      retryAfter
    })
  }

  return body.data
}
