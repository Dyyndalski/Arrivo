/**
 * Initials for the avatar placeholder. v1 has no uploaded photos, so this is what every avatar
 * in the app renders.
 *
 * Uses `Array.from` rather than indexing, because a string index returns a UTF-16 code unit and
 * would split an astral character in half. Uppercasing is locale-independent here on purpose:
 * the Turkish dotless-i rule would surprise a Polish user more than it would help anyone.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) return "?";

  const letters = words.slice(0, 2).map((word) => Array.from(word)[0]);
  return letters.join("").toUpperCase();
}
