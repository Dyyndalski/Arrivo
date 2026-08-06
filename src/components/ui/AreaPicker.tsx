import { useState } from "react";
import { CircleAlert, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { localizedName } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n";
import type { City, ServiceArea } from "@/types";

/**
 * City → districts, in two steps.
 *
 * A flat list stopped working at ten cities: four areas are named "Całe miasto", three cities
 * have a "Stare Miasto" and four a "Śródmieście" (phase-2 impl-review F1). Showing one city at a
 * time means the screen never holds more than 18 options and every label is unambiguous.
 *
 * THE SELECTION IS THE FULL ID SET, NOT THE VISIBLE SUBSET. Switching city changes only which
 * options are rendered; a specialist covering Warszawa and Kraków must not lose Warszawa by
 * looking at Kraków. Everything below reads and writes `selected` as a whole.
 *
 * `localizedName` is safe to call from an island — src/lib/i18n/dictionary.ts imports only the
 * Locale *type*, so no message catalog follows it into the bundle.
 */
export interface AreaPickerStrings {
  label: string;
  /**
   * Still a template containing `{count}` — the count changes as the user clicks, so it is the
   * one string the server cannot resolve ahead of time. Substituted below.
   */
  selectedCountTemplate: string;
  city: string;
  selectAll: string;
  clearAll: string;
}

interface Props {
  cities: City[];
  /** Pre-sorted by city then district order — see `getAreaDictionary`. */
  areas: ServiceArea[];
  /** `single` keeps at most one selection: picking a district replaces the previous one. */
  mode: "multi" | "single";
  selected: number[];
  onChange: (next: number[]) => void;
  /** Name for the hidden inputs the form posts — `area_ids` (multi) or `area_id` (single). */
  name: string;
  locale: Locale;
  strings: AreaPickerStrings;
  error?: string;
}

export function AreaPicker({ cities, areas, mode, selected, onChange, name, locale, strings, error }: Props) {
  // Open on the city the specialist already serves rather than the alphabetically-first one; a
  // returning user should see their own selection, not an empty Warszawa.
  // `.at(0)` rather than `[0]`: without `noUncheckedIndexedAccess` the index signature claims a
  // City is always there, which makes the fallback below unreachable as far as the type checker
  // is concerned — and an empty dictionary is a real state during a failed load.
  const initialCity = areas.find((area) => selected.includes(area.id))?.city_id ?? cities.at(0)?.id ?? null;
  const [activeCityId, setActiveCityId] = useState<number | null>(initialCity);

  const visible = areas.filter((area) => area.city_id === activeCityId);
  const allVisibleSelected = visible.length > 0 && visible.every((area) => selected.includes(area.id));

  function toggle(id: number) {
    if (mode === "single") {
      onChange(selected.includes(id) ? [] : [id]);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function toggleWholeCity() {
    const visibleIds = visible.map((area) => area.id);
    if (allVisibleSelected) {
      onChange(selected.filter((id) => !visibleIds.includes(id)));
    } else {
      onChange([...new Set([...selected, ...visibleIds])]);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-foreground text-sm font-semibold">{strings.label}</span>
        {mode === "multi" && (
          <span className="text-muted-foreground text-xs">
            {strings.selectedCountTemplate.replace("{count}", String(selected.length))}
          </span>
        )}
      </div>

      <div className="border-border bg-card rounded-md border p-3">
        <label htmlFor={`${name}-city`} className="text-muted-foreground mb-1 block text-xs font-semibold">
          {strings.city}
        </label>
        <select
          id={`${name}-city`}
          value={activeCityId ?? ""}
          onChange={(e) => {
            setActiveCityId(e.target.value ? Number(e.target.value) : null);
          }}
          className="border-border-strong bg-card text-foreground focus:ring-ring/40 mb-3 w-full rounded-sm border px-3 py-2 text-sm transition-colors focus:ring-[3px] focus:outline-none"
        >
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {localizedName(city, locale)}
            </option>
          ))}
        </select>

        {/* Whole-city coverage in two clicks. Pointless where the city IS one area. */}
        {mode === "multi" && visible.length > 1 && (
          <button
            type="button"
            onClick={toggleWholeCity}
            className="text-primary mb-2.5 cursor-pointer text-xs font-semibold hover:underline"
          >
            {allVisibleSelected ? strings.clearAll : strings.selectAll}
          </button>
        )}

        {/* Roles follow the mode, not the markup. In `multi` each district is an independent
            toggle; in `single` exactly one may be chosen, which is a radio group — announcing
            those as pressed/unpressed buttons hides the "one of these" rule from a screen reader
            (phase-4 impl-review F2). RoleToggle.tsx is the precedent in this codebase. */}
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          role={mode === "single" ? "radiogroup" : "group"}
          aria-label={strings.label}
        >
          {visible.map((area) => {
            const isSelected = selected.includes(area.id);
            return (
              <button
                key={area.id}
                type="button"
                role={mode === "single" ? "radio" : undefined}
                aria-checked={mode === "single" ? isSelected : undefined}
                aria-pressed={mode === "single" ? undefined : isSelected}
                onClick={() => {
                  toggle(area.id);
                }}
                className={cn(
                  "focus-visible:ring-ring/50 flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-2 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
                  isSelected
                    ? "border-primary bg-primary-soft text-primary-soft-text font-semibold"
                    : "border-border-strong bg-card text-ink-soft hover:border-foreground/30",
                )}
              >
                {isSelected ? (
                  <Check className="size-3.5 shrink-0" />
                ) : (
                  <MapPin className="text-muted-foreground size-3.5 shrink-0" />
                )}
                <span className="truncate">{localizedName(area, locale)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* One input per selection so the endpoint reads them with formData.getAll(). Rendered for
          the WHOLE selection, not just the visible city — otherwise switching city before submit
          would silently drop everything else. */}
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {error ? (
        <p className="text-danger mt-1.5 flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
