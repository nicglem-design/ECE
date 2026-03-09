import { describe, it, expect } from "vitest";
import { profilePatchSchema } from "./profile";

describe("Profile PATCH Zod schema", () => {
  it("accepts empty object", () => {
    const result = profilePatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid displayName", () => {
    const result = profilePatchSchema.safeParse({ displayName: "John Doe" });
    expect(result.success).toBe(true);
  });

  it("accepts valid theme", () => {
    const result = profilePatchSchema.safeParse({ theme: "dark" });
    expect(result.success).toBe(true);
  });

  it("accepts valid preferredCurrency", () => {
    const result = profilePatchSchema.safeParse({ preferredCurrency: "eur" });
    expect(result.success).toBe(true);
  });

  it("accepts empty avatarUrl", () => {
    const result = profilePatchSchema.safeParse({ avatarUrl: "" });
    expect(result.success).toBe(true);
  });

  it("accepts valid avatarUrl", () => {
    const result = profilePatchSchema.safeParse({
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid theme", () => {
    const result = profilePatchSchema.safeParse({ theme: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid preferredCurrency", () => {
    const result = profilePatchSchema.safeParse({ preferredCurrency: "xyz" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const result = profilePatchSchema.safeParse({ displayName: "John", foo: "bar" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid avatarUrl", () => {
    const result = profilePatchSchema.safeParse({ avatarUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts full valid payload", () => {
    const result = profilePatchSchema.safeParse({
      displayName: "Alice",
      theme: "light",
      preferredCurrency: "gbp",
    });
    expect(result.success).toBe(true);
  });
});
