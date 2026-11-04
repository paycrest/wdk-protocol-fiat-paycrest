export default PaycrestProtocol;
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type BuyOptions = import("@tetherto/wdk-wallet/protocols").BuyOptions;
export type BuyResult = import("@tetherto/wdk-wallet/protocols").BuyResult;
export type SellOptions = import("@tetherto/wdk-wallet/protocols").SellOptions;
export type SellResult = import("@tetherto/wdk-wallet/protocols").SellResult;
export type FiatQuote = import("@tetherto/wdk-wallet/protocols").FiatQuote;
export type FiatTransactionDetail = import("@tetherto/wdk-wallet/protocols").FiatTransactionDetail;
export type SupportedCountry = import("@tetherto/wdk-wallet/protocols").SupportedCountry;
export type SupportedFiatCurrency = import("@tetherto/wdk-wallet/protocols").SupportedFiatCurrency;
export type SupportedCryptoAsset = import("@tetherto/wdk-wallet/protocols").SupportedCryptoAsset;
export type PaycrestOrderStatus = import("./status.js").PaycrestOrderStatus;
export type PaycrestOrderDirection = import("./status.js").PaycrestOrderDirection;
/**
 * A stablecoin as returned by Paycrest's `GET /v2/tokens`.
 */
export type PaycrestToken = {
    /**
     * - The token symbol (e.g. 'USDT').
     */
    symbol: string;
    /**
     * - The token contract address (or mint) on `network`.
     */
    contractAddress: string;
    /**
     * - The token's on-chain decimals on `network`.
     */
    decimals: number;
    /**
     * - The currency the token is pegged to (e.g. 'USD').
     */
    baseCurrency: string;
    /**
     * - The Paycrest network identifier (e.g. 'base', 'tron').
     */
    network: string;
};
/**
 * A fiat currency as returned by Paycrest's `GET /v2/currencies`.
 */
export type PaycrestCurrency = {
    /**
     * - The ISO 4217 currency code (e.g. 'NGN').
     */
    code: string;
    /**
     * - The currency's name.
     */
    name: string;
    /**
     * - A short display name.
     */
    shortName?: string;
    /**
     * - The number of decimal places Paycrest uses for the currency.
     */
    decimals: number;
    /**
     * - The display symbol (e.g. '₦').
     */
    symbol?: string;
    /**
     * - Indicative market rate for on-ramp (fiat per USD).
     */
    marketBuyRate?: string;
    /**
     * - Indicative market rate for off-ramp (fiat per USD).
     */
    marketSellRate?: string;
};
/**
 * One side of a Paycrest `GET /v2/rates` quote.
 */
export type PaycrestRateSide = {
    /**
     * - Fiat per 1 token.
     */
    rate: string;
    /**
     * - Ranked provider queue, best first (up to 3).
     */
    providerIds: string[];
    /**
     * - The order type (e.g. 'regular').
     */
    orderType?: string;
    /**
     * - Minutes until an unfunded order is refunded or expires.
     */
    refundTimeoutMinutes?: number;
};
/**
 * Quote metadata attached to {@link PaycrestQuote}.
 */
export type PaycrestQuoteMetadata = {
    /**
     * - The quoted side ('buy' is on-ramp, 'sell' is off-ramp).
     */
    side: "buy" | "sell";
    /**
     * - The network the quote was priced on.
     */
    network: string;
    /**
     * - Fiat per 1 token.
     */
    rate: string;
    /**
     * - Ranked provider queue. Pass to `config.providerIds` on `buy`/`sell` to route to the quoted providers.
     */
    providerIds: string[];
    /**
     * - The order type (e.g. 'regular').
     */
    orderType?: string;
    /**
     * - Minutes until an unfunded order is refunded or expires.
     */
    refundTimeoutMinutes?: number;
};
export type PaycrestQuote = FiatQuote & {
    metadata: PaycrestQuoteMetadata;
};
/**
 * Provider-specific extras accepted by `quoteBuy` and `quoteSell`.
 */
export type PaycrestQuoteParams = {
    /**
     * - The Paycrest network to price on (e.g. 'base', 'tron'). Required when the token exists on several networks and no default `network` is configured.
     */
    network?: string;
    /**
     * - Limit the quote to one provider (8 alphabetic characters).
     */
    providerId?: string;
};
/**
 * A bank or mobile money account, as accepted by the Paycrest Sender API.
 * Discover institution codes with `GET /v2/institutions/{currency}`.
 */
export type PaycrestFiatAccount = {
    /**
     * - The institution code (e.g. 'GTBINGLA', 'SAFAKEPC').
     */
    institution: string;
    /**
     * - The account number or mobile number.
     */
    accountIdentifier: string;
    /**
     * - The account holder's name.
     */
    accountName: string;
};
/**
 * The fiat payout recipient of an off-ramp order.
 */
export type PaycrestFiatRecipient = PaycrestFiatAccount & {
    memo?: string;
    metadata?: {
        channel?: "Mobile" | "Till" | "Paybill";
        businessNumber?: string;
    };
};
/**
 * Customer identity in the shape the Paycrest Sender API expects (`KYCDetail`).
 * Required as `config.kyc` on `buy` (on-ramp); optional elsewhere.
 */
export type PaycrestKyc = {
    /**
     * - The kind of customer.
     */
    entityType: "person" | "organization";
    /**
     * - Required when `entityType` is 'person'.
     */
    personDetails?: any;
    /**
     * - Required when `entityType` is 'organization'.
     */
    organizationDetails?: any;
    /**
     * - Optional principal address.
     */
    principalAddress?: any;
};
/**
 * Paycrest-specific parameters for `buy` (on-ramp: fiat in, stablecoin out).
 */
export type PaycrestBuyParams = {
    /**
     * - The network the stablecoin is delivered on.
     */
    network?: string;
    /**
     * - The customer paying in fiat. Required by Paycrest on every on-ramp order.
     */
    kyc: PaycrestKyc;
    /**
     * - The customer's own bank or mobile account, used for fiat refunds.
     */
    refundAccount: PaycrestFiatAccount;
    /**
     * - ISO 3166-1 alpha-2 country of the fiat source.
     */
    country?: string;
    /**
     * - Optional identity of the stablecoin recipient.
     */
    recipientKyc?: PaycrestKyc;
    /**
     * - Your internal order id, echoed back on the order and in webhooks.
     */
    reference?: string;
    /**
     * - A rate (fiat per token) to lock, typically from `quoteBuy`. Must stay within market tolerance.
     */
    rate?: string;
    /**
     * - Provider queue from `quoteBuy`. On-ramp pins a single provider, so only the first id is sent.
     */
    providerIds?: string[];
};
/**
 * Paycrest-specific parameters for `sell` (off-ramp: stablecoin in, fiat out).
 */
export type PaycrestSellParams = {
    /**
     * - The network the stablecoin is sent from.
     */
    network?: string;
    /**
     * - The bank or mobile money account that receives the fiat payout.
     */
    recipient: PaycrestFiatRecipient;
    /**
     * - ISO 3166-1 alpha-2 country of the fiat destination.
     */
    country?: string;
    /**
     * - Optional identity of the customer sending the stablecoin.
     */
    kyc?: PaycrestKyc;
    /**
     * - Optional identity of the fiat recipient.
     */
    recipientKyc?: PaycrestKyc;
    /**
     * - Your internal order id, echoed back on the order and in webhooks.
     */
    reference?: string;
    /**
     * - A rate (fiat per token) to lock, typically from `quoteSell`. Must stay within market tolerance.
     */
    rate?: string;
    /**
     * - Ranked provider queue from `quoteSell` (up to 3).
     */
    providerIds?: string[];
};
export type PaycrestBuyOptions = BuyOptions & {
    config: PaycrestBuyParams;
};
export type PaycrestQuoteBuyOptions = Omit<BuyOptions, "recipient"> & {
    config?: PaycrestQuoteParams;
};
export type PaycrestSellOptions = SellOptions & {
    config: PaycrestSellParams;
};
export type PaycrestQuoteSellOptions = Omit<SellOptions, "refundAddress"> & {
    config?: PaycrestQuoteParams;
};
/**
 * The `POST /v2/sender/orders` payload assembled by `buy`/`sell`. It never
 * carries credentials or sender fee settings: your backend adds those.
 */
export type PaycrestOrderPayload = {
    /**
     * - The order amount, in major units of the `amountIn` side.
     */
    amount: string;
    /**
     * - Whether `amount` is denominated in the token or the fiat currency.
     */
    amountIn: "crypto" | "fiat";
    /**
     * - Polymorphic source (`type: 'fiat'` for on-ramp, `type: 'crypto'` for off-ramp).
     */
    source: any;
    /**
     * - Polymorphic destination (`type: 'crypto'` for on-ramp, `type: 'fiat'` for off-ramp).
     */
    destination: any;
    /**
     * - Your internal order id.
     */
    reference?: string;
    /**
     * - A locked rate, when supplied.
     */
    rate?: string;
};
/**
 * What the module hands to your `checkoutUrl` callback.
 */
export type PaycrestCheckoutRequest = {
    /**
     * - 'onramp' for `buy`, 'offramp' for `sell`.
     */
    direction: PaycrestOrderDirection;
    /**
     * - The order payload to create with `POST /v2/sender/orders`.
     */
    order: PaycrestOrderPayload;
};
/**
 * What your `checkoutUrl` callback returns: the URL of a page that shows the
 * user how to fund the order (virtual account for on-ramp, receive address for
 * off-ramp), or an object carrying that URL and the created order.
 */
export type PaycrestCheckoutResult = string | {
    url: string;
    orderId?: string;
    order?: PaycrestOrder;
};
/**
 * A Paycrest v2 payment order, as returned by `GET /v2/sender/orders/{id}`.
 */
export type PaycrestOrder = {
    /**
     * - The order id.
     */
    id: string;
    /**
     * - The order status.
     */
    status: PaycrestOrderStatus;
    /**
     * - 'onramp' or 'offramp'.
     */
    direction?: PaycrestOrderDirection;
    /**
     * - The crypto amount, in token units.
     */
    amount?: string;
    /**
     * - The order's rate (fiat per token).
     */
    rate?: string;
    /**
     * - Your internal order id.
     */
    reference?: string;
    /**
     * - The settlement transaction hash, once available.
     */
    txHash?: string;
    /**
     * - Funding instructions: a receive address (off-ramp) or a virtual account (on-ramp).
     */
    providerAccount?: any;
    /**
     * - The order source.
     */
    source: {
        type: "crypto" | "fiat";
        currency: string;
    };
    /**
     * - The order destination.
     */
    destination: {
        type: "crypto" | "fiat";
        currency: string;
    };
};
export type PaycrestBuyResult = BuyResult & {
    orderId?: string;
    metadata?: PaycrestOrder;
};
export type PaycrestSellResult = SellResult & {
    orderId?: string;
    metadata?: PaycrestOrder;
};
export type PaycrestTransactionDetail = FiatTransactionDetail & {
    metadata: PaycrestOrder;
};
export type PaycrestSupportedCryptoAsset = SupportedCryptoAsset & {
    metadata: PaycrestToken;
};
export type PaycrestSupportedFiatCurrency = SupportedFiatCurrency & {
    metadata: PaycrestCurrency;
};
export type PaycrestSupportedCountry = SupportedCountry & {
    metadata: {
        currency: string;
    };
};
/**
 * Configuration for {@link PaycrestProtocol}. It holds no credentials: the
 * module only calls Paycrest's public endpoints, and order creation and lookup
 * are delegated to callbacks that reach your backend.
 */
export type PaycrestProtocolConfig = {
    /**
     * - Required by `buy`/`sell`. Send the request to your backend, which creates the order with your Sender API key and returns a checkout URL.
     */
    checkoutUrl?: (request: PaycrestCheckoutRequest) => Promise<PaycrestCheckoutResult>;
    /**
     * - Required by `getTransactionDetail`. Fetch the order through your backend, which calls `GET /v2/sender/orders/{id}` with your Sender API key.
     */
    getOrder?: (orderId: string) => Promise<PaycrestOrder>;
    /**
     * - Default Paycrest network (e.g. 'base') used when a call does not pass `config.network`.
     */
    network?: string;
    /**
     * - Paycrest API origin (default: 'https://api.paycrest.io').
     */
    baseUrl?: string;
    /**
     * - Milliseconds to cache supported tokens and currencies (default: 600,000, 10 minutes).
     */
    cacheTime?: number;
    /**
     * - Custom fetch implementation (default: the global `fetch`).
     */
    fetch?: typeof fetch;
};
export class PaycrestProtocol extends FiatProtocol {
    /**
     * Creates a new interface to the Paycrest protocol without binding it to a wallet account.
     *
     * @overload
     * @param {undefined} account - The wallet account to use to interact with the protocol.
     * @param {PaycrestProtocolConfig} [config] - The Paycrest protocol configuration.
     */
    constructor(account: undefined, config?: PaycrestProtocolConfig);
    /**
     * Creates a new read-only interface to the Paycrest protocol.
     *
     * @overload
     * @param {IWalletAccountReadOnly} account - The wallet account to use to interact with the protocol.
     * @param {PaycrestProtocolConfig} [config] - The Paycrest protocol configuration.
     */
    constructor(account: IWalletAccountReadOnly, config?: PaycrestProtocolConfig);
    /**
     * Creates a new interface to the Paycrest protocol.
     *
     * @overload
     * @param {IWalletAccount} account - The wallet account to use to interact with the protocol.
     * @param {PaycrestProtocolConfig} [config] - The Paycrest protocol configuration.
     */
    constructor(account: IWalletAccount, config?: PaycrestProtocolConfig);
    /** @private */
    private _checkoutUrl;
    /** @private */
    private _getOrder;
    /** @private */
    private _network;
    /** @private */
    private _baseUrl;
    /** @private */
    private _cacheThreshold;
    /** @private */
    private _fetch;
    /** @private */
    private _tokensCache;
    /** @private */
    private _currenciesCache;
    /**
     * Gets a quote for buying a stablecoin with fiat (on-ramp), using Paycrest's public rates.
     *
     * The public rate already reflects the provider's price, so `fee` is `0n`.
     * Order-level fees are only known once your backend creates the order.
     * @override
     * @param {PaycrestQuoteBuyOptions} options - The options for the quote.
     * @returns {Promise<PaycrestQuote>} A quote for the transaction.
     * @throws {ValueError} If both/neither of `cryptoAmount` and `fiatAmount` are provided, or the network is ambiguous.
     * @throws {NoSuchElementError} If `cryptoAsset`, `fiatCurrency` or the network cannot be resolved.
     * @throws {PaycrestApiError} If Paycrest fails to return a buy quote.
     */
    override quoteBuy(options: PaycrestQuoteBuyOptions): Promise<PaycrestQuote>;
    /**
     * Gets a quote for selling a stablecoin for fiat (off-ramp), using Paycrest's public rates.
     *
     * The public rate already reflects the provider's price, so `fee` is `0n`.
     * Order-level fees are only known once your backend creates the order.
     * @override
     * @param {PaycrestQuoteSellOptions} options - The options for the quote.
     * @returns {Promise<PaycrestQuote>} A quote for the transaction.
     * @throws {ValueError} If both/neither of `cryptoAmount` and `fiatAmount` are provided, or the network is ambiguous.
     * @throws {NoSuchElementError} If `cryptoAsset`, `fiatCurrency` or the network cannot be resolved.
     * @throws {PaycrestApiError} If Paycrest fails to return a sell quote.
     */
    override quoteSell(options: PaycrestQuoteSellOptions): Promise<PaycrestQuote>;
    /**
     * Prepares an on-ramp order (fiat in, stablecoin out) and returns the checkout URL from your backend.
     * @override
     * @param {PaycrestBuyOptions} options - The options for the purchase.
     * @returns {Promise<PaycrestBuyResult>} The URL where the user completes the purchase.
     * @throws {ValueError} If `checkoutUrl` is not configured, or the options are invalid.
     * @throws {NoSuchElementError} If `cryptoAsset`, `fiatCurrency` or the network cannot be resolved.
     * @throws {PaycrestApiError} If fetching supported tokens or currencies fails.
     */
    override buy(options: PaycrestBuyOptions): Promise<PaycrestBuyResult>;
    /**
     * Prepares an off-ramp order (stablecoin in, fiat out) and returns the checkout URL from your backend.
     * @override
     * @param {PaycrestSellOptions} options - The options for the sale.
     * @returns {Promise<PaycrestSellResult>} The URL where the user completes the sale.
     * @throws {ValueError} If `checkoutUrl` is not configured, or the options are invalid.
     * @throws {NoSuchElementError} If `cryptoAsset`, `fiatCurrency` or the network cannot be resolved.
     * @throws {PaycrestApiError} If fetching supported tokens or currencies fails.
     */
    override sell(options: PaycrestSellOptions): Promise<PaycrestSellResult>;
    /**
     * Retrieves a Paycrest order through the `getOrder` callback and normalises its status.
     *
     * Off-ramp orders are `completed` from `validated` (fiat delivered); on-ramp
     * orders are `completed` at `settled` (stablecoins delivered on-chain).
     * @override
     * @param {string} txId - The Paycrest order id.
     * @returns {Promise<PaycrestTransactionDetail>} The transaction details.
     * @throws {ValueError} If `getOrder` is not configured or `txId` is empty.
     * @throws {PaycrestApiError} If the order returned by `getOrder` is malformed.
     */
    override getTransactionDetail(txId: string): Promise<PaycrestTransactionDetail>;
    /**
     * Retrieves the stablecoins Paycrest supports, one entry per token and network.
     * @override
     * @returns {Promise<PaycrestSupportedCryptoAsset[]>} An array of supported crypto assets.
     * @throws {PaycrestApiError} If fetching supported tokens fails.
     */
    override getSupportedCryptoAssets(): Promise<PaycrestSupportedCryptoAsset[]>;
    /**
     * Retrieves the fiat currencies Paycrest supports.
     * @override
     * @returns {Promise<PaycrestSupportedFiatCurrency[]>} An array of supported fiat currencies.
     * @throws {PaycrestApiError} If fetching supported currencies fails.
     */
    override getSupportedFiatCurrencies(): Promise<PaycrestSupportedFiatCurrency[]>;
    /**
     * Retrieves the countries served by Paycrest's supported fiat currencies.
     *
     * Paycrest has no countries endpoint, so countries are derived from
     * `GET /v2/currencies`. Both directions are reported as allowed for every
     * listed corridor; live availability for a specific token, network and
     * amount is confirmed by `quoteBuy`/`quoteSell`.
     * @override
     * @returns {Promise<PaycrestSupportedCountry[]>} An array of supported countries.
     * @throws {PaycrestApiError} If fetching supported currencies fails.
     */
    override getSupportedCountries(): Promise<PaycrestSupportedCountry[]>;
    /** @private */
    private get _fetchImpl();
    /** @private */
    private _url;
    /** @private */
    private _assertCheckoutUrl;
    /** @private */
    private _buildOrder;
    /** @private */
    private _checkout;
    /** @private */
    private _quote;
    /**
     * Paycrest prices by token notional, so a fiat-denominated quote first
     * estimates the token amount. The indicative market rate from
     * `GET /v2/currencies` is used when present; otherwise a 1-token quote.
     * @private
     */
    private _estimateCryptoNotional;
    /** @private */
    private _fetchRate;
    /** @private */
    private _resolveAssets;
    /** @private */
    private _fetchTokens;
    /** @private */
    private _fetchCurrencies;
    /** @private */
    private _cached;
}
import { IFiatProtocol } from '@tetherto/wdk-wallet/protocols';
import { FiatProtocol } from '@tetherto/wdk-wallet/protocols';
export { IFiatProtocol };
