import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  /** Already translated. The page resolves `?error=<key>` through `tUnknown()` before passing it. */
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p role="alert" className="bg-danger-soft text-danger flex items-center gap-2 rounded-sm px-3.5 py-2.5 text-sm">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
