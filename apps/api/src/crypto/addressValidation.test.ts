import { describe, it, expect } from "vitest";
import { validateAddress } from "./addressValidation";

describe("validateAddress", () => {
  describe("EVM chains", () => {
    const chains = ["ethereum", "binancecoin", "matic-network", "avalanche-2"];

    const validEvm = "0x0000000000000000000000000000000000000001";
    for (const chain of chains) {
      it(`${chain}: accepts valid 0x address`, () => {
        expect(validateAddress(chain, validEvm)).toEqual({
          valid: true,
        });
      });

      it(`${chain}: rejects invalid short address`, () => {
        expect(validateAddress(chain, "0x123")).toEqual({
          valid: false,
          error: "Address is too short",
        });
      });

      it(`${chain}: rejects non-hex`, () => {
        expect(validateAddress(chain, "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEg")).toEqual({
          valid: false,
          error: "Invalid EVM address (expected 0x followed by 40 hex chars)",
        });
      });

      it(`${chain}: rejects non-0x prefix`, () => {
        expect(validateAddress(chain, "742d35Cc6634C0532925a3b844Bc9e7595f0bEb")).toEqual({
          valid: false,
          error: "Invalid EVM address (expected 0x followed by 40 hex chars)",
        });
      });
    }
  });

  describe("Bitcoin", () => {
    it("accepts bech32 (bc1)", () => {
      expect(validateAddress("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toEqual({
        valid: true,
      });
    });

    it("accepts legacy (1)", () => {
      expect(validateAddress("bitcoin", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toEqual({
        valid: true,
      });
    });

    it("accepts legacy (3)", () => {
      expect(validateAddress("bitcoin", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toEqual({
        valid: true,
      });
    });

    it("rejects invalid", () => {
      expect(validateAddress("bitcoin", "x".repeat(30))).toEqual({
        valid: false,
        error: "Invalid Bitcoin address (use bc1... or legacy 1/3...)",
      });
    });
  });

  describe("Solana", () => {
    it("accepts valid base58 address", () => {
      expect(
        validateAddress("solana", "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
      ).toEqual({ valid: true });
    });

    it("rejects too short", () => {
      expect(validateAddress("solana", "1A")).toEqual({
        valid: false,
        error: "Address is too short",
      });
    });

    it("rejects invalid chars", () => {
      expect(validateAddress("solana", "1O0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0")).toEqual({
        valid: false,
        error: "Invalid Solana address (base58, 32-44 chars)",
      });
    });
  });

  describe("Litecoin", () => {
    it("accepts bech32 (ltc1)", () => {
      expect(validateAddress("litecoin", "ltc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toEqual({
        valid: true,
      });
    });

    it("accepts legacy (L)", () => {
      expect(validateAddress("litecoin", "LVg2kJoFNg45Nbpy53T7o1ekVjzfs4a3NP")).toEqual({
        valid: true,
      });
    });
  });

  describe("Dogecoin", () => {
    it("accepts valid D address", () => {
      // D + [5-9A-HJ-NP-U] + 32 base58 chars = 34 total
      expect(
        validateAddress("dogecoin", "D5YW7F9Y2Q9K5s8K5s8K5s8K5s8K5s8K5s")
      ).toEqual({ valid: true });
    });

    it("rejects invalid", () => {
      expect(validateAddress("dogecoin", "1A")).toEqual({
        valid: false,
        error: "Address is too short",
      });
    });
  });

  describe("ERC20 (tether, usd-coin)", () => {
    it("accepts valid EVM address", () => {
      expect(validateAddress("tether", "0x0000000000000000000000000000000000000001")).toEqual({
        valid: true,
      });
    });

    it("rejects non-EVM", () => {
      expect(validateAddress("tether", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toEqual({
        valid: false,
        error: "Invalid EVM address for ERC20 (expected 0x...)",
      });
    });
  });

  describe("edge cases", () => {
    it("rejects empty string", () => {
      expect(validateAddress("ethereum", "")).toEqual({
        valid: false,
        error: "Address is too short",
      });
    });

    it("rejects too short", () => {
      expect(validateAddress("ethereum", "0x123")).toEqual({
        valid: false,
        error: "Address is too short",
      });
    });

    it("trims whitespace", () => {
      expect(validateAddress("ethereum", "  0x0000000000000000000000000000000000000001  ")).toEqual({
        valid: true,
      });
    });

    it("unknown chain accepts any address", () => {
      expect(validateAddress("unknown-chain", "0x0000000000000000000000000000000000000001")).toEqual({
        valid: true,
      });
    });
  });
});
