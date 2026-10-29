import { jest } from '@jest/globals'

export const TOKENS = [
  { symbol: 'USDT', contractAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, baseCurrency: 'USD', network: 'base' },
  { symbol: 'USDT', contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, baseCurrency: 'USD', network: 'tron' },
  { symbol: 'USDT', contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, baseCurrency: 'USD', network: 'bnb-smart-chain' },
  { symbol: 'USDC', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, baseCurrency: 'USD', network: 'base' }
]

export const CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', shortName: 'Naira', decimals: 2, symbol: '₦', marketBuyRate: '1500', marketSellRate: '1490' },
  { code: 'KES', name: 'Kenyan Shilling', shortName: 'KES', decimals: 2, symbol: 'KSh', marketBuyRate: '130', marketSellRate: '129' },
  { code: 'UGX', name: 'Ugandan Shilling', shortName: 'UGX', decimals: 2, symbol: 'USh' },
  { code: 'TZS', name: 'Tanzanian Shilling', shortName: 'TZS', decimals: 2, symbol: 'TSh', marketBuyRate: '2650', marketSellRate: '2640' }
]

export const RATES = {
  buy: { rate: '1500.25', providerIds: ['AbCdEfGh', 'IjKlMnOp'], orderType: 'regular', refundTimeoutMinutes: 60 },
  sell: { rate: '1490.5', providerIds: ['QrStUvWx', 'AbCdEfGh', 'IjKlMnOp'], orderType: 'regular', refundTimeoutMinutes: 60 }
}

export const success = (data) => ({ status: 'success', message: 'OK', data })

export function jsonResponse (body, { status = 200, statusText = 'OK', headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body
  }
}

/**
 * Builds a fetch mock that routes Paycrest public endpoints. `rates` may be a
 * function of the request URL for per-test control.
 */
export function createFetchMock ({ tokens = TOKENS, currencies = CURRENCIES, rates = RATES } = {}) {
  return jest.fn(async (url) => {
    const { pathname } = new URL(url)

    if (pathname === '/v2/tokens') return jsonResponse(success(tokens))
    if (pathname === '/v2/currencies') return jsonResponse(success(currencies))

    if (pathname.startsWith('/v2/rates/')) {
      const result = typeof rates === 'function' ? rates(url) : rates
      if (result && typeof result.json === 'function') return result
      const side = new URL(url).searchParams.get('side')
      return jsonResponse(success(side ? { [side]: result[side] } : result))
    }

    return jsonResponse({ status: 'error', message: 'Not found', data: null }, { status: 404, statusText: 'Not Found' })
  })
}

export const KYC = {
  entityType: 'person',
  personDetails: {
    fullName: 'Ada Lovelace',
    birthDate: '1990-04-12',
    idDocument: { type: 'BVN', number: '00000000000', issuerCountry: 'NG' }
  }
}

export const REFUND_ACCOUNT = { institution: 'GTBINGLA', accountIdentifier: '3333333333', accountName: 'Ada Lovelace' }

export const FIAT_RECIPIENT = { institution: 'GTBINGLA', accountIdentifier: '2222222222', accountName: 'Ada Lovelace', memo: 'Rent' }

export const WALLET_ADDRESS = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'

export const ORDER_ID = '550e8400-e29b-41d4-a716-446655440000'

export function offrampOrder (status = 'initiated') {
  return {
    id: ORDER_ID,
    status,
    direction: 'offramp',
    amount: '100',
    rate: '1490.5',
    providerAccount: {
      network: 'base',
      receiveAddress: '0x000000000000000000000000000000000000dEaD',
      validUntil: '2026-03-01T10:05:00Z',
      amountToTransfer: '100.1',
      currency: 'USDT'
    },
    source: { type: 'crypto', currency: 'USDT', network: 'base', refundAddress: WALLET_ADDRESS },
    destination: { type: 'fiat', currency: 'NGN', recipient: FIAT_RECIPIENT }
  }
}

export function onrampOrder (status = 'initiated') {
  return {
    id: ORDER_ID,
    status,
    direction: 'onramp',
    amount: '33.33',
    rate: '1500.25',
    providerAccount: {
      institution: 'Example Bank',
      accountIdentifier: '1111111111',
      accountName: 'Example Provider / Ada Lovelace',
      amountToTransfer: '50000',
      currency: 'NGN',
      validUntil: '2026-03-01T10:05:00Z'
    },
    source: { type: 'fiat', currency: 'NGN', refundAccount: REFUND_ACCOUNT },
    destination: { type: 'crypto', currency: 'USDT', recipient: { address: WALLET_ADDRESS, network: 'base' } }
  }
}
