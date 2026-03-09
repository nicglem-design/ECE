/**
 * E2E test: Support contact form (guest submission)
 *
 * Run with: npx tsx scripts/e2e-support-flow.ts
 * Requires: API running on http://localhost:4000
 */

const API_BASE = process.env.API_BACKEND_URL || "http://localhost:4000";

async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  console.log("E2E: Support contact form (guest)\n");
  console.log("API:", API_BASE);

  // Guest support submission (no auth)
  console.log("\n1. Submit support message as guest...");
  const result = await fetchApi("/api/v1/support/contact", {
    method: "POST",
    body: JSON.stringify({
      subject: "E2E Test - Support inquiry",
      message: "This is an automated E2E test message. Please ignore.",
      email: `e2e-support-${Date.now()}@test.local`,
    }),
  });
  if (!result.success) throw new Error("Support submission failed");
  console.log("   OK");

  // Reject missing subject
  console.log("\n2. Reject missing subject...");
  try {
    await fetchApi("/api/v1/support/contact", {
      method: "POST",
      body: JSON.stringify({
        message: "Message without subject",
        email: "test@test.local",
      }),
    });
    throw new Error("Should have rejected missing subject");
  } catch (e) {
    if (e instanceof Error && e.message.includes("Should have rejected")) throw e;
    console.log("   OK (correctly rejected)");
  }

  // Reject invalid email
  console.log("\n3. Reject invalid guest email...");
  try {
    await fetchApi("/api/v1/support/contact", {
      method: "POST",
      body: JSON.stringify({
        subject: "Test",
        message: "Test message",
        email: "not-an-email",
      }),
    });
    throw new Error("Should have rejected invalid email");
  } catch (e) {
    if (e instanceof Error && e.message.includes("Should have rejected")) throw e;
    console.log("   OK (correctly rejected)");
  }

  console.log("\n✓ E2E support flow complete.");
}

main().catch((err) => {
  console.error("\n✗ Failed:", err.message);
  process.exit(1);
});
