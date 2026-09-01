import { Eye, EyeOff } from "lucide-react";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
  /** Resolved by the page — islands never import the message catalogs. */
  showLabel: string;
  hideLabel: string;
}

/**
 * The icon is 16px, which is a 16px touch target — below the 24px WCAG 2.2 minimum and far below
 * the 44px comfortable size. The hit area is widened by a transparent `::before` rather than by
 * padding, so the eye stays exactly where the input's right padding puts it: padding would move
 * the glyph, and the field was laid out around its current position.
 *
 * `-inset-3.5` is 14px on every side: 16 + 28 = 44px square. The button is already `absolute`, so
 * it is its own containing block and the pseudo-element needs no extra `relative`.
 */
export function PasswordToggle({ visible, onToggle, showLabel, hideLabel }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className='text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-colors before:absolute before:-inset-3.5 before:content-[""]'
      aria-label={visible ? hideLabel : showLabel}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
