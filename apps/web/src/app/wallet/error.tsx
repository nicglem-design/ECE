"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Wallet error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
      <h1 className="text-xl font-semibold text-slate-200">Wallet error</h1>
      <p className="mt-2 max-w-md text-center text-sm text-slate-500">{error.message}</p>
      <div className="mt-6 flex gap-4">
        <button
          onClick={reset}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Try again
        </button>
        <Link
          href="/wallet"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
        >
          Back to wallet
        </Link>
      </div>
    </div>
  );
}
