import type { Metadata } from "next";
import "./globals.css";
import { ThemeInit } from "@/components/ThemeInit";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { AskKanoProvider } from "@/contexts/AskKanoContext";
import { AskKanoShell } from "@/components/AskKanoShell";
import { AuthProvider } from "@/contexts/AuthContext";
import { CookieConsent } from "@/components/CookieConsent";

export const metadata: Metadata = {
  metadataBase: new URL("https://kanoxchange.com"),
  title: "KanoXchange – Easy Crypto Exchange & Wallet",
  description:
    "Buy, sell, and trade crypto the easy way. KanoWallet and KanoExchange – built for everyone.",
  openGraph: { url: "https://kanoxchange.com" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("kanox_theme")||"dark";document.documentElement.setAttribute("data-theme",t);var l=localStorage.getItem("kanox_language");if(!l){var n=(navigator.language||"").split("-")[0].toLowerCase();var s=["en","sv","no","da","de","fr","es","it","pt","nl","pl","fi","cs","hu","ro","bg","hr","sk","sl","el","ru","uk","tr","ar","he","zh","ja","ko","th","vi","id","ms","hi","bn","ta","te","mr","gu","kn","ml","pa","fa","ur","sw","am","af","ca","eu","gl","et","lv","lt","sr","mk","sq","bs","mt","cy","ga","is"];l=s.indexOf(n)>=0?n:"en";localStorage.setItem("kanox_language",l)}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-950">
        <ThemeInit />
        <LanguageProvider>
          <AuthProvider>
            <CurrencyProvider>
              <TerminologyProvider>
                <AskKanoProvider>
                  <AskKanoShell />
                  {children}
                  <CookieConsent />
                </AskKanoProvider>
              </TerminologyProvider>
            </CurrencyProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
