// Stub: /insights — deeper analytics (trends, cross-month comparison, projections).
// Wired up in a later change; the route exists today only so the TabBar
// link doesn't 404.
export default function InsightsPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-3xl italic text-foreground">Análisis</h1>
      <p className="max-w-sm text-muted-foreground">
        Tendencias, comparaciones entre meses, proyecciones y reportes. En
        construcción.
      </p>
    </div>
  );
}
