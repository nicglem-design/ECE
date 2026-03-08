"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { WalletNav } from "@/components/WalletNav";
import { apiPost } from "@/lib/apiClient";

export default function SupportPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!subject.trim() || !message.trim()) {
      setError("Please fill in both subject and message.");
      return;
    }
    if (!isAuthenticated && !email.trim()) {
      setError("Please enter your email so we can reply.");
      return;
    }
    if (!isAuthenticated && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const body: { subject: string; message: string; email?: string } = {
        subject: subject.trim(),
        message: message.trim(),
      };
      if (!isAuthenticated) body.email = email.trim();
      await apiPost<{ success: boolean; message?: string }>("/api/v1/support/contact", body);
      setSuccess(true);
      setSubject("");
      setMessage("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-theme">
      <WalletNav />
        <div className="mx-auto max-w-xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">Contact support</h1>
          <p className="mt-2 text-slate-400">
            Have a question or need help? Send us a message and we&apos;ll get back to you as soon as possible.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {!isAuthenticated && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-400">
                  Your email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required={!isAuthenticated}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-slate-400">
                Subject
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Issue with withdrawal"
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-slate-400">
                Message
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue or question..."
                rows={6}
                maxLength={5000}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">{message.length}/5000 characters</p>
            </div>
            {success && (
              <div className="rounded-lg border border-green-800/50 bg-green-900/20 px-4 py-2 text-sm text-green-400">
                Your message has been sent. We&apos;ll get back to you soon.
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !subject.trim() || !message.trim()}
              className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send message"}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-600 bg-slate-800/40 p-4">
            <h2 className="text-lg font-semibold text-slate-200">Other resources</h2>
            <ul className="mt-2 space-y-2 text-sm text-slate-400">
              <li>
                <Link href="/terms" className="text-sky-400 hover:underline">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sky-400 hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/accounts" className="text-sky-400 hover:underline">
                  Accounts & deposits
                </Link>
              </li>
            </ul>
          </div>

          <Link href="/" className="mt-6 inline-block text-sky-400 hover:underline">
            ← Back to home
          </Link>
        </div>
      </main>
  );
}
