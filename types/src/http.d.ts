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
export function requestPaycrest(fetchImpl: typeof fetch, url: string, description: string, init?: RequestInit): Promise<any>;
export const PAYCREST_API_ORIGIN: "https://api.paycrest.io";
