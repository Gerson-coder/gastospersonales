import { TabBar } from "@/components/lumi/TabBar";

// Layout for the tabbed app surface (post-login).
// All routes under (tabs)/* render with the bottom TabBar mounted.
// /login is intentionally OUTSIDE this group so it has no bar.
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pb-24">{children}</main>
      <TabBar />
    </div>
  );
}
