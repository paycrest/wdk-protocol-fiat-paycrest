/**
 * Infers an order's direction from its `direction` field, or from its source type.
 * @param {{ direction?: string, source?: { type?: string } }} order - A Paycrest v2 order.
 * @returns {PaycrestOrderDirection} The order's direction.
 */
export function getOrderDirection(order: {
    direction?: string;
    source?: {
        type?: string;
    };
}): PaycrestOrderDirection;
/**
 * Converts a Paycrest order status to a standardized WDK fiat transaction status.
 * @param {PaycrestOrderStatus | string} status - The status from the Paycrest API.
 * @param {PaycrestOrderDirection} direction - The order's direction.
 * @returns {FiatTransactionStatus} The standardized status.
 */
export function toWdkStatus(status: PaycrestOrderStatus | string, direction: PaycrestOrderDirection): FiatTransactionStatus;
export type FiatTransactionStatus = import("@tetherto/wdk-wallet/protocols").FiatTransactionStatus;
/**
 * A Paycrest v2 order status.
 */
export type PaycrestOrderStatus = "initiated" | "deposited" | "pending" | "fulfilling" | "fulfilled" | "validated" | "settling" | "settled" | "cancelled" | "refunding" | "refunded" | "expired";
export type PaycrestOrderDirection = "onramp" | "offramp";
