/**
 * Static token image URLs from CoinGecko CDN.
 * Used for instant display without API calls. Falls back to API for unknown tokens.
 */
export const COINGECKO_IMAGE_URLS: Record<string, string> = {
  bitcoin: "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png",
  ethereum: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  tether: "https://coin-images.coingecko.com/coins/images/325/small/Tether.png",
  binancecoin: "https://coin-images.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  solana: "https://coin-images.coingecko.com/coins/images/4128/small/solana.png",
  "matic-network": "https://coin-images.coingecko.com/coins/images/4713/small/matic-token-icon.png",
  "avalanche-2": "https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  fantom: "https://coin-images.coingecko.com/coins/images/4001/small/Fantom_round.png",
  cronos: "https://coin-images.coingecko.com/coins/images/7310/small/cro_token_logo.png",
  gnosis: "https://coin-images.coingecko.com/coins/images/662/small/logo_square_simple_300px.png",
  mantle: "https://coin-images.coingecko.com/coins/images/3334/small/mantle.jpg",
  celo: "https://coin-images.coingecko.com/coins/images/11090/small/InjXBNx9_400x400.jpg",
  moonbeam: "https://coin-images.coingecko.com/coins/images/22459/small/glmr.png",
  "metis-token": "https://coin-images.coingecko.com/coins/images/15595/small/metis.png",
  kava: "https://coin-images.coingecko.com/coins/images/9761/small/kava.png",
  harmony: "https://coin-images.coingecko.com/coins/images/4344/small/Y88JAze.png",
  litecoin: "https://coin-images.coingecko.com/coins/images/2/small/litecoin.png",
  dogecoin: "https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png",
};
