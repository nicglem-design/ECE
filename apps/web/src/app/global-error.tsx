"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 24, background: "#020617", color: "#e2e8f0", fontFamily: "system-ui" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#94a3b8" }}>{error.message}</p>
          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <button
              onClick={reset}
              style={{
                padding: "8px 16px",
                background: "#0ea5e9",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "8px 16px",
                border: "1px solid #475569",
                borderRadius: 8,
                color: "#cbd5e1",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
