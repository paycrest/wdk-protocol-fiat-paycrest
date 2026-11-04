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
export function renderCheckoutPage(order: PaycrestOrder, { title, refreshSeconds }?: {
    title?: string;
    refreshSeconds?: number;
}): string;
export type PaycrestOrder = import("../paycrest-protocol.js").PaycrestOrder;
