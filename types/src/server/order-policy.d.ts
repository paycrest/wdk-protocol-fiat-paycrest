/**
 * Validates a checkout request received from a client and builds the order
 * payload to send to Paycrest. Only the fields `PaycrestProtocol` produces are
 * kept, and fee settings come exclusively from `defaults`.
 * @param {PaycrestCheckoutRequest} request - The request body sent by the `checkoutUrl` callback.
 * @param {PaycrestOrderDefaults} [defaults] - Server-controlled order fields.
 * @returns {PaycrestOrderPayload & PaycrestOrderDefaults} The payload for `POST /v2/sender/orders`.
 * @throws {PaycrestRequestError} If the request is malformed.
 */
export function buildOrderPayload(request: PaycrestCheckoutRequest, defaults?: PaycrestOrderDefaults): PaycrestOrderPayload & PaycrestOrderDefaults;
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
    constructor(message: string, statusCode?: number);
    /** @type {number} */
    statusCode: number;
}
export type PaycrestCheckoutRequest = import("../paycrest-protocol.js").PaycrestCheckoutRequest;
export type PaycrestOrderPayload = import("../paycrest-protocol.js").PaycrestOrderPayload;
/**
 * Server-controlled order fields. They are never taken from the client
 * request; set them here so that fee and routing policy stays on your backend.
 */
export type PaycrestOrderDefaults = {
    /**
     * - Fixed sender fee in crypto units. Mutually exclusive with `senderFeePercent`.
     */
    senderFee?: string;
    /**
     * - Sender fee percentage. Mutually exclusive with `senderFee`.
     */
    senderFeePercent?: string;
    /**
     * - Where your sender fee is paid.
     */
    senderFeeAddress?: string;
    /**
     * - Who pays the transaction fee.
     */
    transactionFeePayer?: "sender" | "customer";
};
