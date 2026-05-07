import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del segment /movements — render inmediato al cambiar de tab.
// Reproduce el layout: header + chips de filtro + lista de filas.
export default function MovementsLoading() {
  return (
    <div className="space-y-4 px-4 pt-4 md:px-8 md:pt-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0"
          >
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
