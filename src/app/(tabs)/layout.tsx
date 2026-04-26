import { InstallPrompt } from "@/components/lumi/InstallPrompt";
import { Sidebar } from "@/components/lumi/Sidebar";
import { TabBar } from "@/components/lumi/TabBar";

// Layout for the tabbed app surface (post-login).
// Mobile (< md): bottom TabBar mounted; main reserves pb-24 for it.
// Desktop (md+): fixed left Sidebar; main reserves pl-64 + pb-8 instead.
// /login is intentionally OUTSIDE this group so it has neither.
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Sidebar />
      <main className="flex-1 pb-24 md:pb-8 md:pl-64">{children}</main>
      <TabBar />
      <InstallPrompt />
    </div>
  );
}
