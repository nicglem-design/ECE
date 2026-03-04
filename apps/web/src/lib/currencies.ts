/**
 * World currencies - fetches from CoinGecko and provides display names.
 * CoinGecko supports 50+ fiat currencies plus crypto/metals.
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const CURRENCY_NAMES: Record<string, string> = {
  usd: "US Dollar",
  eur: "Euro",
  gbp: "British Pound",
  jpy: "Japanese Yen",
  chf: "Swiss Franc",
  cad: "Canadian Dollar",
  aud: "Australian Dollar",
  cny: "Chinese Yuan",
  inr: "Indian Rupee",
  krw: "South Korean Won",
  mxn: "Mexican Peso",
  brl: "Brazilian Real",
  rub: "Russian Ruble",
  zar: "South African Rand",
  sek: "Swedish Krona",
  nok: "Norwegian Krone",
  dkk: "Danish Krone",
  pln: "Polish Złoty",
  try: "Turkish Lira",
  idr: "Indonesian Rupiah",
  thb: "Thai Baht",
  hkd: "Hong Kong Dollar",
  sgd: "Singapore Dollar",
  nzd: "New Zealand Dollar",
  php: "Philippine Peso",
  myr: "Malaysian Ringgit",
  huf: "Hungarian Forint",
  czk: "Czech Koruna",
  ils: "Israeli Shekel",
  clp: "Chilean Peso",
  pkr: "Pakistani Rupee",
  bdt: "Bangladeshi Taka",
  aed: "UAE Dirham",
  sar: "Saudi Riyal",
  ngn: "Nigerian Naira",
  ars: "Argentine Peso",
  uah: "Ukrainian Hryvnia",
  twd: "Taiwan Dollar",
  vnd: "Vietnamese Dong",
  bhd: "Bahraini Dinar",
  bmd: "Bermudian Dollar",
  gel: "Georgian Lari",
  kwd: "Kuwaiti Dinar",
  lkr: "Sri Lankan Rupee",
  mmk: "Myanmar Kyat",
  xdr: "IMF Special Drawing Rights",
  xag: "Silver (troy ounce)",
  xau: "Gold (troy ounce)",
  btc: "Bitcoin",
  eth: "Ethereum",
  ltc: "Litecoin",
  bch: "Bitcoin Cash",
  bnb: "BNB",
  eos: "EOS",
  xrp: "XRP",
  xlm: "Stellar",
  link: "Chainlink",
  dot: "Polkadot",
  yfi: "yearn.finance",
  sol: "Solana",
  bits: "Bits",
  sats: "Satoshi",
  vef: "Venezuelan Bolívar",
};

function getName(id: string): string {
  return CURRENCY_NAMES[id.toLowerCase()] ?? id.toUpperCase();
}

export function getCurrencySymbol(id: string): string {
  return (id ?? "usd").toUpperCase();
}

export function getFallbackCurrencies() {
  return Object.entries(CURRENCY_NAMES).map(([id, name]) => ({
    id: id.toLowerCase(),
    name,
    symbol: id.toUpperCase(),
  }));
}

export async function fetchSupportedCurrencies() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${COINGECKO_BASE}/simple/supported_vs_currencies`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return getFallbackCurrencies();
    const ids = await res.json();
    if (!Array.isArray(ids) || ids.length === 0) return getFallbackCurrencies();
    return ids.map((id: string) => ({
      id: String(id).toLowerCase(),
      name: getName(id),
      symbol: String(id).toUpperCase(),
    }));
  } catch {
    return getFallbackCurrencies();
  }
}

export { CURRENCY_NAMES };
