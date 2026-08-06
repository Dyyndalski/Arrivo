import { CircleAlert, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { City, ServiceArea } from "@/types";

/**
 * Grouped by city. Interim shape — phase 4 replaces this with the two-step city → district
 * picker, which is what 67 areas actually need.
 *
 * The grouping itself is not cosmetic (phase-2 impl-review F1): four areas are named "Całe
 * miasto", three cities have a "Stare Miasto" and four have a "Śródmieście". A flat list of
 * names, which is what this rendered before the dictionary went multi-city, is unusable —
 * a specialist cannot tell which "Całe miasto" is Lublin.
 */
interface Props {
  cities: City[];
  areas: ServiceArea[];
  selected: number[];
  onToggle: (id: number) => void;
  error?: string;
}

export function AreaPicker({ cities, areas, selected, onToggle, error }: Props) {
  // `areas` arrives already ordered by city then district (getAreaDictionary); this only splits
  // it, so a city with no areas renders nothing rather than an empty heading.
  const byCity = cities
    .map((city) => ({ city, cityAreas: areas.filter((area) => area.city_id === city.id) }))
    .filter((group) => group.cityAreas.length > 0);

  return (
    <div>
      <label className="mb-1 block text-sm text-blue-100/80">
        Districts you travel to
        <span className="ml-2 text-xs text-blue-100/50">{selected.length} selected</span>
      </label>

      <div className="space-y-4" role="group" aria-label="Service areas">
        {byCity.map(({ city, cityAreas }) => (
          <div key={city.id}>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-blue-100/50 uppercase">{city.name}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cityAreas.map((area) => {
                const isSelected = selected.includes(area.id);
                return (
                  <button
                    key={area.id}
                    type="button"
                    aria-pressed={isSelected}
                    // The visible label repeats across cities, so the accessible name carries the
                    // city too — otherwise a screen reader announces "Całe miasto" four times.
                    aria-label={`${area.name}, ${city.name}`}
                    onClick={() => {
                      onToggle(area.id);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none",
                      isSelected
                        ? "border-purple-400 bg-purple-500/20 text-white"
                        : "border-white/20 bg-white/10 text-blue-100/70 hover:border-white/40",
                    )}
                  >
                    <MapPin className={cn("size-3.5 shrink-0", isSelected ? "text-purple-300" : "text-white/30")} />
                    <span className="truncate">{area.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* One input per selection so the endpoint reads them with formData.getAll("area_ids"). */}
      {selected.map((id) => (
        <input key={id} type="hidden" name="area_ids" value={id} />
      ))}

      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
