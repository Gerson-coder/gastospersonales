import { redirect } from "next/navigation";

import { InstallPrompt } from "@/components/kane/InstallPrompt";
import { OfflineIndicator } from "@/components/kane/OfflineIndicator";
import { Sidebar } from "@/components/kane/Sidebar";
import { TabBarSlot } from "@/components/kane/TabBarSlot";
import { TabsTopBar } from "@/components/kane/TabsTopBar";
import { createClient } from "@/lib/supabase/server";

// Layout for the tabbed app surface (post-login).
// Mobile (< md): bottom TabBar mounted; main reserves pb-24 for it.
// Desktop (md+): fixed left Sidebar; main reserves pl-64 + pb-8 instead.
// TabsTopBar (Ajustes / Tema / Perfil) lives here so the cluster persists
// across tab navigations instead of flickering on every page mount.
// TabBarSlot hides the bar on routes that own their bottom UI (e.g.
// /receipt's sticky CTAs). /login is intentionally OUTSIDE this group
// so it has neither.
//
// Server-side guard: middleware already redirects anonymous users out, but
// it can't tell whether the authenticated user has finished onboarding —
// only that `auth.users.id` exists. Without this layer, a user who signed
// up but never set their display_name (or whose JWT slipped past the
// middleware validation as a ghost) renders an empty dashboard. We refetch
// the user + profile here and bounce to /welcome on incomplete state.
export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No envs in dev/build → middleware already short-circuits. Mirror that
  // here so `next build` without `.env.local` still produces a valid layout.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="flex min-h-screen flex-col">
        <OfflineIndicator />
        <Sidebar />
        <TabsTopBar />
        <main className="flex-1 pb-24 md:pb-8 md:pl-64">{children}</main>
        <TabBarSlot />
        <InstallPrompt />
      </div>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email_verified_at")
    .eq("id", user.id)
    .maybeSingle();

  // Email-verification gate (defense-in-depth — middleware also blocks
  // this, but layouts double-check in case a request slips past
  // middleware via cache, BFCache snapshot, or a future routing change).
  if (!profile || !profile.email_verified_at) {
    redirect("/auth/verify-email?purpose=email_verification");
  }

  if (!profile.display_name) {
    redirect("/welcome");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineIndicator />
      <Sidebar />
      <TabsTopBar />
      <main className="flex-1 pb-24 md:pb-8 md:pl-64">{children}</main>
      <TabBarSlot />
      <InstallPrompt />
    </div>
  );
}
