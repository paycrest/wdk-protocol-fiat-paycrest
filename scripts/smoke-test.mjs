// Live smoke test against Paycrest's public endpoints. Needs no API key and
// creates no orders: it lists tokens and currencies, then quotes both sides
// for USDT and USDC against NGN, KES, UGX and TZS.
//
//   npm run smoke            (defaults to the 'base' network)
//   NETWORK=tron npm run smoke

import PaycrestProtocol, { PaycrestApiError } from '../index.js'

const network = process.env.NETWORK ?? 'base'
const paycrest = new PaycrestProtocol(undefined, { network })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function withRetry (fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof PaycrestApiError) || error.status !== 429 || attempt >= 5) throw error
      await sleep((error.retryAfter ?? 2) * 1000)
    }
  }
}

const assets = await withRetry(() => paycrest.getSupportedCryptoAssets())
const currencies = await withRetry(() => paycrest.getSupportedFiatCurrencies())
const countries = await withRetry(() => paycrest.getSupportedCountries())

console.log(`Tokens on ${network}:`, assets.filter((a) => a.networkCode === network).map((a) => `${a.code} (${a.decimals} decimals)`).join(', '))
console.log('Fiat currencies:', currencies.map((c) => c.code).join(', '))
console.log('Countries:', countries.map((c) => c.code).join(', '))

for (const cryptoAsset of ['USDT', 'USDC']) {
  const token = assets.find((a) => a.code === cryptoAsset && a.networkCode === network)
  if (!token) {
    console.log(`${cryptoAsset}: not listed on ${network}`)
    continue
  }

  for (const fiatCurrency of ['NGN', 'KES', 'UGX', 'TZS']) {
    const cryptoAmount = 10n * 10n ** BigInt(token.decimals)

    for (const side of ['sell', 'buy']) {
      const label = `${side === 'sell' ? 'off-ramp' : 'on-ramp'} 10 ${cryptoAsset} / ${fiatCurrency}`

      try {
        const quote = await withRetry(() => side === 'sell'
          ? paycrest.quoteSell({ cryptoAsset, fiatCurrency, cryptoAmount })
          : paycrest.quoteBuy({ cryptoAsset, fiatCurrency, cryptoAmount }))
        console.log(`${label}: rate ${quote.rate}, fiat ${quote.fiatAmount} minor units`)
      } catch (error) {
        console.log(`${label}: unavailable (${error.message})`)
      }
    }
  }
}
