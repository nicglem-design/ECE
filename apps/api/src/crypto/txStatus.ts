/**
 * Fetch transaction confirmation status from block explorers.
 */

const EXPLORER_APIS: Record<string, { url: string; key?: string }> = {
  ethereum: { url: "https://api.etherscan.io/api", key: process.env.ETHERSCAN_API_KEY },
  binancecoin: { url: "https://api.bscscan.com/api", key: process.env.ETHERSCAN_API_KEY },
  "matic-network": { url: "https://api.polygonscan.com/api", key: process.env.ETHERSCAN_API_KEY },
  "avalanche-2": { url: "https://api.snowtrace.io/api", key: process.env.ETHERSCAN_API_KEY },
};

export interface TxStatus {
  status: "pending" | "confirmed" | "failed" | "unknown";
  confirmations?: number;
  blockNumber?: number;
  error?: string;
}

export async function getTxStatus(chainId: string, txHash: string): Promise<TxStatus> {
  const hash = txHash.trim();
  if (!hash) return { status: "unknown", error: "Missing tx hash" };

  if (EXPLORER_APIS[chainId]) {
    const { url, key } = EXPLORER_APIS[chainId];
    const apiKey = key || process.env.ETHEREUM_ETHERSCAN_API_KEY || "";
    const res = await fetch(
      `${url}?module=proxy&action=eth_getTransactionByHash&txhash=${hash}${apiKey ? `&apikey=${apiKey}` : ""}`
    );
    if (!res.ok) return { status: "unknown", error: "Explorer request failed" };
    const data = (await res.json()) as { result?: { blockNumber: string | null; hash: string } };
    const tx = data.result;
    if (!tx || !tx.hash) return { status: "pending" };
    if (tx.blockNumber) {
      const blockNum = parseInt(tx.blockNumber, 16);
      return { status: "confirmed", confirmations: 1, blockNumber: blockNum };
    }
    return { status: "pending" };
  }

  if (chainId === "bitcoin") {
    const api = process.env.BITCOIN_API_URL || "https://mempool.space/api";
    const res = await fetch(`${api}/tx/${hash}`);
    if (!res.ok) return { status: "unknown", error: "Explorer request failed" };
    const data = (await res.json()) as { status?: { confirmed: boolean }; block_height?: number };
    if (data.status?.confirmed) {
      return { status: "confirmed", confirmations: 6, blockNumber: data.block_height };
    }
    return { status: "pending" };
  }

  if (chainId === "litecoin") {
    const api = process.env.LITECOIN_API_URL || "https://blockstream.info/litecoin/api";
    const res = await fetch(`${api}/tx/${hash}`);
    if (!res.ok) return { status: "unknown", error: "Explorer request failed" };
    const data = (await res.json()) as { status?: { confirmed: boolean }; block_height?: number };
    if (data.status?.confirmed) {
      return { status: "confirmed", confirmations: 6, blockNumber: data.block_height };
    }
    return { status: "pending" };
  }

  if (chainId === "dogecoin") {
    const api = process.env.DOGECOIN_API_URL || "https://api.blockcypher.com/v1/doge/main";
    const res = await fetch(`${api}/txs/${hash}`);
    if (!res.ok) return { status: "unknown", error: "Explorer request failed" };
    const data = (await res.json()) as { confirmations?: number; block_height?: number };
    if ((data.confirmations ?? 0) > 0) {
      return { status: "confirmed", confirmations: data.confirmations, blockNumber: data.block_height };
    }
    return { status: "pending" };
  }

  if (chainId === "solana") {
    const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[hash]],
      }),
    });
    if (!res.ok) return { status: "unknown", error: "RPC request failed" };
    const data = (await res.json()) as { result?: { value?: { confirmationStatus?: string }[] } };
    const status = data.result?.value?.[0];
    if (status?.confirmationStatus === "finalized" || status?.confirmationStatus === "confirmed") {
      return { status: "confirmed", confirmations: 1 };
    }
    if (status) return { status: "pending" };
    return { status: "unknown", error: "Transaction not found" };
  }

  return { status: "unknown", error: "Unsupported chain" };
}
