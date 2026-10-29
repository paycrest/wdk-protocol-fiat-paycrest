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

/** @typedef {import('./src/paycrest-protocol.js').PaycrestProtocolConfig} PaycrestProtocolConfig */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestToken} PaycrestToken */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestCurrency} PaycrestCurrency */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestRateSide} PaycrestRateSide */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestQuoteMetadata} PaycrestQuoteMetadata */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestQuote} PaycrestQuote */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestQuoteParams} PaycrestQuoteParams */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestFiatAccount} PaycrestFiatAccount */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestFiatRecipient} PaycrestFiatRecipient */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestKyc} PaycrestKyc */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestBuyParams} PaycrestBuyParams */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestSellParams} PaycrestSellParams */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestBuyOptions} PaycrestBuyOptions */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestQuoteBuyOptions} PaycrestQuoteBuyOptions */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestSellOptions} PaycrestSellOptions */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestQuoteSellOptions} PaycrestQuoteSellOptions */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestOrderPayload} PaycrestOrderPayload */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestCheckoutRequest} PaycrestCheckoutRequest */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestCheckoutResult} PaycrestCheckoutResult */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestOrder} PaycrestOrder */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestBuyResult} PaycrestBuyResult */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestSellResult} PaycrestSellResult */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestTransactionDetail} PaycrestTransactionDetail */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestSupportedCryptoAsset} PaycrestSupportedCryptoAsset */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestSupportedFiatCurrency} PaycrestSupportedFiatCurrency */
/** @typedef {import('./src/paycrest-protocol.js').PaycrestSupportedCountry} PaycrestSupportedCountry */
/** @typedef {import('./src/status.js').PaycrestOrderStatus} PaycrestOrderStatus */
/** @typedef {import('./src/status.js').PaycrestOrderDirection} PaycrestOrderDirection */

export { default, PaycrestProtocol, IFiatProtocol } from './src/paycrest-protocol.js'

export { PaycrestApiError } from './src/errors.js'

export { toWdkStatus, getOrderDirection } from './src/status.js'
