// Stub: /movements — list of all transactions with filters.
// Wired up in a later change; the route exists today only so the TabBar
// link doesn't 404.
export default function MovementsPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center md:min-h-[70vh]">
      <h1 className="font-display text-3xl italic text-foreground md:text-5xl">Movimientos</h1>
      <p className="max-w-sm text-base text-muted-foreground md:max-w-xl md:text-lg">
        Acá van a vivir todos tus gastos e ingresos con filtros, búsqueda y agrupado por
        día. En construcción.
      </p>
    </div>
  );
}
