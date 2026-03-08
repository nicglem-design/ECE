/**
 * Address validation per chain.
 */

const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
const BITCOIN_BECH32_REGEX = /^bc1[a-zA-HJ-NP-Z0-9]{25,89}$/;
const BITCOIN_LEGACY_REGEX = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const SOLANA_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LITECOIN_BECH32_REGEX = /^ltc1[a-zA-HJ-NP-Z0-9]{25,89}$/;
const DOGECOIN_REGEX = /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/;

export function validateAddress(chainId: string, address: string): { valid: boolean; error?: string } {
  const addr = address.trim();
  if (!addr || addr.length < 10) {
    return { valid: false, error: "Address is too short" };
  }

  switch (chainId) {
    case "ethereum":
    case "binancecoin":
    case "matic-network":
    case "avalanche-2":
      if (!EVM_REGEX.test(addr)) {
        return { valid: false, error: "Invalid EVM address (expected 0x followed by 40 hex chars)" };
      }
      return { valid: true };
    case "bitcoin":
      if (BITCOIN_BECH32_REGEX.test(addr) || BITCOIN_LEGACY_REGEX.test(addr)) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid Bitcoin address (use bc1... or legacy 1/3...)" };
    case "solana":
      if (SOLANA_REGEX.test(addr) && addr.length >= 32 && addr.length <= 44) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid Solana address (base58, 32-44 chars)" };
    case "litecoin":
      if (LITECOIN_BECH32_REGEX.test(addr) || /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(addr)) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid Litecoin address" };
    case "dogecoin":
      if (DOGECOIN_REGEX.test(addr) || /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(addr)) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid Dogecoin address (starts with D)" };
    case "tether":
    case "usd-coin":
      if (!EVM_REGEX.test(addr)) {
        return { valid: false, error: "Invalid EVM address for ERC20 (expected 0x...)" };
      }
      return { valid: true };
    default:
      return { valid: true };
  }
}
