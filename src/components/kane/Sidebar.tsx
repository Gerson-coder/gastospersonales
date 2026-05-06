/**
 * Sidebar — desktop navigation rail for Kane.
 *
 * Fixed left rail rendered at `md+` breakpoints. Hidden on mobile,
 * where TabBar takes over.
 *
 * Defines its own nav items (SIDEBAR_NAV_ITEMS) independently of TabBar
 * so each surface can evolve without coupling.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import {
  Home,
  ArrowLeftRight,
  Tag,
  Clock,
  Target,
  Wallet,
  CalendarClock,
  BarChart2,
  Bot,
  Settings,
  Download,
  ChevronDown,
  Zap,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useUserName } from "@/lib/use-user-name";
import { KaneWordmark } from "@/components/kane/KaneWordmark";
import { UserAvatarCircle } from "@/components/kane/UserAvatarCircle";

// Chrome-only event interface (not in lib.dom yet).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface SidebarProps {
  className?: string;
}

type SidebarNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
    "aria-hidden"?: boolean | "true";
  }>;
  badge?: "new";
  comingSoon?: boolean;
};

const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { href: "/dashboard",  label: "Resumen",       icon: Home      },
  { href: "/movements",  label: "Movimientos",  icon: ArrowLeftRight },
  { href: "/categories", label: "Categorías",    icon: Tag       },
  { href: "/budgets",    label: "Presupuestos",  icon: Clock     },
  { href: "/goals",      label: "Metas",         icon: Target    },
  { href: "/accounts",   label: "Cuentas",       icon: Wallet    },
  { href: "/commitments", label: "Compromisos",   icon: CalendarClock, badge: "new" },
  { href: "/templates",  label: "Templates",     icon: Zap,      badge: "new" },
  { href: "/insights",   label: "Reportes",      icon: BarChart2 },
  { href: "/advisor",    label: "Asesor IA",     icon: Bot,      badge: "new" },
  { href: "/settings",   label: "Configuración", icon: Settings  },
];

function isItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function Sidebar({ className }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const { name, hydrated } = useUserName();

  // PWA install state
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true,
    );
    setIsIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window),
    );

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setDeferredPrompt(null);
    }
  };

  const showInstallCard = !standalone && (!!deferredPrompt || isIos);

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col",
        "fixed top-0 left-0 z-40 h-screen w-64",
        "border-r border-border bg-background",
        className,
      )}
    >
      {/* Brand area */}
      <div className="flex h-20 items-start gap-2.5 px-5 pt-5">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-lg"
          aria-hidden="true"
          priority
        />
        <span className="sr-only">Kane</span>
        <div className="flex flex-col gap-0.5">
          <span aria-hidden="true" className="inline-flex text-foreground">
            <KaneWordmark
              width={88}
              height={28}
              className="h-7 w-auto"
              decorative
            />
          </span>
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
            Controla tu dinero
          </p>
        </div>
      </div>

      <Separator />

      {/* Nav list */}
      <nav
        role="navigation"
        aria-label="Navegación lateral"
        className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
      >
        <ul className="flex flex-col gap-1">
          {SIDEBAR_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item.href);

            const sharedClasses = cn(
              "group relative flex min-h-10 w-full items-center gap-3 rounded-lg px-4 py-3",
              "text-sm font-semibold transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-muted text-foreground before:absolute before:left-0 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-primary before:content-['']"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            );

            const content = (
              <>
                <Icon
                  size={20}
                  strokeWidth={active ? 2.2 : 1.8}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                {item.badge === "new" && (
                  <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Nuevo
                  </span>
                )}
              </>
            );

            return (
              <li key={item.href}>
                {item.comingSoon ? (
                  <button
                    type="button"
                    onClick={() => toast.info("Próximamente")}
                    className={sharedClasses}
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={sharedClasses}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* PWA install card + footer */}
      <div className="border-t border-border">
        {showInstallCard && (
          <div className="mx-3 mt-3 rounded-2xl bg-[oklch(0.95_0.05_162)] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                <Download size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  Instala Kane
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Llévala contigo a donde quieras. Rápida, ligera y segura.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstall}
              className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Instalar ahora
              <Download size={13} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="px-3 py-4">
          <Link
            href="/settings"
            aria-current={
              isItemActive(pathname, "/settings") ? "page" : undefined
            }
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserAvatarCircle size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                {hydrated ? (name ?? "Sin nombre") : " "}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Plan gratuito
              </p>
            </div>
            <ChevronDown
              size={14}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
