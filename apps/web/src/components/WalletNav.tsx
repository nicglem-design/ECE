"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { KanoXLogo } from "./KanoXLogo";
import { useAuth } from "@/contexts/AuthContext";
import { TerminologyToggle } from "./TerminologyToggle";
import { AskKanoButton } from "./AskKanoButton";

export function WalletNav() {
  const { t } = useLanguage();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const isWallet = pathname === "/wallet" || pathname.startsWith("/wallet/") || pathname === "/dashboard";
  const isAccounts = pathname === "/accounts";

  return (
    <header className="border-b border-slate-800/50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <KanoXLogo label={t("nav.kanox")} variant="sky" size="md" />
        <div className="flex items-center gap-4">
          <Link
            href="/wallet"
            className={`text-sm ${isWallet ? "text-sky-400" : "text-slate-400 hover:text-sky-400"}`}
          >
            {t("nav.wallet")}
          </Link>
          <Link href="/wallet/portfolio" className="text-sm text-slate-400 hover:text-sky-400">
            {t("nav.portfolio")}
          </Link>
          <Link
            href="/accounts"
            className={`text-sm ${isAccounts ? "text-green-400" : "text-slate-400 hover:text-sky-400"}`}
          >
            Accounts
          </Link>
          <Link href="/exchange" className="text-sm text-slate-400 hover:text-sky-400">
            {t("nav.exchange")}
          </Link>
          <Link href="/profile" className="text-sm text-slate-400 hover:text-sky-400">
            {t("nav.profile")}
          </Link>
          <TerminologyToggle />
          <AskKanoButton />
          {isAuthenticated ? (
            <button
              onClick={() => { logout(); router.refresh(); }}
              className="text-sm text-slate-400 hover:text-sky-400"
            >
              {t("nav.logout")}
            </button>
          ) : (
            <Link href="/login" className="text-sm text-slate-400 hover:text-sky-400">
              {t("nav.login")}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
