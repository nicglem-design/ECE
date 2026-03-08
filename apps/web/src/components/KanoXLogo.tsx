"use client";

import Link from "next/link";

interface KanoXLogoProps {
  /** Text to display (default: "KanoXchange") */
  label?: string;
  /** Color variant: sky (wallet) or amber (exchange) */
  variant?: "sky" | "amber";
  /** Size of the logo */
  size?: "sm" | "md" | "lg";
  /** If provided, wraps in a Link to home */
  href?: string;
  /** Use as span instead of link (e.g. for footer). When true, href is ignored. */
  asSpan?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { text: "text-base" },
  md: { text: "text-xl" },
  lg: { text: "text-2xl" },
};

export function KanoXLogo({
  label = "KanoXchange",
  variant = "sky",
  size = "md",
  href = "/",
  asSpan = false,
  className = "",
}: KanoXLogoProps) {
  const config = sizeConfig[size];
  const baseClass = `font-bold tracking-tight ${config.text}`;
  const skyClass = `${baseClass} text-sky-400`;
  const amberClass = `${baseClass} text-amber-400`;
  const wrapperClass = `flex items-center ${className}`;

  const xchangeIndex = label.indexOf("Xchange");
  const hasSplit = xchangeIndex > 0;
  const kanoPart = hasSplit ? label.slice(0, xchangeIndex) : "";
  const xchangePart = hasSplit ? label.slice(xchangeIndex) : label;

  if (asSpan) {
    return (
      <span className={wrapperClass}>
        {hasSplit ? (
          <>
            <span className={skyClass}>{kanoPart}</span>
            <span className={amberClass}>{xchangePart}</span>
          </>
        ) : (
          <span className={skyClass}>{label}</span>
        )}
      </span>
    );
  }

  return (
    <Link href={href} className={`group ${wrapperClass}`}>
      {hasSplit ? (
        <>
          <span className={`${skyClass} group-hover:text-sky-300`}>{kanoPart}</span>
          <span className={`${amberClass} group-hover:text-amber-300`}>{xchangePart}</span>
        </>
      ) : (
        <span className={`${skyClass} group-hover:text-sky-300`}>{label}</span>
      )}
    </Link>
  );
}
