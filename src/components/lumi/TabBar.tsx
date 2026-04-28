/**
 * TabBar — bottom navigation for Lumi.
 *
 * Mobile-first fixed bottom bar mirroring the Lumi UI-kit:
 *   [ Inicio ] [ Movs ]  ((+))  [ Análisis ] [ Cuentas ]
 *
 * The center "Capturar" tab is visually elevated (FAB cutout) and
 * pushed slightly above the bar surface, matching the design system
 * preview in `Lumi Design System/ui_kits/lumi-app/TabBar.jsx`.
 *
 * This is a SHARED layout component — it does NOT decide where to
 * mount itself. The layout that renders it is responsible for hiding
 * it on routes where it shouldn't appear (e.g. /login).
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  List,
  Plus,
  Check,
  BarChart3,
  Menu,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  captureActionBus,
  useCaptureCanSave,
} from "@/lib/capture-action-bus";

export type TabBarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, this tab renders as the elevated center FAB. */
  primary?: boolean;
  /** Optional unread/notification count rendered as a small badge. */
  badge?: number;
};

export interface TabBarProps {
  items?: TabBarItem[];
  className?: string;
}

// Default Lumi tab structure — order matches the source TabBar.jsx + index.html.
export const DEFAULT_ITEMS: TabBarItem[] = [
  { href: "/dashboard",   label: "Resumen",       icon: Home      },
  { href: "/movements",   label: "Transacciones", icon: List      },
  { href: "/capture",     label: "Capturar",      icon: Plus,     primary: true },
  { href: "/insights",    label: "Reportes",      icon: BarChart3 },
  { href: "/more",        label: "Más",           icon: Menu      },
];

/**
 * Decides whether a given pathname should mark the tab as active.
 * A tab matches its own href, and any nested route under it
 * (e.g. /movements/123 still highlights "Movs").
 */
function isItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function TabBar({
  items = DEFAULT_ITEMS,
  className,
}: TabBarProps): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  // While the user is on /capture, the center FAB doubles as the Save
  // confirmation: icon swaps to ✓, click triggers handleSave() via the
  // action bus, and disabled state mirrors the page's `ready` flag.
  const isCapture = pathname === "/capture";
  const canSave = useCaptureCanSave();

  return (
    <nav
      role="navigation"
      aria-label="Navegación principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background",
        // Safe-area inset for iOS home indicator.
        "pb-[env(safe-area-inset-bottom)]",
        // Desktop swaps to Sidebar — hide the mobile bar at md+.
        "md:hidden",
        className,
      )}
    >
      <ul
        className="mx-auto grid h-16 w-full max-w-[480px] grid-cols-5 items-stretch px-1"
        // 56px+ tap targets via h-16 (64px) on the row + min-h on each link.
      >
        {items.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;

          if (item.primary) {
            // On /capture the center button is the Save action (✓). On any
            // other route it's a navigation link to /capture (+). We render
            // a <button> in both cases so the click handler can branch —
            // the Link semantics are preserved via aria-label + manual
            // router.push for the navigation case.
            const PrimaryIcon = isCapture ? Check : Plus;
            const disabled = isCapture && !canSave;
            const ariaLabel = isCapture
              ? "Guardar movimiento"
              : item.label;
            const handlePrimaryClick = () => {
              if (isCapture) {
                captureActionBus.triggerSave();
              } else {
                router.push(item.href);
              }
            };

            return (
              <li
                key={item.href}
                className="flex items-center justify-center"
              >
                <button
                  type="button"
                  onClick={handlePrimaryClick}
                  disabled={disabled}
                  aria-label={ariaLabel}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative -mt-5 inline-flex h-[60px] w-[60px] items-center justify-center rounded-full",
                    "bg-primary text-primary-foreground",
                    "transition-transform duration-150 ease-out active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    disabled && "cursor-not-allowed opacity-50 active:scale-100",
                  )}
                  style={
                    disabled ? undefined : { boxShadow: "var(--shadow-fab)" }
                  }
                >
                  <PrimaryIcon
                    size={26}
                    strokeWidth={2.6}
                    aria-hidden="true"
                  />
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span
                      aria-label={`${item.badge} pendientes`}
                      className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-primary-foreground"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-md",
                  "transition-colors duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative inline-flex">
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.8}
                    aria-hidden="true"
                  />
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span
                      aria-label={`${item.badge} pendientes`}
                      className="absolute -right-2 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[16px] text-primary-foreground"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-[10px] tracking-[0.01em]",
                    active ? "font-bold" : "font-medium",
                  )}
                >
                  {item.label}
                </span>
                {/* Active indicator dot — sits below the label, like a small pill */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-1 h-1 w-1 rounded-full transition-opacity duration-150",
                    active ? "bg-primary opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default TabBar;
