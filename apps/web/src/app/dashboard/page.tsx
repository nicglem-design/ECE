"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import { CustomizableDashboard } from "@/components/CustomizableDashboard";

export default function DashboardPage() {
  const { t } = useLanguage();

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-theme">
        <WalletNav />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("dashboard.welcome")}</h1>
          <div className="mt-8">
            <CustomizableDashboard />
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
