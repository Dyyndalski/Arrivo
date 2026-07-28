import { UserRound, Scissors, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface Props {
  value: UserRole | "";
  onChange: (role: UserRole) => void;
  error?: string;
}

const OPTIONS: { value: UserRole; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: "client", label: "Client", hint: "Book home visits", icon: UserRound },
  { value: "specialist", label: "Specialist", hint: "Offer services", icon: Scissors },
];

export function RoleToggle({ value, onChange, error }: Props) {
  return (
    <div>
      <label className="mb-1 block text-sm text-blue-100/80">Sign up as</label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account role">
        {OPTIONS.map(({ value: v, label, hint, icon: Icon }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onChange(v);
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400",
                selected
                  ? "border-purple-400 bg-purple-500/20 text-white"
                  : "border-white/20 bg-white/10 text-blue-100/70 hover:border-white/40",
              )}
            >
              <Icon className="size-5" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-blue-100/50">{hint}</span>
            </button>
          );
        })}
      </div>
      {/* Carries the selection into the POSTed form data; empty until a role is picked. */}
      <input type="hidden" name="role" value={value} />
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
