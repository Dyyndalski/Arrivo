import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Mirrors the mockups' `input` rule plus `.input-icon-wrap` (the icon well is why pl-10 exists).
const inputBase =
  "w-full rounded-sm bg-card border px-3.5 py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-[3px] transition-colors";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-foreground mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={cn(
            inputBase,
            error ? "border-danger focus:ring-danger/30" : "border-border-strong focus:ring-ring/40",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p className="text-danger mt-1.5 flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
