"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/apiClient";

export interface Chain {
  id: string;
  name: string;
  symbol: string;
  type: string;
}

export interface Address {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
}

export interface Asset {
  chainId: string;
  symbol: string;
  name: string;
  amount: string;
}

export function useWalletChains() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ chains: Chain[] }>("/api/v1/wallet/chains")
      .then((data) => setChains(data.chains || []))
      .catch(() => setChains([]))
      .finally(() => setLoading(false));
  }, []);

  return { chains, loading };
}

export function useWalletAddresses() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ addresses: Address[] }>("/api/v1/wallet/addresses");
      setAddresses(data.addresses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load addresses");
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  return { addresses, loading, error, refetch: fetchAddresses };
}

export function useWalletBalances() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ assets: (Asset & { chain_id?: string })[] }>("/api/v1/wallet/balances");
      const raw = data.assets || [];
      setAssets(
        raw.map((a) => ({
          chainId: a.chainId ?? a.chain_id ?? "",
          symbol: a.symbol ?? "",
          name: a.name ?? "",
          amount: a.amount ?? "0",
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load balances");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { assets, loading, error, refetch: fetchBalances };
}

export interface Transaction {
  type: "sent" | "received";
  amount: string;
  from: string;
  to: string;
  txHash: string;
  timestamp: string;
}

export function useWalletTransactions(chainId: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [explorerTx, setExplorerTx] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!chainId) {
      setTransactions([]);
      setExplorerTx("");
      return;
    }
    setLoading(true);
    apiGet<{ transactions: Transaction[]; explorerTx: string }>(
      `/api/v1/wallet/transactions/${chainId}`
    )
      .then((data) => {
        setTransactions(data.transactions || []);
        setExplorerTx(data.explorerTx || "");
      })
      .catch(() => {
        setTransactions([]);
        setExplorerTx("");
      })
      .finally(() => setLoading(false));
  }, [chainId]);

  return { transactions, explorerTx, loading };
}
