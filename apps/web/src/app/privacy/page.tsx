"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-theme">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-sky-400 hover:underline">
          {t("nav.backTo")}
        </Link>
        <h1 className="mt-8 text-3xl font-bold text-slate-200">
          {t("legal.privacyTitle") || "Privacy Policy"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("legal.lastUpdated") || "Last updated:"} {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>

        <div className="mt-10 space-y-8 text-slate-400">
          <section>
            <h2 className="text-lg font-semibold text-slate-200">1. Information We Collect</h2>
            <p className="mt-2">
              We collect information you provide when registering (email, password, date of birth), identity verification data 
              through our KYC provider (Sumsub), wallet addresses and transaction data, and usage data (preferences, language, theme) 
              stored locally in your browser.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">2. How We Use Your Information</h2>
            <p className="mt-2">
              We use your information to provide and improve the Service, verify your identity for regulatory compliance, 
              communicate with you, prevent fraud, and comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">3. Third-Party Services</h2>
            <p className="mt-2">
              We use Sumsub for identity verification. Their processing of your data is governed by their privacy policy. 
              Price data may be fetched from external providers (e.g. CoinGecko, Binance). We do not share your personal data 
              with these providers for price feeds.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">4. Data Retention</h2>
            <p className="mt-2">
              We retain your account data for as long as your account is active. Identity verification data may be retained 
              as required by law. You may request deletion of your data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">5. Your Rights</h2>
            <p className="mt-2">
              Depending on your location, you may have the right to access, correct, delete, or port your personal data. 
              You may also have the right to object to or restrict certain processing. Contact us to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">6. Security</h2>
            <p className="mt-2">
              We implement appropriate technical and organizational measures to protect your personal data. However, no 
              method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">7. Cookies and Local Storage</h2>
            <p className="mt-2">
              We use local storage for essential functionality (authentication token, language, theme). This data stays on 
              your device. We do not use tracking cookies for advertising. If we add analytics, we will update this policy 
              and obtain consent where required.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-200">8. Contact</h2>
            <p className="mt-2">
              For privacy-related questions or to exercise your rights, please contact us through the channels provided on our website.
            </p>
          </section>
        </div>

        <p className="mt-12 text-xs text-slate-500">
          {t("legal.legalReview") || "This policy is provided as a template. Please have it reviewed by a qualified lawyer before launch."}
        </p>

        <Link href="/" className="mt-8 inline-block text-sky-400 hover:underline">
          {t("nav.backTo")}
        </Link>
      </div>
    </main>
  );
}
