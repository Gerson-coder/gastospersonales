import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del segment /insights — los charts hand-rolled SVG son
// pesados de hidratar; este placeholder evita un flash de pantalla en
// blanco al entrar.
export default function InsightsLoading() {
  return (
    <div className="space-y-4 px-4 pt-4 md:px-8 md:pt-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>

      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 flex-1 rounded-full" />
        ))}
      </div>

      <Card className="rounded-2xl border-border p-6 md:p-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-12 w-56" />
        <Skeleton className="mt-2 h-4 w-24 rounded-full" />
      </Card>

      <Card className="rounded-2xl border-border p-4">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </Card>

      <Card className="rounded-2xl border-border p-4">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
