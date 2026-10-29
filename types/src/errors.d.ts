export class PaycrestApiError extends Error {
    /**
     * Create a new Paycrest API error. Thrown when a request to a Paycrest API
     * endpoint fails or returns an unexpected response.
     *
     * @param {string} message - The error's message.
     * @param {Object} [details] - Additional details about the failed request.
     * @param {number} [details.status] - The HTTP status code, when a response was received.
     * @param {*} [details.data] - The `data` field of the Paycrest error envelope, when present.
     * @param {number} [details.retryAfter] - Seconds to wait before retrying, from the `Retry-After` header.
     */
    constructor(message: string, { status, data, retryAfter }?: {
        status?: number;
        data?: any;
        retryAfter?: number;
    });
    /** @type {number | undefined} */
    status: number | undefined;
    /** @type {*} */
    data: any;
    /** @type {number | undefined} */
    retryAfter: number | undefined;
}
