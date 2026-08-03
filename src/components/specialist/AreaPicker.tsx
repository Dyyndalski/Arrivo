import { CircleAlert, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceArea } from "@/types";

interface Props {
  areas: ServiceArea[];
  selected: number[];
  onToggle: (id: number) => void;
  error?: string;
}

export function AreaPicker({ areas, selected, onToggle, error }: Props) {
  return (
    <div>
      <label className="mb-1 block text-sm text-blue-100/80">
        Districts you travel to
        <span className="ml-2 text-xs text-blue-100/50">{selected.length} selected</span>
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Service areas">
        {areas.map((area) => {
          const isSelected = selected.includes(area.id);
          return (
            <button
              key={area.id}
              type="button"
              aria-pressed={isSelected}
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
