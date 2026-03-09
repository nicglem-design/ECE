import { describe, it, expect } from "vitest";
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshSchema,
} from "./auth";

describe("Auth Zod schemas", () => {
  describe("loginSchema", () => {
    it("accepts valid login", () => {
      const result = loginSchema.safeParse({ email: "user@example.com", password: "secret" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = loginSchema.safeParse({ email: "invalid", password: "secret" });
      expect(result.success).toBe(false);
    });

    it("rejects empty password", () => {
      const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("signupSchema", () => {
    it("accepts valid signup", () => {
      const result = signupSchema.safeParse({
        email: "user@example.com",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional birthDate and acceptedTerms", () => {
      const result = signupSchema.safeParse({
        email: "user@example.com",
        password: "password123",
        birthDate: "1990-01-15",
        acceptedTerms: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects short password", () => {
      const result = signupSchema.safeParse({
        email: "user@example.com",
        password: "short",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = signupSchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("forgotPasswordSchema", () => {
    it("accepts valid email", () => {
      const result = forgotPasswordSchema.safeParse({ email: "user@example.com" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = forgotPasswordSchema.safeParse({ email: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  describe("resetPasswordSchema", () => {
    it("accepts valid reset", () => {
      const result = resetPasswordSchema.safeParse({
        token: "abc123",
        password: "newpassword123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects short password", () => {
      const result = resetPasswordSchema.safeParse({
        token: "abc123",
        password: "short",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty token", () => {
      const result = resetPasswordSchema.safeParse({
        token: "",
        password: "newpassword123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("refreshSchema", () => {
    it("accepts valid refresh token", () => {
      const result = refreshSchema.safeParse({ refreshToken: "uuid-token-here" });
      expect(result.success).toBe(true);
    });

    it("rejects empty refresh token", () => {
      const result = refreshSchema.safeParse({ refreshToken: "" });
      expect(result.success).toBe(false);
    });
  });
});
