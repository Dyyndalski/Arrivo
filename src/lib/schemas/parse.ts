import type { z } from "zod";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Parse an already-shaped object through a schema and collapse any failure to a single
 * user-facing message.
 *
 * The endpoints in this project redirect with `?error=<message>` rather than rendering a
 * field-level error map, so only the first issue is ever displayed. Returning one string
 * keeps every handler's failure path identical.
 */
export function parseOrError<T extends z.ZodType>(schema: T, input: unknown): ParseResult<z.infer<T>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  // A failed ZodError always carries at least one issue, so this index is safe.
  return { ok: false, error: result.error.issues[0].message };
}
