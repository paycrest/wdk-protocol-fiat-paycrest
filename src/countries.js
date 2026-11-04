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

// Paycrest has no countries endpoint, so countries are derived from the
// currencies it lists. A currency missing here yields no country entries.
const CURRENCY_COUNTRIES = {
  NGN: [['NG', 'Nigeria']],
  KES: [['KE', 'Kenya']],
  UGX: [['UG', 'Uganda']],
  TZS: [['TZ', 'Tanzania']],
  GHS: [['GH', 'Ghana']],
  MWK: [['MW', 'Malawi']],
  ZMW: [['ZM', 'Zambia']],
  RWF: [['RW', 'Rwanda']],
  ETB: [['ET', 'Ethiopia']],
  ZAR: [['ZA', 'South Africa']],
  EGP: [['EG', 'Egypt']],
  MAD: [['MA', 'Morocco']],
  XOF: [['BJ', 'Benin'], ['BF', 'Burkina Faso'], ['CI', 'Côte d\'Ivoire'], ['GW', 'Guinea-Bissau'], ['ML', 'Mali'], ['NE', 'Niger'], ['SN', 'Senegal'], ['TG', 'Togo']],
  XAF: [['CM', 'Cameroon'], ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CG', 'Republic of the Congo'], ['GQ', 'Equatorial Guinea'], ['GA', 'Gabon']],
  BRL: [['BR', 'Brazil']],
  INR: [['IN', 'India']]
}

/**
 * Returns the countries that use a fiat currency.
 * @param {string} currencyCode - The ISO 4217 currency code.
 * @returns {{ code: string, name: string }[]} The ISO 3166-1 alpha-2 countries using the currency.
 */
export function getCountriesForCurrency (currencyCode) {
  const countries = CURRENCY_COUNTRIES[currencyCode?.toUpperCase()] ?? []

  return countries.map(([code, name]) => ({ code, name }))
}
