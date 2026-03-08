"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function TermsPage() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-theme">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          {t("nav.backTo")}
        </Link>
        <h1 className="mt-8 text-3xl font-bold text-slate-200">
          {t("legal.termsTitle") || "Terms of Service"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("legal.lastUpdated") || "Last updated:"} {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>

        <div className="mt-10 space-y-8 text-slate-400">
          <section>
            <h2 className="text-lg font-semibold text-slate-200">1. Acceptance of Terms</h2>
            <p className="mt-2">
              By creating an account or using KanoXchange (the &quot;Service&quot;), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">2. Eligibility</h2>
            <p className="mt-2">
              You must be at least 18 years old to use the Service. By registering, you represent that you meet this requirement 
              and that you are not prohibited from using the Service under applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">3. Account and Security</h2>
            <p className="mt-2">
              You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us 
              immediately of any unauthorized access. We are not liable for losses resulting from unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">4. Crypto Assets and Risks</h2>
            <p className="mt-2">
              Cryptocurrency transactions involve significant risk. Prices can be highly volatile. You may lose some or all of 
              your investment. Past performance does not guarantee future results. Only invest what you can afford to lose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">5. Compliance</h2>
            <p className="mt-2">
              You agree to comply with all applicable laws and regulations in your jurisdiction. You are solely responsible for 
              determining whether your use of the Service is legal in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">6. Prohibited Use</h2>
            <p className="mt-2">
              You may not use the Service for illegal activities, money laundering, fraud, or any purpose that violates these terms. 
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">7. Changes</h2>
            <p className="mt-2">
              We may update these terms from time to time. We will notify users of material changes. Continued use of the Service 
              after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">8. Contact</h2>
            <p className="mt-2">
              For questions about these terms, please{" "}
              <Link href="/support" className="text-sky-400 hover:underline">contact our support team</Link>.
            </p>
          </section>
        </div>

        <p className="mt-12 text-xs text-slate-500">
          {t("legal.legalReview") || "These terms are provided as a template. Please have them reviewed by a qualified lawyer before launch."}
        </p>

        <Link href="/" className="mt-8 inline-block text-sky-400 hover:underline">
          {t("nav.backTo")}
        </Link>
      </div>
    </main>
  );
}
