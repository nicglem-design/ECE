"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CHAIN_TO_COINGECKO } from "@/lib/coin-ids";
import { COINGECKO_IMAGE_URLS } from "@/lib/coin-images";

const imageCache: Record<string, string | null> = {};

interface TokenLogoProps {
  chainId: string;
  symbol?: string;
  size?: number;
  className?: string;
}

export function TokenLogo({ chainId, symbol, size = 32, className = "" }: TokenLogoProps) {
  const cgId = (CHAIN_TO_COINGECKO[chainId] ?? chainId).trim();
  const staticUrl = cgId ? COINGECKO_IMAGE_URLS[cgId] : null;
  const [src, setSrc] = useState<string | null>(staticUrl ?? (cgId ? imageCache[cgId] : null) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!cgId) return;
    if (staticUrl) {
      setSrc(staticUrl);
      return;
    }
    if (failed) return;
    if (imageCache[cgId] !== undefined) {
      setSrc(imageCache[cgId]);
      return;
    }
    const base = typeof window !== "undefined" ? window.location.origin : "";
    fetch(`${base}/api/coingecko/coin-image?coinId=${encodeURIComponent(cgId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const url = data?.image ?? null;
        imageCache[cgId] = url;
        setSrc(url);
      })
      .catch(() => {
        imageCache[cgId] = null;
        setFailed(true);
      });
  }, [cgId, failed, staticUrl]);

  if (src) {
    return (
      <Image
        src={src}
        alt={`${symbol ?? chainId} logo`}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        unoptimized={!src.includes("coingecko.com")}
        onError={() => {
          imageCache[cgId] = null;
          setSrc(null);
          setFailed(true);
        }}
      />
    );
  }

  const fallback = ((symbol ?? chainId) || "?").charAt(0).toUpperCase();
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-slate-700/80 text-xs font-medium text-slate-400 ${className}`}
      style={{ width: size, height: size }}
    >
      {fallback}
    </div>
  );
}
