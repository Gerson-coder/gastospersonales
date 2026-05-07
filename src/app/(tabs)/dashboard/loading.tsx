import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Server-rendered skeleton mostrado mientras el segment del dashboard
// hidrata del lado cliente. Antes el TabBar quedaba con la pantalla
// del tab anterior congelada hasta que el dashboard montara, lo que
// se sentia como "lag" al cambiar de tab. Ahora App Router muestra
// este placeholder INSTANTANEO al navegar.
export default function DashboardLoading() {
  return (
    <div className="space-y-4 px-4 pt-4 md:px-8 md:pt-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>

      <Card className="rounded-2xl border-border p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-12 w-56 md:h-14 md:w-72" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="mx-auto my-6 h-px w-full max-w-xs bg-border md:my-8" />
        <div className="grid grid-cols-2 gap-2 md:gap-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex min-h-[64px] flex-col gap-2 rounded-xl px-3.5 py-3"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </Card>

      <div className="rounded-2xl border border-border bg-card p-4">
        <Skeleton className="mb-4 h-4 w-48" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
