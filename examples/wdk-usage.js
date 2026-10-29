// Client-side usage with WDK core. Nothing here holds a Paycrest credential:
// quotes and discovery use Paycrest's public endpoints, and order creation and
// lookup go through your backend (see examples/server.js).

import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import PaycrestProtocol from '@paycrest/wdk-protocol-fiat-paycrest'

const BACKEND = 'https://your-backend.example.com/paycrest'
const headers = { 'content-type': 'application/json', 'x-user-id': 'user-123' }

const wdk = new WDK(process.env.SEED_PHRASE)
  .registerWallet('base', WalletManagerEvm, { provider: 'https://mainnet.base.org' })
  .registerProtocol('base', 'paycrest', PaycrestProtocol, {
    network: 'base',
    checkoutUrl: async (request) => {
      const resp = await fetch(`${BACKEND}/orders`, { method: 'POST', headers, body: JSON.stringify(request) })
      if (!resp.ok) throw new Error(`Checkout failed: ${resp.status}`)
      return resp.json() // { url, orderId, order }
    },
    getOrder: async (orderId) => {
      const resp = await fetch(`${BACKEND}/orders/${encodeURIComponent(orderId)}`, { headers })
      if (!resp.ok) throw new Error(`Order lookup failed: ${resp.status}`)
      return resp.json()
    }
  })

const account = await wdk.getAccount('base', 0)
const paycrest = account.getFiatProtocol('paycrest')

// Off-ramp: 50 USDT on Base to a Nigerian bank account.
const quote = await paycrest.quoteSell({ cryptoAsset: 'USDT', fiatCurrency: 'NGN', cryptoAmount: 50_000_000n })
console.log(`50 USDT is about ${Number(quote.fiatAmount) / 100} NGN at ${quote.rate}`)

const { sellUrl, orderId, metadata: order } = await paycrest.sell({
  cryptoAsset: 'USDT',
  fiatCurrency: 'NGN',
  cryptoAmount: 50_000_000n,
  config: {
    recipient: { institution: 'GTBINGLA', accountIdentifier: '0123456789', accountName: 'Ada Lovelace', memo: 'Payout' },
    rate: quote.rate,
    providerIds: quote.metadata.providerIds
  }
})

console.log('Show the user:', sellUrl)

// Or fund the order straight from the WDK wallet instead of showing the page.
// Send exactly `amountToTransfer`, converted without floating point.
const toBaseUnits = (value, decimals) => {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(decimals, '0').slice(0, decimals))
}

const [usdt] = (await paycrest.getSupportedCryptoAssets())
  .filter(({ code, networkCode }) => code === 'USDT' && networkCode === 'base')

const { amountToTransfer, receiveAddress } = order.providerAccount
await account.transfer({
  token: usdt.metadata.contractAddress,
  recipient: receiveAddress,
  amount: toBaseUnits(amountToTransfer, usdt.decimals)
})

console.log(await paycrest.getTransactionDetail(orderId))
