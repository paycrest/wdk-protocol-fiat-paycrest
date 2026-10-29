import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { ValueError, NoSuchElementError } from '@tetherto/wdk-wallet'
import { FiatProtocol } from '@tetherto/wdk-wallet/protocols'

import PaycrestProtocol, { PaycrestApiError } from '../index.js'

import {
  CURRENCIES, FIAT_RECIPIENT, KYC, ORDER_ID, RATES, REFUND_ACCOUNT, TOKENS, WALLET_ADDRESS,
  createFetchMock, jsonResponse, offrampOrder, onrampOrder, success
} from './fixtures.js'

const CHECKOUT_URL = 'https://backend.example.com/paycrest/checkout/' + ORDER_ID

const account = { getAddress: jest.fn().mockResolvedValue(WALLET_ADDRESS) }

function rateCalls (fetchMock) {
  return fetchMock.mock.calls.map(([url]) => new URL(url)).filter((url) => url.pathname.startsWith('/v2/rates/'))
}

describe('PaycrestProtocol', () => {
  let fetchMock
  let checkoutUrl
  let getOrder
  let paycrest

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = createFetchMock()
    checkoutUrl = jest.fn().mockResolvedValue(CHECKOUT_URL)
    getOrder = jest.fn()
    paycrest = new PaycrestProtocol(undefined, { checkoutUrl, getOrder, fetch: fetchMock, network: 'base' })
  })

  describe('constructor', () => {
    test('should extend the WDK FiatProtocol base class', () => {
      expect(paycrest).toBeInstanceOf(FiatProtocol)
    })

    test('should refuse Paycrest credentials so they never reach client code', () => {
      expect(() => new PaycrestProtocol(undefined, { apiKey: 'placeholder' })).toThrow(ValueError)
      expect(() => new PaycrestProtocol(undefined, { apiSecret: 'placeholder' })).toThrow(ValueError)
    })

    test('should work without any configuration for discovery and quotes', async () => {
      global.fetch = fetchMock
      const bare = new PaycrestProtocol()

      await expect(bare.getSupportedFiatCurrencies()).resolves.toHaveLength(CURRENCIES.length)

      delete global.fetch
    })
  })

  describe('quoteSell', () => {
    test('should quote an exact crypto amount using the sell side of the public rate', async () => {
      const quote = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 100_000_000n })

      const [url] = rateCalls(fetchMock)
      expect(url.pathname).toBe('/v2/rates/base/USDT/100/NGN')
      expect(url.searchParams.get('side')).toBe('sell')

      expect(quote).toEqual({
        cryptoAmount: 100_000_000n,
        fiatAmount: 14_905_000n, // 100 USDT * 1490.5 = 149,050.00 NGN in kobo
        fee: 0n,
        rate: '1490.5',
        metadata: {
          side: 'sell',
          network: 'base',
          rate: '1490.5',
          providerIds: RATES.sell.providerIds,
          orderType: 'regular',
          refundTimeoutMinutes: 60
        }
      })
    })

    test('should quote a fiat amount by estimating the notional from the market rate', async () => {
      const quote = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 10_000_000n })

      const [url] = rateCalls(fetchMock)
      // 100,000 NGN / 1490 market sell rate, truncated to 6 decimals
      expect(url.pathname).toBe('/v2/rates/base/USDT/67.114093/NGN')

      // The user must send enough crypto, so the amount rounds up: 100000 / 1490.5 = 67.0915800067...
      expect(quote.cryptoAmount).toBe(67_091_581n)
      expect(quote.fiatAmount).toBe(10_000_000n)
    })

    test('should fall back to a one-token quote when no market rate is published', async () => {
      await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'UGX', fiatAmount: 149_050_00n })

      const calls = rateCalls(fetchMock)
      expect(calls.map((url) => url.pathname)).toEqual([
        '/v2/rates/base/USDT/1/UGX',
        '/v2/rates/base/USDT/100/UGX'
      ])
    })

    test('should use the token decimals of the selected network', async () => {
      const quote = await paycrest.quoteSell({
        cryptoAsset: 'USDT',
        fiatCurrency: 'NGN',
        cryptoAmount: 2n * 10n ** 18n,
        config: { network: 'bnb-smart-chain' }
      })

      expect(rateCalls(fetchMock)[0].pathname).toBe('/v2/rates/bnb-smart-chain/USDT/2/NGN')
      expect(quote.fiatAmount).toBe(298_100n)
    })

    test('should pass a provider id through to the rate request', async () => {
      await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'KES', cryptoAmount: 1_000_000n, config: { providerId: 'AbCdEfGh' } })

      expect(rateCalls(fetchMock)[0].searchParams.get('provider_id')).toBe('AbCdEfGh')
    })

    test('should match asset and currency codes case-insensitively', async () => {
      const quote = await paycrest.quoteSell({ cryptoAsset: 'usdt', fiatCurrency: 'ngn', cryptoAmount: 1_000_000n })

      expect(rateCalls(fetchMock)[0].pathname).toBe('/v2/rates/base/USDT/1/NGN')
      expect(quote.fiatAmount).toBe(149_050n)
    })
  })

  describe('quoteBuy', () => {
    test('should quote a fiat amount using the buy side, rounding the crypto down', async () => {
      const quote = await paycrest.quoteBuy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 5_000_000n })

      const [url] = rateCalls(fetchMock)
      expect(url.searchParams.get('side')).toBe('buy')
      expect(url.pathname).toBe('/v2/rates/base/USDT/33.333333/NGN')

      // 50,000 / 1500.25 = 33.327778703...
      expect(quote.cryptoAmount).toBe(33_327_778n)
      expect(quote.fiatAmount).toBe(5_000_000n)
      expect(quote.fee).toBe(0n)
      expect(quote.rate).toBe('1500.25')
      expect(quote.metadata.side).toBe('buy')
    })

    test('should quote an exact crypto amount, rounding the fiat up', async () => {
      const quote = await paycrest.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'NGN', cryptoAmount: 1_234_567n })

      // 1.234567 * 1500.25 = 1852.159...
      expect(quote.fiatAmount).toBe(185_216n)
    })

    test('should throw when Paycrest has no quote for the requested side', async () => {
      fetchMock = createFetchMock({ rates: { sell: RATES.sell } })
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, network: 'base' })

      const error = await paycrest.quoteBuy({ cryptoAsset: 'USDC', fiatCurrency: 'TZS', cryptoAmount: 1_000_000n }).catch((e) => e)

      expect(error).toBeInstanceOf(PaycrestApiError)
      expect(error.message).toBe('No Paycrest buy quote is available for USDC on base to TZS')
    })
  })

  describe('quote validation and errors', () => {
    test.each([
      [{ cryptoAmount: 1n, fiatAmount: 1n }, '\'cryptoAmount\' and \'fiatAmount\' both cannot be provided'],
      [{}, 'Either \'cryptoAmount\' or \'fiatAmount\' must be provided'],
      [{ cryptoAmount: 0n }, '\'cryptoAmount\' must be a positive integer in base units'],
      [{ fiatAmount: -5 }, '\'fiatAmount\' must be a positive integer in base units'],
      [{ fiatAmount: 1.5 }, '\'fiatAmount\' must be a positive integer in base units']
    ])('should reject invalid amounts %p', async (amounts, message) => {
      const error = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', ...amounts }).catch((e) => e)

      expect(error).toBeInstanceOf(ValueError)
      expect(error.message).toBe(message)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('should require a network when the token exists on several networks', async () => {
      const noDefault = new PaycrestProtocol(undefined, { fetch: fetchMock })

      const error = await noDefault.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1n }).catch((e) => e)

      expect(error).toBeInstanceOf(ValueError)
      expect(error.message).toContain('several networks (base, tron, bnb-smart-chain)')
    })

    test('should resolve the only network of a single-network token without configuration', async () => {
      const noDefault = new PaycrestProtocol(undefined, { fetch: fetchMock })

      await noDefault.quoteSell({ cryptoAsset: 'USDC', fiatCurrency: 'NGN', cryptoAmount: 1_000_000n })

      expect(rateCalls(fetchMock)[0].pathname).toBe('/v2/rates/base/USDC/1/NGN')
    })

    test('should prefer the per-call network over the default network', async () => {
      await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'KES', cryptoAmount: 1_000_000n, config: { network: 'tron' } })

      expect(rateCalls(fetchMock)[0].pathname).toBe('/v2/rates/tron/USDT/1/KES')
    })

    test('should throw NoSuchElementError for unknown assets, currencies or networks', async () => {
      await expect(paycrest.quoteSell({ cryptoAsset: 'DOGE', fiatCurrency: 'NGN', cryptoAmount: 1n })).rejects.toThrow(NoSuchElementError)
      await expect(paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'EUR', cryptoAmount: 1n })).rejects.toThrow(NoSuchElementError)
      await expect(paycrest.quoteSell({ cryptoAsset: 'USDC', fiatCurrency: 'NGN', cryptoAmount: 1n, config: { network: 'tron' } }))
        .rejects.toThrow('\'USDC\' is not supported on network \'tron\'')
    })

    test('should surface the Paycrest error message, status and retry hint', async () => {
      fetchMock = createFetchMock({
        rates: () => jsonResponse(
          { status: 'error', message: 'no provider available for NGN to USDT conversion', data: null },
          { status: 404, statusText: 'Not Found' }
        )
      })
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, network: 'base' })

      const error = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1_000_000n }).catch((e) => e)

      expect(error).toBeInstanceOf(PaycrestApiError)
      expect(error.status).toBe(404)
      expect(error.message).toBe('Failed to fetch Paycrest sell quote: 404 no provider available for NGN to USDT conversion')
    })

    test('should expose Retry-After on rate limiting', async () => {
      fetchMock = createFetchMock({
        rates: () => jsonResponse(undefined, { status: 429, statusText: 'Too Many Requests', headers: { 'retry-after': '2' } })
      })
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, network: 'base' })

      const error = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1_000_000n }).catch((e) => e)

      expect(error).toBeInstanceOf(PaycrestApiError)
      expect(error.status).toBe(429)
      expect(error.retryAfter).toBe(2)
      expect(error.message).toBe('Failed to fetch Paycrest sell quote: 429 Too Many Requests')
    })

    test('should wrap network failures', async () => {
      const failing = jest.fn().mockRejectedValue(new Error('socket hang up'))
      paycrest = new PaycrestProtocol(undefined, { fetch: failing, network: 'base' })

      const error = await paycrest.getSupportedCryptoAssets().catch((e) => e)

      expect(error).toBeInstanceOf(PaycrestApiError)
      expect(error.message).toBe('Failed to fetch Paycrest supported tokens: socket hang up')
    })

    test('should reject a non-positive rate from the API', async () => {
      fetchMock = createFetchMock({ rates: { sell: { ...RATES.sell, rate: '0' } } })
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, network: 'base' })

      await expect(paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1_000_000n }))
        .rejects.toThrow('Paycrest returned an invalid sell rate for USDT/NGN')
    })
  })

  describe('buy', () => {
    const buyConfig = { kyc: KYC, refundAccount: REFUND_ACCOUNT }

    test('should hand an on-ramp order for a fiat amount to the checkoutUrl callback', async () => {
      const result = await paycrest.buy({
        cryptoAsset: 'USDT',
        fiatCurrency: 'NGN',
        fiatAmount: 5_000_000n,
        recipient: WALLET_ADDRESS,
        config: { ...buyConfig, reference: 'order-42' }
      })

      expect(checkoutUrl).toHaveBeenCalledWith({
        direction: 'onramp',
        order: {
          amount: '50000',
          amountIn: 'fiat',
          reference: 'order-42',
          source: { type: 'fiat', currency: 'NGN', refundAccount: REFUND_ACCOUNT, kyc: KYC },
          destination: { type: 'crypto', currency: 'USDT', recipient: { address: WALLET_ADDRESS, network: 'base' } }
        }
      })
      expect(result).toEqual({ buyUrl: CHECKOUT_URL })
    })

    test('should denominate a crypto amount in token units and fall back to the account address', async () => {
      paycrest = new PaycrestProtocol(account, { checkoutUrl, fetch: fetchMock })

      await paycrest.buy({
        cryptoAsset: 'USDT',
        fiatCurrency: 'KES',
        cryptoAmount: 25_500_000n,
        config: { ...buyConfig, network: 'tron', country: 'KE' }
      })

      const { order } = checkoutUrl.mock.calls[0][0]
      expect(order.amount).toBe('25.5')
      expect(order.amountIn).toBe('crypto')
      expect(order.source.country).toBe('KE')
      expect(order.destination.recipient).toEqual({ address: WALLET_ADDRESS, network: 'tron' })
      expect(account.getAddress).toHaveBeenCalled()
    })

    test('should lock a quoted rate and pin only the first provider', async () => {
      await paycrest.buy({
        cryptoAsset: 'USDT',
        fiatCurrency: 'NGN',
        fiatAmount: 5_000_000n,
        recipient: WALLET_ADDRESS,
        config: { ...buyConfig, rate: '1500.25', providerIds: RATES.buy.providerIds, recipientKyc: KYC }
      })

      const { order } = checkoutUrl.mock.calls[0][0]
      expect(order.rate).toBe('1500.25')
      expect(order.destination.providerIds).toEqual(['AbCdEfGh'])
      expect(order.destination.kyc).toEqual(KYC)
    })

    test('should return the order id and order when the callback returns them', async () => {
      const order = onrampOrder()
      checkoutUrl.mockResolvedValue({ url: CHECKOUT_URL, order })

      const result = await paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS, config: buyConfig })

      expect(result).toEqual({ buyUrl: CHECKOUT_URL, orderId: ORDER_ID, metadata: order })
    })

    test('should never send credentials or fee settings to the callback', async () => {
      await paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS, config: { ...buyConfig, senderFee: '9' } })

      const serialized = JSON.stringify(checkoutUrl.mock.calls[0][0])
      expect(serialized).not.toMatch(/apiKey|API-Key|senderFee/)
    })

    test('should throw when checkoutUrl is not configured', async () => {
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, network: 'base' })

      const error = await paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, config: buyConfig }).catch((e) => e)

      expect(error).toBeInstanceOf(ValueError)
      expect(error.message).toBe('A \'checkoutUrl\' callback is required to create a Paycrest order')
    })

    test('should require customer KYC and a refund account', async () => {
      await expect(paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS, config: { refundAccount: REFUND_ACCOUNT } }))
        .rejects.toThrow('\'config.kyc\' is required')

      await expect(paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS, config: { kyc: KYC, refundAccount: { institution: 'GTBINGLA' } } }))
        .rejects.toThrow('\'config.refundAccount\' must include \'accountIdentifier\', \'accountName\'')

      await expect(paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS }))
        .rejects.toThrow(ValueError)

      expect(checkoutUrl).not.toHaveBeenCalled()
    })

    test('should require a recipient when no account is bound', async () => {
      const error = await paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, config: buyConfig }).catch((e) => e)

      expect(error).toBeInstanceOf(ValueError)
      expect(error.message).toBe('A \'recipient\' address is required when the protocol is not bound to an account')
    })

    test('should reject an invalid callback result', async () => {
      checkoutUrl.mockResolvedValue({ orderId: ORDER_ID })

      await expect(paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS, config: buyConfig }))
        .rejects.toThrow('The \'checkoutUrl\' callback must return a URL string or an object with a \'url\' string')
    })

    test('should propagate errors thrown by the callback', async () => {
      checkoutUrl.mockRejectedValue(new PaycrestApiError('Failed to create Paycrest order: 400 Failed to validate payload', { status: 400 }))

      await expect(paycrest.buy({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', fiatAmount: 100n, recipient: WALLET_ADDRESS, config: buyConfig }))
        .rejects.toThrow(PaycrestApiError)
    })
  })

  describe('sell', () => {
    test('should hand an off-ramp order for a crypto amount to the checkoutUrl callback', async () => {
      const result = await paycrest.sell({
        cryptoAsset: 'USDT',
        fiatCurrency: 'NGN',
        cryptoAmount: 100_000_000n,
        refundAddress: WALLET_ADDRESS,
        config: { recipient: FIAT_RECIPIENT, reference: 'order-7', rate: '1490.5', providerIds: RATES.sell.providerIds }
      })

      expect(checkoutUrl).toHaveBeenCalledWith({
        direction: 'offramp',
        order: {
          amount: '100',
          amountIn: 'crypto',
          reference: 'order-7',
          rate: '1490.5',
          source: { type: 'crypto', currency: 'USDT', network: 'base', refundAddress: WALLET_ADDRESS },
          destination: {
            type: 'fiat',
            currency: 'NGN',
            providerIds: RATES.sell.providerIds,
            recipient: FIAT_RECIPIENT
          }
        }
      })
      expect(result).toEqual({ sellUrl: CHECKOUT_URL })
    })

    test('should support a fiat amount and KES mobile money metadata', async () => {
      paycrest = new PaycrestProtocol(account, { checkoutUrl, fetch: fetchMock, network: 'base' })

      await paycrest.sell({
        cryptoAsset: 'USDC',
        fiatCurrency: 'KES',
        fiatAmount: 1_000_000n,
        config: {
          recipient: { institution: 'SAFAKEPC', accountIdentifier: '123456', accountName: 'Shop', metadata: { channel: 'Till' } },
          country: 'KE',
          kyc: KYC,
          recipientKyc: KYC
        }
      })

      const { order } = checkoutUrl.mock.calls[0][0]
      expect(order.amount).toBe('10000')
      expect(order.amountIn).toBe('fiat')
      expect(order.source).toEqual({ type: 'crypto', currency: 'USDC', network: 'base', refundAddress: WALLET_ADDRESS, kyc: KYC })
      expect(order.destination).toEqual({
        type: 'fiat',
        currency: 'KES',
        country: 'KE',
        kyc: KYC,
        recipient: { institution: 'SAFAKEPC', accountIdentifier: '123456', accountName: 'Shop', memo: 'Payment', metadata: { channel: 'Till' } }
      })
    })

    test('should default the memo to the reference', async () => {
      const { memo, ...recipient } = FIAT_RECIPIENT

      await paycrest.sell({ cryptoAsset: 'USDT', fiatCurrency: 'UGX', cryptoAmount: 1_000_000n, refundAddress: WALLET_ADDRESS, config: { recipient, reference: 'inv-9' } })

      expect(checkoutUrl.mock.calls[0][0].order.destination.recipient.memo).toBe('inv-9')
    })

    test('should return the order id and funding instructions when the callback returns them', async () => {
      const order = offrampOrder()
      checkoutUrl.mockResolvedValue({ url: CHECKOUT_URL, orderId: ORDER_ID, order })

      const result = await paycrest.sell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1n, refundAddress: WALLET_ADDRESS, config: { recipient: FIAT_RECIPIENT } })

      expect(result.sellUrl).toBe(CHECKOUT_URL)
      expect(result.orderId).toBe(ORDER_ID)
      expect(result.metadata.providerAccount.receiveAddress).toBe(order.providerAccount.receiveAddress)
    })

    test('should require a fiat recipient', async () => {
      const error = await paycrest.sell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1n, refundAddress: WALLET_ADDRESS }).catch((e) => e)

      expect(error).toBeInstanceOf(ValueError)
      expect(error.message).toBe('\'config.recipient\' must include \'institution\', \'accountIdentifier\', \'accountName\'')
    })

    test('should require a refund address when no account is bound', async () => {
      await expect(paycrest.sell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1n, config: { recipient: FIAT_RECIPIENT } }))
        .rejects.toThrow('A \'refundAddress\' is required when the protocol is not bound to an account')
    })

    test('should throw when checkoutUrl is not configured', async () => {
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock })

      await expect(paycrest.sell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1n, config: { recipient: FIAT_RECIPIENT } }))
        .rejects.toThrow('A \'checkoutUrl\' callback is required to create a Paycrest order')
    })
  })

  describe('getTransactionDetail', () => {
    test.each([
      ['offramp', 'initiated', 'in_progress'],
      ['offramp', 'deposited', 'in_progress'],
      ['offramp', 'pending', 'in_progress'],
      ['offramp', 'fulfilling', 'in_progress'],
      ['offramp', 'fulfilled', 'in_progress'],
      ['offramp', 'validated', 'completed'],
      ['offramp', 'settling', 'completed'],
      ['offramp', 'settled', 'completed'],
      ['offramp', 'refunding', 'failed'],
      ['offramp', 'refunded', 'failed'],
      ['offramp', 'expired', 'failed'],
      ['offramp', 'cancelled', 'failed'],
      ['onramp', 'initiated', 'in_progress'],
      ['onramp', 'pending', 'in_progress'],
      ['onramp', 'fulfilling', 'in_progress'],
      ['onramp', 'validated', 'in_progress'],
      ['onramp', 'settling', 'in_progress'],
      ['onramp', 'settled', 'completed'],
      ['onramp', 'refunded', 'failed'],
      ['onramp', 'expired', 'failed']
    ])('should map a %s order in %s to %s', async (direction, status, expected) => {
      const order = direction === 'onramp' ? onrampOrder(status) : offrampOrder(status)
      getOrder.mockResolvedValue(order)

      const detail = await paycrest.getTransactionDetail(ORDER_ID)

      expect(getOrder).toHaveBeenCalledWith(ORDER_ID)
      expect(detail.status).toBe(expected)
    })

    test('should report the stablecoin and fiat of an off-ramp order', async () => {
      const order = offrampOrder('settled')
      getOrder.mockResolvedValue(order)

      await expect(paycrest.getTransactionDetail(ORDER_ID)).resolves.toEqual({
        status: 'completed',
        cryptoAsset: 'USDT',
        fiatCurrency: 'NGN',
        metadata: order
      })
    })

    test('should report the stablecoin and fiat of an on-ramp order and unwrap the API envelope', async () => {
      const { direction, ...order } = onrampOrder('pending')
      getOrder.mockResolvedValue(success(order))

      const detail = await paycrest.getTransactionDetail(ORDER_ID)

      expect(detail).toEqual({ status: 'in_progress', cryptoAsset: 'USDT', fiatCurrency: 'NGN', metadata: order })
    })

    test('should treat unknown statuses as in progress', async () => {
      getOrder.mockResolvedValue(offrampOrder('something_new'))

      await expect(paycrest.getTransactionDetail(ORDER_ID)).resolves.toMatchObject({ status: 'in_progress' })
    })

    test('should throw when getOrder is not configured', async () => {
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock })

      const error = await paycrest.getTransactionDetail(ORDER_ID).catch((e) => e)

      expect(error).toBeInstanceOf(ValueError)
      expect(error.message).toBe('A \'getOrder\' callback is required to fetch a Paycrest order')
    })

    test('should reject an empty order id', async () => {
      await expect(paycrest.getTransactionDetail('')).rejects.toThrow('\'txId\' must be a non-empty string')
      expect(getOrder).not.toHaveBeenCalled()
    })

    test('should reject a malformed order', async () => {
      getOrder.mockResolvedValue({ id: ORDER_ID })

      await expect(paycrest.getTransactionDetail(ORDER_ID)).rejects.toThrow('Paycrest order response is missing required order fields')
    })
  })

  describe('supported assets, currencies and countries', () => {
    test('should map Paycrest tokens to supported crypto assets', async () => {
      const assets = await paycrest.getSupportedCryptoAssets()

      expect(assets).toHaveLength(TOKENS.length)
      expect(assets[2]).toEqual({ code: 'USDT', networkCode: 'bnb-smart-chain', decimals: 18, name: 'USDT', metadata: TOKENS[2] })
    })

    test('should map Paycrest currencies using their reported decimals', async () => {
      const currencies = await paycrest.getSupportedFiatCurrencies()

      expect(currencies.find(({ code }) => code === 'UGX')).toEqual({ code: 'UGX', decimals: 2, name: 'Ugandan Shilling', metadata: CURRENCIES[2] })
    })

    test('should derive countries from the supported currencies', async () => {
      const countries = await paycrest.getSupportedCountries()

      expect(countries).toEqual([
        { code: 'NG', name: 'Nigeria', isBuyAllowed: true, isSellAllowed: true, metadata: { currency: 'NGN' } },
        { code: 'KE', name: 'Kenya', isBuyAllowed: true, isSellAllowed: true, metadata: { currency: 'KES' } },
        { code: 'UG', name: 'Uganda', isBuyAllowed: true, isSellAllowed: true, metadata: { currency: 'UGX' } },
        { code: 'TZ', name: 'Tanzania', isBuyAllowed: true, isSellAllowed: true, metadata: { currency: 'TZS' } }
      ])
    })

    test('should skip currencies without a known country', async () => {
      fetchMock = createFetchMock({ currencies: [{ code: 'XYZ', name: 'Unknown', decimals: 2 }] })
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock })

      await expect(paycrest.getSupportedCountries()).resolves.toEqual([])
    })

    test('should cache tokens and currencies for cacheTime', async () => {
      await paycrest.getSupportedCryptoAssets()
      await paycrest.getSupportedFiatCurrencies()
      await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 1_000_000n })

      const paths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname)
      expect(paths.filter((path) => path === '/v2/tokens')).toHaveLength(1)
      expect(paths.filter((path) => path === '/v2/currencies')).toHaveLength(1)
    })

    test('should refetch once the cache expires', async () => {
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, cacheTime: 0 })

      await paycrest.getSupportedCryptoAssets()
      await paycrest.getSupportedCryptoAssets()

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    test('should reject an unexpected response shape', async () => {
      fetchMock = jest.fn().mockResolvedValue(jsonResponse(success({ not: 'an array' })))
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock })

      await expect(paycrest.getSupportedFiatCurrencies()).rejects.toThrow('Failed to fetch Paycrest supported currencies: unexpected response shape')
    })

    test('should honour a custom base URL', async () => {
      paycrest = new PaycrestProtocol(undefined, { fetch: fetchMock, baseUrl: 'https://paycrest.internal.example' })

      await paycrest.getSupportedCryptoAssets()

      expect(fetchMock.mock.calls[0][0]).toBe('https://paycrest.internal.example/v2/tokens')
    })
  })
})
