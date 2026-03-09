"use client";

function getPasswordStrength(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very strong"];
  return { score, label: labels[score] };
}

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const { score, label } = getPasswordStrength(password);
  if (!password) return null;

  return (
    <div
      id="password-strength"
      role="status"
      aria-live="polite"
      className="mt-2"
    >
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition ${
              i <= score
                ? score <= 2
                  ? "bg-red-500"
                  : score <= 3
                    ? "bg-amber-500"
                    : "bg-green-500"
                : "bg-slate-700"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {label}
        {score < 3 && password.length >= 8 && (
          <span> – Add uppercase, numbers, or symbols for a stronger password</span>
        )}
      </p>
    </div>
  );
}
