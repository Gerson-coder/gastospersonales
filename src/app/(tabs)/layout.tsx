import { InstallPrompt } from "@/components/lumi/InstallPrompt";
import { Sidebar } from "@/components/lumi/Sidebar";
import { TabBarSlot } from "@/components/lumi/TabBarSlot";
import { TabsTopBar } from "@/components/lumi/TabsTopBar";

// Layout for the tabbed app surface (post-login).
// Mobile (< md): bottom TabBar mounted; main reserves pb-24 for it.
// Desktop (md+): fixed left Sidebar; main reserves pl-64 + pb-8 instead.
// TabsTopBar (Ajustes / Tema / Perfil) lives here so the cluster persists
// across tab navigations instead of flickering on every page mount.
// TabBarSlot hides the bar on routes that own their bottom UI (e.g.
// /receipt's sticky CTAs). /login is intentionally OUTSIDE this group
// so it has neither.
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Sidebar />
      <TabsTopBar />
      <main className="flex-1 pb-24 md:pb-8 md:pl-64">{children}</main>
      <TabBarSlot />
      <InstallPrompt />
    </div>
  );
}
