// Stub: /insights — deeper analytics (trends, cross-month comparison, projections).
// Wired up in a later change; the route exists today only so the TabBar
// link doesn't 404.
export default function InsightsPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center md:min-h-[70vh]">
      <h1 className="font-display text-3xl italic text-foreground md:text-5xl">Análisis</h1>
      <p className="max-w-sm text-base text-muted-foreground md:max-w-xl md:text-lg">
        Tendencias, comparaciones entre meses, proyecciones y reportes. En
        construcción.
      </p>
    </div>
  );
}
