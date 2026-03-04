"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8">
          <h2 className="text-xl font-bold text-slate-200">Something went wrong</h2>
          <button
            onClick={reset}
            className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
