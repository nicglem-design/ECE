"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

const TUTORIAL_KEY = "kanox_tutorial_completed";
const PADDLE_DURATION_MS = 800;

const STEPS: { target?: string; title: string; text: string }[] = [
  { title: "Welcome!", text: "Welcome to KanoXchange! Let's take a quick tour of the main features." },
  { target: "tutorial-wallet", title: "KanoWallet", text: "Your crypto lives here. Check balances, send, and receive coins." },
  { target: "tutorial-portfolio", title: "Portfolio", text: "See all your holdings in one place. Track how your investments are doing." },
  { target: "tutorial-accounts", title: "Accounts", text: "Deposit and withdraw real money. Add funds to buy crypto." },
  { target: "tutorial-exchange", title: "KanoExchange", text: "Swap one crypto for another. Buy and sell at live market prices." },
  { target: "tutorial-profile", title: "Profile", text: "Your settings, theme, and security. Customize your experience." },
  { target: "tutorial-ask-kano", title: "Ask Kano", text: "Get help from our AI assistant anytime. Ask questions in plain words." },
  { title: "You're all set!", text: "Explore at your own pace. You can always find help in the app." },
];

function CanoeSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 50" className={className} aria-hidden>
      <defs>
        <linearGradient id="hull-amber" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="hull-inner-amber" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <filter id="canoe-shadow" x="-30%" y="-20%" width="160%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      {/* Hull - bird's eye ellipse shape */}
      <ellipse cx="70" cy="26" rx="55" ry="14" fill="url(#hull-amber)" stroke="#d97706" strokeWidth="1.5" filter="url(#canoe-shadow)" />
      <path
        d="M18 26 Q70 10 122 26 Q70 42 18 26"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
      <ellipse cx="70" cy="26" rx="48" ry="11" fill="url(#hull-inner-amber)" stroke="#b45309" strokeWidth="1" opacity="0.9" />
      {/* Seats / thwarts */}
      {[
        { x: 35, w: 8, y1: 22, y2: 30 },
        { x: 70, w: 10, y1: 20, y2: 32 },
        { x: 105, w: 8, y1: 22, y2: 30 },
      ].map((seat, i) => (
        <g key={i}>
          <rect x={seat.x - seat.w / 2} y={seat.y1} width={seat.w} height={seat.y2 - seat.y1} rx="1.5" fill="#92400e" stroke="#78350f" strokeWidth="0.8" />
          <rect x={seat.x - seat.w / 2 + 1} y={seat.y1 + 1} width={seat.w - 2} height={2} rx="0.5" fill="#b45309" opacity="0.6" />
        </g>
      ))}
      {/* Paddle laid across the canoe */}
      <g transform="translate(55, 22) rotate(-15)">
        <line x1="0" y1="0" x2="50" y2="0" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="48" cy="0" rx="8" ry="5" fill="#b45309" stroke="#92400e" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

const CANOE_WIDTH = 120; // px - smaller
const CANOE_HALF = CANOE_WIDTH / 2;
const CANOE_HEIGHT = 44;
const CANOE_BELOW_GAP = 20;
// Bird's eye view, slightly from the side
const BIRD_VIEW_ROTATE_X = -12; // looking down from above
const BIRD_VIEW_ROTATE_Y = 10; // a little more on the side

export function TutorialOverlay() {
  const { isAuthenticated, isLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCompleted = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TUTORIAL_KEY, "1");
      setVisible(false);
    }
  }, []);

  // Reset tutorial via ?reset-tutorial=1 in URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset-tutorial") === "1") {
      localStorage.removeItem(TUTORIAL_KEY);
      params.delete("reset-tutorial");
      const url = params.toString()
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      window.history.replaceState({}, "", url);
      setVisible(true); // Show immediately after reset
    }
  }, []);

  // Show tutorial: when authenticated + not completed, or when ?show-tutorial=1 (for testing)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const forceShow = new URLSearchParams(window.location.search).get("show-tutorial") === "1";
    if (forceShow) {
      setVisible(true);
      return;
    }
    if (isLoading || !isAuthenticated) return;
    if (localStorage.getItem(TUTORIAL_KEY) === "1") return;
    setVisible(true);
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!visible) return;
    const s = STEPS[step];
    if (s?.target) {
      const el = document.querySelector(`[data-tutorial="${s.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  }, [visible, step]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const next = () => {
    if (step >= STEPS.length - 1) {
      markCompleted();
      return;
    }
    setIsTransitioning(true);
    setStep((s) => s + 1);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsTransitioning(false);
      timeoutRef.current = null;
    }, PADDLE_DURATION_MS);
  };

  const skip = () => markCompleted();

  if (!visible) return null;

  const current = STEPS[step];

  // Canoe position (center X)
  const canoeCenterX = targetRect
    ? targetRect.left + targetRect.width / 2
    : step === 0
      ? 60 + CANOE_HALF
      : typeof window !== "undefined"
        ? window.innerWidth / 2
        : 600;
  const canoePosition = targetRect
    ? { top: targetRect.bottom + CANOE_BELOW_GAP }
    : { bottom: 24 };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto">
      {/* Very light overlay - no blur, site stays visible so user sees features */}
      <div
        className="absolute inset-0 bg-black/10"
        onClick={skip}
        aria-hidden
      />

      {/* Highlight ring around target - visible without heavy overlay */}
      {targetRect && (
        <div
          className="absolute rounded-lg ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900/50 pointer-events-none transition-all duration-300 shadow-[0_0_0_4px_rgba(56,189,248,0.3)]"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Canoe - bird's eye, slightly from the side */}
      <div
        className="absolute transition-all duration-[800ms] ease-out"
        style={{
          left: canoeCenterX,
          ...canoePosition,
          width: CANOE_WIDTH,
          height: CANOE_HEIGHT,
        }}
      >
        <div
          className="animate-bounce-slow w-full h-full origin-center"
          style={{
            transform: `translateX(-50%) perspective(400px) rotateX(${BIRD_VIEW_ROTATE_X}deg) rotateY(${BIRD_VIEW_ROTATE_Y}deg)`,
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
          }}
        >
          <CanoeSvg className="w-full h-full" />
        </div>
      </div>

      {/* Text bubble - only when canoe is stopped */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-full max-w-sm px-6 transition-all duration-300 ${
          isTransitioning ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{
          top: targetRect ? targetRect.bottom + 24 : "45%",
        }}
      >
        <div className="rounded-2xl border border-slate-600 bg-slate-800/95 px-6 py-5 shadow-2xl">
          <p className="font-semibold text-slate-200 text-lg">{current.title}</p>
          <p className="mt-2 text-slate-300 text-sm leading-relaxed">{current.text}</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={skip}
              className="text-sm text-slate-500 hover:text-slate-400 transition"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600 transition"
            >
              {step >= STEPS.length - 1 ? "Got it!" : "Next"}
            </button>
          </div>
          <div className="mt-3 flex justify-center gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-4 bg-sky-500" : "w-1.5 bg-slate-600"
                }`}
                aria-hidden
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
