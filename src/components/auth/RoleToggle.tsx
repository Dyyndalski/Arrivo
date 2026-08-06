import { UserRound, Scissors, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import type { AuthStrings } from "@/components/auth/strings";

/**
 * The mockups' `.role-grid` two-card picker (context/foundation/design/web/sign-up.html), not the
 * starter's pill toggle. The role decides which half of the product the account can use and
 * cannot be changed later (FR-001: single-role accounts), so it is deliberately the largest,
 * first thing on the sign-up screen.
 */
interface Props {
  value: UserRole | "";
  onChange: (role: UserRole) => void;
  error?: string;
  strings: AuthStrings;
}

export function RoleToggle({ value, onChange, error, strings }: Props) {
  const options = [
    {
      value: "client" as const,
      title: strings.roleClientTitle,
      description: strings.roleClientDescription,
      icon: UserRound,
    },
    {
      value: "specialist" as const,
      title: strings.roleSpecialistTitle,
      description: strings.roleSpecialistDescription,
      icon: Scissors,
    },
  ];

  return (
    <div>
      <span className="text-foreground mb-1.5 block text-sm font-semibold">{strings.roleLegend}</span>

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={strings.roleLegend}>
        {options.map(({ value: v, title, description, icon: Icon }) => {
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
                "focus-visible:ring-ring/50 flex cursor-pointer flex-col items-center gap-1.5 rounded-md border-[1.5px] px-3.5 py-4 text-center transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
                selected ? "border-primary bg-primary-soft" : "border-border-strong bg-card hover:border-foreground/30",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  selected ? "bg-primary text-white" : "bg-surface-alt text-ink-soft",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="text-foreground text-sm font-semibold">{title}</span>
              <span className="text-muted-foreground text-xs">{description}</span>
            </button>
          );
        })}
      </div>

      {/* Carries the selection into the POSTed form data; empty until a role is picked. */}
      <input type="hidden" name="role" value={value} />

      {error ? (
        <p className="text-danger mt-1.5 flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
