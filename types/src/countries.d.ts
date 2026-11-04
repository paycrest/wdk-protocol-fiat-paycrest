/**
 * Returns the countries that use a fiat currency.
 * @param {string} currencyCode - The ISO 4217 currency code.
 * @returns {{ code: string, name: string }[]} The ISO 3166-1 alpha-2 countries using the currency.
 */
export function getCountriesForCurrency(currencyCode: string): {
    code: string;
    name: string;
}[];
