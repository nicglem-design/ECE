/**
 * E2E test: Auth flow (signup, login, refresh, logout, forgot-password)
 *
 * Run with: npx tsx scripts/e2e-auth-flow.ts
 * Requires: API running on http://localhost:4000
 */

const API_BASE = process.env.API_BACKEND_URL || "http://localhost:4000";
const TEST_EMAIL = `e2e-auth-${Date.now()}@test.local`;
const TEST_PASSWORD = "TestPassword123!";
const TEST_BIRTH_DATE = "1990-01-15";

let token: string;
let refreshToken: string;

async function fetchApi(path: string, options: RequestInit = {}, useToken = true) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (useToken && token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  console.log("E2E: Auth flow (signup, login, refresh, logout, forgot-password)\n");
  console.log("API:", API_BASE);

  // 1. Sign up
  console.log("\n1. Sign up...");
  const signup = await fetchApi(
    "/api/v1/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        birthDate: TEST_BIRTH_DATE,
        acceptedTerms: true,
      }),
    },
    false
  );
  token = signup.token;
  refreshToken = signup.refreshToken;
  if (!token) throw new Error("No token from signup");
  console.log("   OK");

  // 2. Login
  console.log("\n2. Login...");
  const login = await fetchApi(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    },
    false
  );
  token = login.token;
  refreshToken = login.refreshToken;
  if (!token) throw new Error("No token from login");
  console.log("   OK");

  // 3. Refresh token
  console.log("\n3. Refresh token...");
  const refreshed = await fetchApi(
    "/api/v1/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    },
    false
  );
  token = refreshed.token;
  refreshToken = refreshed.refreshToken;
  if (!token) throw new Error("No token from refresh");
  console.log("   OK");

  // 4. Forgot password (always returns success for security)
  console.log("\n4. Forgot password...");
  await fetchApi(
    "/api/v1/auth/forgot-password",
    {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL }),
    },
    false
  );
  console.log("   OK");

  // 5. Logout
  console.log("\n5. Logout...");
  await fetchApi("/api/v1/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken, accessToken: token }),
  });
  console.log("   OK");

  // 6. Verify refresh no longer works
  console.log("\n6. Verify refresh token revoked...");
  try {
    await fetchApi(
      "/api/v1/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      false
    );
    throw new Error("Refresh should have failed after logout");
  } catch (e) {
    if (e instanceof Error && e.message.includes("Refresh should have failed")) throw e;
    console.log("   OK (refresh correctly rejected)");
  }

  console.log("\n✓ E2E auth flow complete.");
}

main().catch((err) => {
  console.error("\n✗ Failed:", err.message);
  process.exit(1);
});
