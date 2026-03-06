"use client";

import { useState } from "react";
import { TokenLogo } from "@/components/TokenLogo";

/**
 * Displays a cryptocurrency logo with safe fallbacks.
 * Uses image URL from API when available, otherwise TokenLogo (fetches from CoinGecko).
 * Falls back to initial letter on error. Images sourced from CoinGecko API - see attribution.
 */
interface CoinLogoProps {
  image?: string | null;
  coinId: string;
  symbol?: string;
  size?: number;
  className?: string;
}

export function CoinLogo({ image, coinId, symbol, size = 32, className = "" }: CoinLogoProps) {
  const [imgError, setImgError] = useState(false);

  if (image && !imgError) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <TokenLogo
      chainId={coinId}
      symbol={symbol}
      size={size}
      className={className}
    />
  );
}
