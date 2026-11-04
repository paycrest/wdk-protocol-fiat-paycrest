/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionStatus} FiatTransactionStatus */
/**
 * A verified Paycrest v2 webhook event.
 * @see https://docs.paycrest.io/implementation-guides/sender-api-integration#webhook-events
 * @typedef {Object} PaycrestWebhookEvent
 * @property {string} event - The event name (e.g. 'payment_order.settled'). Branch on this, not on `data.status`.
 * @property {string} [webhookVersion] - The payload version ('2' for v2 senders).
 * @property {Object} data - The order snapshot.
 * @property {FiatTransactionStatus} wdkStatus - The order's status normalised to the WDK fiat statuses.
 */
/**
 * Verifies the `X-Paycrest-Signature` header of a webhook delivery: a hex
 * HMAC-SHA256 of the raw request body, keyed with your API secret.
 * @param {Buffer | string} rawBody - The raw, unparsed request body.
 * @param {string | undefined} signature - The `X-Paycrest-Signature` header value.
 * @param {string} secret - Your Paycrest Sender API secret.
 * @returns {boolean} True if the signature is valid.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean;
/**
 * Verifies and parses a Paycrest webhook delivery.
 * @param {Buffer | string} rawBody - The raw, unparsed request body.
 * @param {string | undefined} signature - The `X-Paycrest-Signature` header value.
 * @param {string} secret - Your Paycrest Sender API secret.
 * @returns {PaycrestWebhookEvent} The verified event.
 * @throws {Error} If the signature is invalid or the body is not a webhook payload.
 */
export function parseWebhookEvent(rawBody: Buffer | string, signature: string | undefined, secret: string): PaycrestWebhookEvent;
export type FiatTransactionStatus = import("@tetherto/wdk-wallet/protocols").FiatTransactionStatus;
/**
 * A verified Paycrest v2 webhook event.
 */
export type PaycrestWebhookEvent = {
    /**
     * - The event name (e.g. 'payment_order.settled'). Branch on this, not on `data.status`.
     */
    event: string;
    /**
     * - The payload version ('2' for v2 senders).
     */
    webhookVersion?: string;
    /**
     * - The order snapshot.
     */
    data: any;
    /**
     * - The order's status normalised to the WDK fiat statuses.
     */
    wdkStatus: FiatTransactionStatus;
};
