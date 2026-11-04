/**
 * Creates a framework-agnostic `(req, res, next?)` handler that exposes the
 * backend routes `PaycrestProtocol` needs. It works with `node:http` and with
 * Express-style routers (mount it under a path such as `/paycrest`).
 *
 * Routes, relative to the mount path:
 * - `POST /orders`: creates an order from a `PaycrestCheckoutRequest` and returns `{ url, orderId, order }`.
 * - `GET /orders/{id}`: returns the Paycrest order.
 * - `GET /checkout/{id}`: serves a funding instructions page (unless `checkoutPage` is false).
 * - `POST /webhooks`: verifies and dispatches Paycrest webhooks (when `apiSecret` is set). Needs the raw body.
 *
 * @param {PaycrestHandlerOptions} options - The handler options.
 * @returns {(req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => Promise<void>} The request handler.
 */
export function createPaycrestHandler(options?: PaycrestHandlerOptions): (req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => Promise<void>;
export type IncomingMessage = import("node:http").IncomingMessage;
export type ServerResponse = import("node:http").ServerResponse;
export type PaycrestOrder = import("../paycrest-protocol.js").PaycrestOrder;
export type PaycrestCheckoutRequest = import("../paycrest-protocol.js").PaycrestCheckoutRequest;
export type PaycrestOrderDefaults = import("./order-policy.js").PaycrestOrderDefaults;
export type PaycrestWebhookEvent = import("./webhook.js").PaycrestWebhookEvent;
export type PaycrestAuthorizeContext = {
    /**
     * - The action being requested.
     */
    action: "createOrder" | "getOrder" | "viewCheckout";
    /**
     * - The order id, for 'getOrder' and 'viewCheckout'.
     */
    orderId?: string;
    /**
     * - The checkout request, for 'createOrder'.
     */
    request?: PaycrestCheckoutRequest;
};
export type PaycrestHandlerOptions = {
    /**
     * - Your Paycrest Sender API key. Required unless `client` is given.
     */
    apiKey?: string;
    /**
     * - Your Paycrest Sender API secret. Enables `POST /webhooks`.
     */
    apiSecret?: string;
    /**
     * - A preconfigured Sender API client.
     */
    client?: PaycrestSenderClient;
    /**
     * - Paycrest API origin, when building the client from `apiKey`.
     */
    baseUrl?: string;
    /**
     * - Custom fetch implementation, when building the client from `apiKey`.
     */
    fetch?: typeof fetch;
    /**
     * - Public URL where this handler is mounted. Checkout URLs default to `${publicBaseUrl}/checkout/{orderId}`.
     */
    publicBaseUrl?: string;
    /**
     * - Builds the checkout URL for a created order, e.g. a page in your own app. Overrides `publicBaseUrl`.
     */
    checkoutUrl?: (order: PaycrestOrder, req: IncomingMessage) => string | Promise<string>;
    /**
     * - Server-controlled order fields, such as your sender fee settings.
     */
    orderDefaults?: PaycrestOrderDefaults | ((request: PaycrestCheckoutRequest, req: IncomingMessage) => PaycrestOrderDefaults | Promise<PaycrestOrderDefaults>);
    /**
     * - Authorizes each request, including checkout. Return exactly true to allow; anything else responds 403. When omitted, `POST /orders` and `GET /orders/{id}` respond 403 unless `allowUnauthenticated` is true. `GET /checkout/{id}` stays open.
     */
    authorize?: (req: IncomingMessage, context: PaycrestAuthorizeContext) => boolean | Promise<boolean>;
    /**
     * - Opt out of the fail-closed default and allow `POST /orders` and `GET /orders/{id}` with no `authorize` callback. Defaults to false.
     */
    allowUnauthenticated?: boolean;
    /**
     * - Called after an order is created, e.g. to store it against your user.
     */
    onOrderCreated?: (order: PaycrestOrder, req: IncomingMessage, request: PaycrestCheckoutRequest) => void | Promise<void>;
    /**
     * - Called for every verified webhook event.
     */
    onWebhook?: (event: PaycrestWebhookEvent, req: IncomingMessage) => void | Promise<void>;
    /**
     * - Serve the built-in instructions page at `GET /checkout/{orderId}` (default: true).
     */
    checkoutPage?: boolean;
    /**
     * - Maximum request body size in bytes (default: 102,400).
     */
    bodyLimit?: number;
};
import { PaycrestSenderClient } from './sender-client.js';
