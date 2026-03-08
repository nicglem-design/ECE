"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiFetch } from "@/lib/apiClient";

export interface FiatBalance {
  currency: string;
  amount: number;
}

export interface LinkedAccount {
  id: string;
  type: "bank" | "card";
  label: string;
  last_four: string | null;
  currency: string | null;
}

export interface FiatTransaction {
  id: string;
  currency: string;
  type: "deposit" | "withdraw";
  amount: number;
  status: string;
  method?: string;
  destination?: string;
  createdAt: number;
}

export function useFiatBalances() {
  const [balances, setBalances] = useState<FiatBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ balances: FiatBalance[] }>("/api/v1/accounts/fiat");
      setBalances(data.balances || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load balances");
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, error, refetch: fetchBalances };
}

export function useLinkedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ accounts: LinkedAccount[] }>("/api/v1/accounts/linked");
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const addAccount = useCallback(
    async (type: "bank" | "card", label: string, lastFour?: string) => {
      const data = await apiPost<{ success: boolean; id: string }>("/api/v1/accounts/linked", {
        type,
        label,
        lastFour,
      });
      if (data.success) await fetchAccounts();
      return data;
    },
    [fetchAccounts]
  );

  const removeAccount = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/api/v1/accounts/linked/${id}`, { method: "DELETE" });
      if (res.ok) await fetchAccounts();
      return res.ok;
    },
    [fetchAccounts]
  );

  return { accounts, loading, error, refetch: fetchAccounts, addAccount, removeAccount };
}
