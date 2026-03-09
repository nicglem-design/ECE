"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";

interface BraintreePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function BraintreePaymentModal({
  isOpen,
  onClose,
  amount,
  currency,
  onSuccess,
  onError,
}: BraintreePaymentModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropinRef = useRef<{ requestPaymentMethod: (cb: (err: unknown, payload?: { nonce: string }) => void) => void; clearSelectedPaymentMethod?: () => void } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropinReady, setDropinReady] = useState(false);

  useEffect(() => {
    if (!isOpen || !containerRef.current || amount <= 0) return;

    let mounted = true;
    const initDropin = async () => {
      try {
        const { clientToken } = await apiGet<{ clientToken: string }>("/api/v1/accounts/checkout-client-token");
        const dropin = await import("braintree-web-drop-in");
        const opts: Record<string, unknown> = {
          authorization: clientToken,
          container: containerRef.current!,
          card: { cardholderName: { required: false } },
          applePay: { displayName: "ECE", paymentRequest: { total: { label: "Deposit", amount: amount.toFixed(2) } } },
        };
        const gpayMerchantId = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID;
        if (gpayMerchantId) {
          opts.googlePay = {
            merchantId: gpayMerchantId,
            googlePayVersion: 2,
            transactionInfo: { currencyCode: currency, totalPriceStatus: "ESTIMATED" as const, totalPrice: amount.toFixed(2) },
          };
        }
        const instance = await dropin.create(opts);
        if (mounted) {
          dropinRef.current = instance;
          setDropinReady(true);
        } else {
          instance.clearSelectedPaymentMethod?.();
        }
      } catch (err) {
        if (mounted) onError(err instanceof Error ? err.message : "Failed to load payment form");
      }
    };

    initDropin();
    return () => {
      mounted = false;
      const instance = dropinRef.current as { teardown?: () => Promise<void> } | null;
      if (instance?.teardown) {
        instance.teardown().catch(() => {});
      }
      dropinRef.current = null;
      setDropinReady(false);
    };
  }, [isOpen, amount, onError]);

  const handleSubmit = async () => {
    if (!dropinRef.current || loading) return;
    setLoading(true);
    try {
      dropinRef.current.requestPaymentMethod(async (err, payload) => {
        if (err) {
          setLoading(false);
          onError(err instanceof Error ? err.message : "Payment method error");
          return;
        }
        if (!payload?.nonce) {
          setLoading(false);
          onError("No payment method received");
          return;
        }
        try {
          await apiPost<{ success: boolean }>("/api/v1/accounts/checkout-charge", {
            paymentMethodNonce: payload.nonce,
            currency,
            amount,
          });
          onSuccess();
          onClose();
        } catch (e) {
          onError(e instanceof Error ? e.message : "Payment failed");
          (dropinRef.current as { clearSelectedPaymentMethod?: () => void })?.clearSelectedPaymentMethod?.();
        } finally {
          setLoading(false);
        }
      });
    } catch (e) {
      setLoading(false);
      onError(e instanceof Error ? e.message : "Payment failed");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-200">
            Pay {amount.toFixed(2)} {currency}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div ref={containerRef} className="min-h-[200px] mt-4" />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-600 py-2 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !dropinReady}
            className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Pay"}
          </button>
        </div>
      </div>
    </div>
  );
}
