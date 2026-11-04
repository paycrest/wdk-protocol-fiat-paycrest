/** @typedef {import('../paycrest-protocol.js').PaycrestOrderPayload} PaycrestOrderPayload */
/** @typedef {import('../paycrest-protocol.js').PaycrestOrder} PaycrestOrder */
/**
 * @typedef {Object} PaycrestSenderClientConfig
 * @property {string} apiKey - Your Paycrest Sender API key. Server-side only.
 * @property {string} [baseUrl] - Paycrest API origin (default: 'https://api.paycrest.io').
 * @property {typeof fetch} [fetch] - Custom fetch implementation (default: the global `fetch`).
 */
/**
 * @typedef {Object} PaycrestVerifyAccountRequest
 * @property {string} institution - The institution code (e.g. 'GTBINGLA').
 * @property {string} accountIdentifier - The account or mobile number.
 * @property {{ channel?: 'Mobile' | 'Till' | 'Paybill', businessNumber?: string }} [metadata] - KES channel hints.
 */
/**
 * A minimal, authenticated client for the Paycrest Sender API. Use it only on
 * your backend: it sends your API key on every request.
 */
export class PaycrestSenderClient {
    /**
     * @param {PaycrestSenderClientConfig} config - The client configuration.
     */
    constructor({ apiKey, baseUrl, fetch: fetchImpl }?: PaycrestSenderClientConfig);
    /** @private */
    private _apiKey;
    /** @private */
    private _baseUrl;
    /** @private */
    private _fetch;
    /**
     * Creates a payment order with `POST /v2/sender/orders`.
     * @param {PaycrestOrderPayload & Record<string, unknown>} payload - The order payload.
     * @returns {Promise<PaycrestOrder>} The created order, including `providerAccount` funding instructions.
     */
    createOrder(payload: PaycrestOrderPayload & Record<string, unknown>): Promise<PaycrestOrder>;
    /**
     * Fetches a payment order with `GET /v2/sender/orders/{id}`.
     * @param {string} orderId - The Paycrest order id.
     * @returns {Promise<PaycrestOrder>} The order.
     */
    getOrder(orderId: string): Promise<PaycrestOrder>;
    /**
     * Resolves an account holder name with `POST /v2/verify-account`.
     * @param {PaycrestVerifyAccountRequest} request - The account to verify.
     * @returns {Promise<string>} The resolved account name, or 'OK' when the corridor returns no name.
     */
    verifyAccount(request: PaycrestVerifyAccountRequest): Promise<string>;
    /** @private */
    private _request;
}
export type PaycrestOrderPayload = import("../paycrest-protocol.js").PaycrestOrderPayload;
export type PaycrestOrder = import("../paycrest-protocol.js").PaycrestOrder;
export type PaycrestSenderClientConfig = {
    /**
     * - Your Paycrest Sender API key. Server-side only.
     */
    apiKey: string;
    /**
     * - Paycrest API origin (default: 'https://api.paycrest.io').
     */
    baseUrl?: string;
    /**
     * - Custom fetch implementation (default: the global `fetch`).
     */
    fetch?: typeof fetch;
};
export type PaycrestVerifyAccountRequest = {
    /**
     * - The institution code (e.g. 'GTBINGLA').
     */
    institution: string;
    /**
     * - The account or mobile number.
     */
    accountIdentifier: string;
    /**
     * - KES channel hints.
     */
    metadata?: {
        channel?: "Mobile" | "Till" | "Paybill";
        businessNumber?: string;
    };
};
