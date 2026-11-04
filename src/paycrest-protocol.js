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

import { FiatProtocol, IFiatProtocol } from '@tetherto/wdk-wallet/protocols'
import { ValueError, NoSuchElementError } from '@tetherto/wdk-wallet'
import BigNumber from 'bignumber.js'

import { PaycrestApiError } from './errors.js'
import { PAYCREST_API_ORIGIN, requestPaycrest } from './http.js'
import { toWdkStatus, getOrderDirection } from './status.js'
import { getCountriesForCurrency } from './countries.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyOptions} BuyOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').BuyResult} BuyResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellOptions} SellOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SellResult} SellResult */
/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatQuote} FiatQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').FiatTransactionDetail} FiatTransactionDetail */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedCountry} SupportedCountry */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedFiatCurrency} SupportedFiatCurrency */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SupportedCryptoAsset} SupportedCryptoAsset */

/** @typedef {import('./status.js').PaycrestOrderStatus} PaycrestOrderStatus */
/** @typedef {import('./status.js').PaycrestOrderDirection} PaycrestOrderDirection */

/**
 * A stablecoin as returned by Paycrest's `GET /v2/tokens`.
 * @see https://docs.paycrest.io/api-reference/general/list-supported-tokens
 * @typedef {Object} PaycrestToken
 * @property {string} symbol - The token symbol (e.g. 'USDT').
 * @property {string} contractAddress - The token contract address (or mint) on `network`.
 * @property {number} decimals - The token's on-chain decimals on `network`.
 * @property {string} baseCurrency - The currency the token is pegged to (e.g. 'USD').
 * @property {string} network - The Paycrest network identifier (e.g. 'base', 'tron').
 */

/**
 * A fiat currency as returned by Paycrest's `GET /v2/currencies`.
 * @see https://docs.paycrest.io/api-reference/general/list-supported-currencies
 * @typedef {Object} PaycrestCurrency
 * @property {string} code - The ISO 4217 currency code (e.g. 'NGN').
 * @property {string} name - The currency's name.
 * @property {string} [shortName] - A short display name.
 * @property {number} decimals - The number of decimal places Paycrest uses for the currency.
 * @property {string} [symbol] - The display symbol (e.g. '₦').
 * @property {string} [marketBuyRate] - Indicative market rate for on-ramp (fiat per USD).
 * @property {string} [marketSellRate] - Indicative market rate for off-ramp (fiat per USD).
 */

/**
 * One side of a Paycrest `GET /v2/rates` quote.
 * @see https://docs.paycrest.io/api-reference/general/get-token-rate
 * @typedef {Object} PaycrestRateSide
 * @property {string} rate - Fiat per 1 token.
 * @property {string[]} providerIds - Ranked provider queue, best first (up to 3).
 * @property {string} [orderType] - The order type (e.g. 'regular').
 * @property {number} [refundTimeoutMinutes] - Minutes until an unfunded order is refunded or expires.
 */

/**
 * Quote metadata attached to {@link PaycrestQuote}.
 * @typedef {Object} PaycrestQuoteMetadata
 * @property {'buy' | 'sell'} side - The quoted side ('buy' is on-ramp, 'sell' is off-ramp).
 * @property {string} network - The network the quote was priced on.
 * @property {string} rate - Fiat per 1 token.
 * @property {string[]} providerIds - Ranked provider queue. Pass to `config.providerIds` on `buy`/`sell` to route to the quoted providers.
 * @property {string} [orderType] - The order type (e.g. 'regular').
 * @property {number} [refundTimeoutMinutes] - Minutes until an unfunded order is refunded or expires.
 */

/** @typedef {FiatQuote & { metadata: PaycrestQuoteMetadata }} PaycrestQuote */

/**
 * Provider-specific extras accepted by `quoteBuy` and `quoteSell`.
 * @typedef {Object} PaycrestQuoteParams
 * @property {string} [network] - The Paycrest network to price on (e.g. 'base', 'tron'). Required when the token exists on several networks and no default `network` is configured.
 * @property {string} [providerId] - Limit the quote to one provider (8 alphabetic characters).
 */

/**
 * A bank or mobile money account, as accepted by the Paycrest Sender API.
 * Discover institution codes with `GET /v2/institutions/{currency}`.
 * @typedef {Object} PaycrestFiatAccount
 * @property {string} institution - The institution code (e.g. 'GTBINGLA', 'SAFAKEPC').
 * @property {string} accountIdentifier - The account number or mobile number.
 * @property {string} accountName - The account holder's name.
 */

/**
 * The fiat payout recipient of an off-ramp order.
 * @typedef {PaycrestFiatAccount & { memo?: string, metadata?: { channel?: 'Mobile' | 'Till' | 'Paybill', businessNumber?: string } }} PaycrestFiatRecipient
 */

/**
 * Customer identity in the shape the Paycrest Sender API expects (`KYCDetail`).
 * Required as `config.kyc` on `buy` (on-ramp); optional elsewhere.
 * @see https://docs.paycrest.io/implementation-guides/sender-api-integration#on-ramp-customer-kyc
 * @typedef {Object} PaycrestKyc
 * @property {'person' | 'organization'} entityType - The kind of customer.
 * @property {Object} [personDetails] - Required when `entityType` is 'person'.
 * @property {Object} [organizationDetails] - Required when `entityType` is 'organization'.
 * @property {Object} [principalAddress] - Optional principal address.
 */

/**
 * Paycrest-specific parameters for `buy` (on-ramp: fiat in, stablecoin out).
 * @typedef {Object} PaycrestBuyParams
 * @property {string} [network] - The network the stablecoin is delivered on.
 * @property {PaycrestKyc} kyc - The customer paying in fiat. Required by Paycrest on every on-ramp order.
 * @property {PaycrestFiatAccount} refundAccount - The customer's own bank or mobile account, used for fiat refunds.
 * @property {string} [country] - ISO 3166-1 alpha-2 country of the fiat source.
 * @property {PaycrestKyc} [recipientKyc] - Optional identity of the stablecoin recipient.
 * @property {string} [reference] - Your internal order id, echoed back on the order and in webhooks.
 * @property {string} [rate] - A rate (fiat per token) to lock, typically from `quoteBuy`. Must stay within market tolerance.
 * @property {string[]} [providerIds] - Provider queue from `quoteBuy`. On-ramp pins a single provider, so only the first id is sent.
 */

/**
 * Paycrest-specific parameters for `sell` (off-ramp: stablecoin in, fiat out).
 * @typedef {Object} PaycrestSellParams
 * @property {string} [network] - The network the stablecoin is sent from.
 * @property {PaycrestFiatRecipient} recipient - The bank or mobile money account that receives the fiat payout.
 * @property {string} [country] - ISO 3166-1 alpha-2 country of the fiat destination.
 * @property {PaycrestKyc} [kyc] - Optional identity of the customer sending the stablecoin.
 * @property {PaycrestKyc} [recipientKyc] - Optional identity of the fiat recipient.
 * @property {string} [reference] - Your internal order id, echoed back on the order and in webhooks.
 * @property {string} [rate] - A rate (fiat per token) to lock, typically from `quoteSell`. Must stay within market tolerance.
 * @property {string[]} [providerIds] - Ranked provider queue from `quoteSell` (up to 3).
 */

/** @typedef {BuyOptions & { config: PaycrestBuyParams }} PaycrestBuyOptions */
/** @typedef {Omit<BuyOptions, 'recipient'> & { config?: PaycrestQuoteParams }} PaycrestQuoteBuyOptions */
/** @typedef {SellOptions & { config: PaycrestSellParams }} PaycrestSellOptions */
/** @typedef {Omit<SellOptions, 'refundAddress'> & { config?: PaycrestQuoteParams }} PaycrestQuoteSellOptions */

/**
 * The `POST /v2/sender/orders` payload assembled by `buy`/`sell`. It never
 * carries credentials or sender fee settings: your backend adds those.
 * @see https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2
 * @typedef {Object} PaycrestOrderPayload
 * @property {string} amount - The order amount, in major units of the `amountIn` side.
 * @property {'crypto' | 'fiat'} amountIn - Whether `amount` is denominated in the token or the fiat currency.
 * @property {Object} source - Polymorphic source (`type: 'fiat'` for on-ramp, `type: 'crypto'` for off-ramp).
 * @property {Object} destination - Polymorphic destination (`type: 'crypto'` for on-ramp, `type: 'fiat'` for off-ramp).
 * @property {string} [reference] - Your internal order id.
 * @property {string} [rate] - A locked rate, when supplied.
 */

/**
 * What the module hands to your `checkoutUrl` callback.
 * @typedef {Object} PaycrestCheckoutRequest
 * @property {PaycrestOrderDirection} direction - 'onramp' for `buy`, 'offramp' for `sell`.
 * @property {PaycrestOrderPayload} order - The order payload to create with `POST /v2/sender/orders`.
 */

/**
 * What your `checkoutUrl` callback returns: the URL of a page that shows the
 * user how to fund the order (virtual account for on-ramp, receive address for
 * off-ramp), or an object carrying that URL and the created order.
 * @typedef {string | { url: string, orderId?: string, order?: PaycrestOrder }} PaycrestCheckoutResult
 */

/**
 * A Paycrest v2 payment order, as returned by `GET /v2/sender/orders/{id}`.
 * @see https://docs.paycrest.io/api-reference/sender/get-payment-order-by-id-v2
 * @typedef {Object} PaycrestOrder
 * @property {string} id - The order id.
 * @property {PaycrestOrderStatus} status - The order status.
 * @property {PaycrestOrderDirection} [direction] - 'onramp' or 'offramp'.
 * @property {string} [amount] - The crypto amount, in token units.
 * @property {string} [rate] - The order's rate (fiat per token).
 * @property {string} [reference] - Your internal order id.
 * @property {string} [txHash] - The settlement transaction hash, once available.
 * @property {Object} [providerAccount] - Funding instructions: a receive address (off-ramp) or a virtual account (on-ramp).
 * @property {{ type: 'crypto' | 'fiat', currency: string }} source - The order source.
 * @property {{ type: 'crypto' | 'fiat', currency: string }} destination - The order destination.
 */

/** @typedef {BuyResult & { orderId?: string, metadata?: PaycrestOrder }} PaycrestBuyResult */
/** @typedef {SellResult & { orderId?: string, metadata?: PaycrestOrder }} PaycrestSellResult */

/** @typedef {FiatTransactionDetail & { metadata: PaycrestOrder }} PaycrestTransactionDetail */
/** @typedef {SupportedCryptoAsset & { metadata: PaycrestToken }} PaycrestSupportedCryptoAsset */
/** @typedef {SupportedFiatCurrency & { metadata: PaycrestCurrency }} PaycrestSupportedFiatCurrency */
/** @typedef {SupportedCountry & { metadata: { currency: string } }} PaycrestSupportedCountry */

/**
 * Configuration for {@link PaycrestProtocol}. It holds no credentials: the
 * module only calls Paycrest's public endpoints, and order creation and lookup
 * are delegated to callbacks that reach your backend.
 * @typedef {Object} PaycrestProtocolConfig
 * @property {(request: PaycrestCheckoutRequest) => Promise<PaycrestCheckoutResult>} [checkoutUrl] - Required by `buy`/`sell`. Send the request to your backend, which creates the order with your Sender API key and returns a checkout URL.
 * @property {(orderId: string) => Promise<PaycrestOrder>} [getOrder] - Required by `getTransactionDetail`. Fetch the order through your backend, which calls `GET /v2/sender/orders/{id}` with your Sender API key.
 * @property {string} [network] - Default Paycrest network (e.g. 'base') used when a call does not pass `config.network`.
 * @property {string} [baseUrl] - Paycrest API origin (default: 'https://api.paycrest.io').
 * @property {number} [cacheTime] - Milliseconds to cache supported tokens and currencies (default: 600,000, 10 minutes).
 * @property {typeof fetch} [fetch] - Custom fetch implementation (default: the global `fetch`).
 */

const PAYCREST_CACHE_TIME = 10 * 60 * 1000

/**
 * Converts a base-unit amount to the decimal string Paycrest expects.
 * @param {bigint | number} amount - The amount, in base units.
 * @param {number} decimals - The base unit's decimal exponent.
 * @returns {string} The amount in major units.
 */
const _toMajorUnits = (amount, decimals) => new BigNumber(String(amount)).shiftedBy(-decimals).toFixed()

/**
 * Converts a major-unit amount to base units, rounding as requested.
 * @param {BigNumber} amount - The amount, in major units.
 * @param {number} decimals - The base unit's decimal exponent.
 * @param {BigNumber.RoundingMode} roundingMode - How to round to a whole base unit.
 * @returns {bigint} The amount in base units.
 */
const _toBaseUnits = (amount, decimals, roundingMode) => BigInt(amount.shiftedBy(decimals).integerValue(roundingMode).toFixed(0))

const _isPositiveInteger = (value) => {
  if (typeof value === 'bigint') return value > 0n
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * Validates the amount options shared by quotes, buys and sells.
 * @param {{ cryptoAmount?: number | bigint, fiatAmount?: number | bigint }} options - The amount options.
 * @returns {{ cryptoAmount: number | bigint } | { fiatAmount: number | bigint }} The single provided amount.
 */
function _validateAmount (options) {
  const hasCrypto = options.cryptoAmount !== undefined
  const hasFiat = options.fiatAmount !== undefined

  if (hasCrypto && hasFiat) {
    throw new ValueError('\'cryptoAmount\' and \'fiatAmount\' both cannot be provided')
  }

  if (!hasCrypto && !hasFiat) {
    throw new ValueError('Either \'cryptoAmount\' or \'fiatAmount\' must be provided')
  }

  const [name, value] = hasCrypto ? ['cryptoAmount', options.cryptoAmount] : ['fiatAmount', options.fiatAmount]

  if (!_isPositiveInteger(value)) {
    throw new ValueError(`'${name}' must be a positive integer in base units`)
  }

  return hasCrypto ? { cryptoAmount: value } : { fiatAmount: value }
}

function _assertFiatAccount (account, path) {
  const missing = ['institution', 'accountIdentifier', 'accountName']
    .filter((field) => typeof account?.[field] !== 'string' || account[field].length === 0)

  if (missing.length > 0) {
    throw new ValueError(`'${path}' must include ${missing.map((field) => `'${field}'`).join(', ')}`)
  }
}

function _withOptional (target, entries) {
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) target[key] = value
  }

  return target
}

class PaycrestProtocol extends FiatProtocol {
  /**
   * Creates a new interface to the Paycrest protocol without binding it to a wallet account.
   *
   * @overload
   * @param {undefined} account - The wallet account to use to interact with the protocol.
   * @param {PaycrestProtocolConfig} [config] - The Paycrest protocol configuration.
   */

  /**
   * Creates a new read-only interface to the Paycrest protocol.
   *
   * @overload
   * @param {IWalletAccountReadOnly} account - The wallet account to use to interact with the protocol.
   * @param {PaycrestProtocolConfig} [config] - The Paycrest protocol configuration.
   */

  /**
   * Creates a new interface to the Paycrest protocol.
   *
   * @overload
   * @param {IWalletAccount} account - The wallet account to use to interact with the protocol.
   * @param {PaycrestProtocolConfig} [config] - The Paycrest protocol configuration.
   */
  constructor (account, config = {}) {
    super(account)

    if ('apiKey' in config || 'apiSecret' in config) {
      throw new ValueError('PaycrestProtocol must not receive Paycrest credentials. Keep the API key and secret on your backend and use the \'checkoutUrl\' and \'getOrder\' callbacks')
    }

    const { checkoutUrl, getOrder, network, baseUrl = PAYCREST_API_ORIGIN, cacheTime = PAYCREST_CACHE_TIME, fetch: fetchImpl } = config

    /** @private */
    this._checkoutUrl = checkoutUrl

    /** @private */
    this._getOrder = getOrder

    /** @private */
    this._network = network

    /** @private */
    this._baseUrl = baseUrl

    /** @private */
    this._cacheThreshold = cacheTime

    /** @private */
    this._fetch = fetchImpl

    /** @private */
    this._tokensCache = undefined

    /** @private */
    this._currenciesCache = undefined
  }

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
  async quoteBuy (options) {
    return this._quote('buy', options)
  }

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
  async quoteSell (options) {
    return this._quote('sell', options)
  }

  /**
   * Prepares an on-ramp order (fiat in, stablecoin out) and returns the checkout URL from your backend.
   * @override
   * @param {PaycrestBuyOptions} options - The options for the purchase.
   * @returns {Promise<PaycrestBuyResult>} The URL where the user completes the purchase.
   * @throws {ValueError} If `checkoutUrl` is not configured, or the options are invalid.
   * @throws {NoSuchElementError} If `cryptoAsset`, `fiatCurrency` or the network cannot be resolved.
   * @throws {PaycrestApiError} If fetching supported tokens or currencies fails.
   */
  async buy (options) {
    const { cryptoAsset, fiatCurrency, recipient, config = {} } = options

    this._assertCheckoutUrl()

    const amount = _validateAmount(options)

    if (!config.kyc || typeof config.kyc !== 'object') {
      throw new ValueError('\'config.kyc\' is required: Paycrest identifies the customer paying in on every on-ramp order')
    }

    _assertFiatAccount(config.refundAccount, 'config.refundAccount')

    const { token, currency } = await this._resolveAssets(cryptoAsset, fiatCurrency, config.network)

    const address = recipient ?? await this._account?.getAddress()

    if (!address) {
      throw new ValueError('A \'recipient\' address is required when the protocol is not bound to an account')
    }

    const source = _withOptional({
      type: 'fiat',
      currency: currency.code,
      refundAccount: config.refundAccount,
      kyc: config.kyc
    }, { country: config.country })

    const destination = _withOptional({
      type: 'crypto',
      currency: token.symbol,
      recipient: { address, network: token.network }
    }, {
      providerIds: config.providerIds?.length ? config.providerIds.slice(0, 1) : undefined,
      kyc: config.recipientKyc
    })

    const order = this._buildOrder(amount, token, currency, source, destination, config)

    return this._checkout('onramp', order, 'buyUrl')
  }

  /**
   * Prepares an off-ramp order (stablecoin in, fiat out) and returns the checkout URL from your backend.
   * @override
   * @param {PaycrestSellOptions} options - The options for the sale.
   * @returns {Promise<PaycrestSellResult>} The URL where the user completes the sale.
   * @throws {ValueError} If `checkoutUrl` is not configured, or the options are invalid.
   * @throws {NoSuchElementError} If `cryptoAsset`, `fiatCurrency` or the network cannot be resolved.
   * @throws {PaycrestApiError} If fetching supported tokens or currencies fails.
   */
  async sell (options) {
    const { cryptoAsset, fiatCurrency, refundAddress, config = {} } = options

    this._assertCheckoutUrl()

    const amount = _validateAmount(options)

    _assertFiatAccount(config.recipient, 'config.recipient')

    const { token, currency } = await this._resolveAssets(cryptoAsset, fiatCurrency, config.network)

    const refundTo = refundAddress ?? await this._account?.getAddress()

    if (!refundTo) {
      throw new ValueError('A \'refundAddress\' is required when the protocol is not bound to an account')
    }

    const { institution, accountIdentifier, accountName, memo, metadata } = config.recipient

    const source = _withOptional({
      type: 'crypto',
      currency: token.symbol,
      network: token.network,
      refundAddress: refundTo
    }, { kyc: config.kyc })

    const destination = _withOptional({
      type: 'fiat',
      currency: currency.code,
      recipient: _withOptional({
        institution,
        accountIdentifier,
        accountName,
        memo: memo ?? config.reference ?? 'Payment'
      }, { metadata })
    }, {
      country: config.country,
      providerIds: config.providerIds?.length ? config.providerIds.slice(0, 3) : undefined,
      kyc: config.recipientKyc
    })

    const order = this._buildOrder(amount, token, currency, source, destination, config)

    return this._checkout('offramp', order, 'sellUrl')
  }

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
  async getTransactionDetail (txId) {
    if (!this._getOrder) {
      throw new ValueError('A \'getOrder\' callback is required to fetch a Paycrest order')
    }

    if (typeof txId !== 'string' || txId.length === 0) {
      throw new ValueError('\'txId\' must be a non-empty string')
    }

    const response = await this._getOrder(txId)
    const order = response?.status === 'success' && response.data ? response.data : response

    if (!order || typeof order !== 'object' || typeof order.status !== 'string' ||
      typeof order.source?.currency !== 'string' || typeof order.destination?.currency !== 'string') {
      throw new PaycrestApiError('Paycrest order response is missing required order fields')
    }

    const direction = getOrderDirection(order)

    return {
      status: toWdkStatus(order.status, direction),
      cryptoAsset: direction === 'onramp' ? order.destination.currency : order.source.currency,
      fiatCurrency: direction === 'onramp' ? order.source.currency : order.destination.currency,
      metadata: order
    }
  }

  /**
   * Retrieves the stablecoins Paycrest supports, one entry per token and network.
   * @override
   * @returns {Promise<PaycrestSupportedCryptoAsset[]>} An array of supported crypto assets.
   * @throws {PaycrestApiError} If fetching supported tokens fails.
   */
  async getSupportedCryptoAssets () {
    const tokens = await this._fetchTokens()

    return tokens.map((token) => ({
      code: token.symbol,
      networkCode: token.network,
      decimals: token.decimals,
      name: token.symbol,
      metadata: token
    }))
  }

  /**
   * Retrieves the fiat currencies Paycrest supports.
   * @override
   * @returns {Promise<PaycrestSupportedFiatCurrency[]>} An array of supported fiat currencies.
   * @throws {PaycrestApiError} If fetching supported currencies fails.
   */
  async getSupportedFiatCurrencies () {
    const currencies = await this._fetchCurrencies()

    return currencies.map((currency) => ({
      code: currency.code,
      decimals: currency.decimals,
      name: currency.name,
      metadata: currency
    }))
  }

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
  async getSupportedCountries () {
    const currencies = await this._fetchCurrencies()

    return currencies.flatMap((currency) =>
      getCountriesForCurrency(currency.code).map(({ code, name }) => ({
        code,
        isBuyAllowed: true,
        isSellAllowed: true,
        name,
        metadata: { currency: currency.code }
      })))
  }

  /** @private */
  get _fetchImpl () {
    return this._fetch ?? globalThis.fetch
  }

  /** @private */
  _url (path) {
    return new URL(path, this._baseUrl).toString()
  }

  /** @private */
  _assertCheckoutUrl () {
    if (!this._checkoutUrl) {
      throw new ValueError('A \'checkoutUrl\' callback is required to create a Paycrest order')
    }
  }

  /** @private */
  _buildOrder (amount, token, currency, source, destination, config) {
    const order = 'cryptoAmount' in amount
      ? { amount: _toMajorUnits(amount.cryptoAmount, token.decimals), amountIn: 'crypto' }
      : { amount: _toMajorUnits(amount.fiatAmount, currency.decimals), amountIn: 'fiat' }

    return _withOptional({ ...order, source, destination }, {
      reference: config.reference,
      rate: config.rate
    })
  }

  /** @private */
  async _checkout (direction, order, urlKey) {
    const result = await this._checkoutUrl({ direction, order })

    if (typeof result === 'string' && result.length > 0) {
      return { [urlKey]: result }
    }

    if (result && typeof result.url === 'string' && result.url.length > 0) {
      return _withOptional({ [urlKey]: result.url }, {
        orderId: result.orderId ?? result.order?.id,
        metadata: result.order
      })
    }

    throw new ValueError('The \'checkoutUrl\' callback must return a URL string or an object with a \'url\' string')
  }

  /** @private */
  async _quote (side, options) {
    const { cryptoAsset, fiatCurrency, config = {} } = options

    const amount = _validateAmount(options)

    const { token, currency } = await this._resolveAssets(cryptoAsset, fiatCurrency, config.network)

    const notional = 'cryptoAmount' in amount
      ? _toMajorUnits(amount.cryptoAmount, token.decimals)
      : await this._estimateCryptoNotional(side, token, currency, amount.fiatAmount, config.providerId)

    const quote = await this._fetchRate(side, token, currency, notional, config.providerId)
    const rate = new BigNumber(quote.rate)

    if (!rate.isFinite() || rate.lte(0)) {
      throw new PaycrestApiError(`Paycrest returned an invalid ${side} rate for ${token.symbol}/${currency.code}`)
    }

    // Round in the user's disfavour so the quote never overstates what they get.
    let cryptoAmount, fiatAmount

    if ('cryptoAmount' in amount) {
      cryptoAmount = BigInt(amount.cryptoAmount)
      const fiat = new BigNumber(notional).times(rate)
      fiatAmount = _toBaseUnits(fiat, currency.decimals, side === 'buy' ? BigNumber.ROUND_UP : BigNumber.ROUND_DOWN)
    } else {
      fiatAmount = BigInt(amount.fiatAmount)
      const crypto = new BigNumber(_toMajorUnits(amount.fiatAmount, currency.decimals)).div(rate)
      cryptoAmount = _toBaseUnits(crypto, token.decimals, side === 'buy' ? BigNumber.ROUND_DOWN : BigNumber.ROUND_UP)
    }

    return {
      cryptoAmount,
      fiatAmount,
      fee: 0n,
      rate: quote.rate,
      metadata: {
        side,
        network: token.network,
        rate: quote.rate,
        providerIds: quote.providerIds ?? [],
        orderType: quote.orderType,
        refundTimeoutMinutes: quote.refundTimeoutMinutes
      }
    }
  }

  /**
   * Paycrest prices by token notional, so a fiat-denominated quote first
   * estimates the token amount. The indicative market rate from
   * `GET /v2/currencies` is used when present; otherwise a 1-token quote.
   * @private
   */
  async _estimateCryptoNotional (side, token, currency, fiatAmount, providerId) {
    const fiat = new BigNumber(_toMajorUnits(fiatAmount, currency.decimals))
    let estimate = new BigNumber(side === 'buy' ? currency.marketBuyRate : currency.marketSellRate)

    if (!estimate.isFinite() || estimate.lte(0)) {
      const unitQuote = await this._fetchRate(side, token, currency, '1', providerId)
      estimate = new BigNumber(unitQuote.rate)
    }

    if (!estimate.isFinite() || estimate.lte(0)) {
      throw new PaycrestApiError(`Paycrest returned an invalid ${side} rate for ${token.symbol}/${currency.code}`)
    }

    const notional = fiat.div(estimate).decimalPlaces(token.decimals, BigNumber.ROUND_DOWN)
    const smallest = new BigNumber(1).shiftedBy(-token.decimals)

    return BigNumber.max(notional, smallest).toFixed()
  }

  /** @private */
  async _fetchRate (side, token, currency, notional, providerId) {
    const path = ['v2', 'rates', token.network, token.symbol, notional, currency.code]
      .map(encodeURIComponent)
      .join('/')

    const url = new URL(`/${path}`, this._baseUrl)
    url.searchParams.set('side', side)

    if (providerId) {
      url.searchParams.set('provider_id', providerId)
    }

    const data = await requestPaycrest(this._fetchImpl, url.toString(), `fetch Paycrest ${side} quote`)
    const quote = data?.[side]

    if (!quote || typeof quote.rate !== 'string') {
      throw new PaycrestApiError(`No Paycrest ${side} quote is available for ${token.symbol} on ${token.network} to ${currency.code}`, { status: 404 })
    }

    return quote
  }

  /** @private */
  async _resolveAssets (cryptoAsset, fiatCurrency, network) {
    if (typeof cryptoAsset !== 'string' || typeof fiatCurrency !== 'string') {
      throw new ValueError('\'cryptoAsset\' and \'fiatCurrency\' must be strings')
    }

    const [tokens, currencies] = await Promise.all([this._fetchTokens(), this._fetchCurrencies()])

    const symbol = cryptoAsset.toUpperCase()
    const code = fiatCurrency.toUpperCase()
    const wantedNetwork = (network ?? this._network)?.toLowerCase()

    const currency = currencies.find((entry) => entry.code.toUpperCase() === code)
    const candidates = tokens.filter((entry) => entry.symbol.toUpperCase() === symbol)

    if (!currency || candidates.length === 0) {
      throw new NoSuchElementError('Cannot find info for cryptoAsset and fiatCurrency')
    }

    if (wantedNetwork) {
      const token = candidates.find((entry) => entry.network.toLowerCase() === wantedNetwork)

      if (!token) {
        throw new NoSuchElementError(`'${cryptoAsset}' is not supported on network '${wantedNetwork}'`)
      }

      return { token, currency }
    }

    if (candidates.length > 1) {
      const networks = candidates.map((entry) => entry.network).join(', ')
      throw new ValueError(`'${cryptoAsset}' is available on several networks (${networks}). Pass 'config.network' or set a default 'network'`)
    }

    return { token: candidates[0], currency }
  }

  /** @private */
  async _fetchTokens () {
    this._tokensCache = await this._cached(this._tokensCache, '/v2/tokens', 'fetch Paycrest supported tokens')
    return this._tokensCache.data
  }

  /** @private */
  async _fetchCurrencies () {
    this._currenciesCache = await this._cached(this._currenciesCache, '/v2/currencies', 'fetch Paycrest supported currencies')
    return this._currenciesCache.data
  }

  /** @private */
  async _cached (cache, path, description) {
    const now = Date.now()

    if (cache && now - cache.timestamp < this._cacheThreshold) {
      return cache
    }

    const data = await requestPaycrest(this._fetchImpl, this._url(path), description)

    if (!Array.isArray(data)) {
      throw new PaycrestApiError(`Failed to ${description}: unexpected response shape`)
    }

    return { timestamp: now, data }
  }
}

export default PaycrestProtocol

export { PaycrestProtocol, IFiatProtocol }
