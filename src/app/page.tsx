import { redirect } from "next/navigation";

// Pre-auth: el / redirige al preview del dashboard.
// Cuando aterrice Batch C (auth), esto pasa a redirigir a /login si no hay
// sesión, y a /capture si la hay (capture es el caso del 95% del uso).
export default function Home() {
  redirect("/dashboard");
}
