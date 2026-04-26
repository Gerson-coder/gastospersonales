/**
 * Sidebar — desktop navigation rail for Lumi.
 *
 * Fixed left rail rendered at `md+` breakpoints. Hidden on mobile,
 * where TabBar takes over.
 *
 * Items are sourced from `DEFAULT_ITEMS` exported by `TabBar` so labels
 * and routes never drift between the two navs. The "Capturar" item
 * (the one flagged `primary`) is rendered as a prominent filled action
 * separated from the regular nav rows — matching the lifted FAB role
 * the mobile TabBar gives it.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Settings as SettingsIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useUserName } from "@/lib/use-user-name";

import { DEFAULT_ITEMS, type TabBarItem } from "./TabBar";

export interface SidebarProps {
  items?: TabBarItem[];
  className?: string;
}

function isItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function Sidebar({
  items = DEFAULT_ITEMS,
  className,
}: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const { name, hydrated } = useUserName();

  // Split items: regular nav rows vs the primary "Capturar" action.
  const regularItems = items.filter((i) => !i.primary);
  const primaryItem = items.find((i) => i.primary);

  return (
    <aside
      className={cn(
        // Desktop only: fixed left rail.
        "hidden md:flex md:flex-col",
        "fixed top-0 left-0 z-40 h-screen w-64",
        "border-r border-border bg-background",
        className,
      )}
    >
      {/* Brand area */}
      <div className="flex h-20 items-center gap-2.5 px-5">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 rounded-lg"
          aria-hidden="true"
          priority
        />
        <span className="sr-only">Lumi</span>
        {/* Wordmark — currentColor inherits from text-foreground */}
        <span aria-hidden="true" className="inline-flex text-foreground">
          <Image
            src="/brand/lumi-wordmark.svg"
            alt=""
            width={88}
            height={28}
            className="h-7 w-auto"
            aria-hidden="true"
            priority
          />
        </span>
      </div>

      <Separator />

      {/* Nav list */}
      <nav
        role="navigation"
        aria-label="Navegación lateral"
        className="flex flex-1 flex-col gap-1 p-3"
      >
        <ul className="flex flex-col gap-1">
          {regularItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-10 items-center gap-3 rounded-lg px-4 py-3",
                    "text-sm font-semibold transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.2 : 1.8}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span
                      aria-label={`${item.badge} pendientes`}
                      className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-[18px] text-primary-foreground"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {primaryItem ? (
          <>
            <Separator className="my-3" />
            <PrimaryAction
              item={primaryItem}
              active={isItemActive(pathname, primaryItem.href)}
            />
          </>
        ) : null}
      </nav>

      {/* Footer: greeting + settings shortcut + version */}
      <div className="space-y-3 px-3 py-4">
        <Link
          href="/settings"
          aria-current={isItemActive(pathname, "/settings") ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
            "transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isItemActive(pathname, "/settings")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground font-semibold"
            aria-hidden="true"
          >
            {hydrated && name ? name.trim().charAt(0).toUpperCase() : "?"}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {hydrated ? (name ?? "Sin nombre") : " "}
          </span>
          <SettingsIcon size={16} aria-hidden="true" />
        </Link>
        <div className="px-3 text-[11px] font-medium text-muted-foreground/70">
          v0.1.0 · © Lumi
        </div>
      </div>
    </aside>
  );
}

function PrimaryAction({
  item,
  active,
}: {
  item: TabBarItem;
  active: boolean;
}): React.ReactElement {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-12 w-full items-center justify-start gap-3 rounded-lg px-4",
        "bg-primary text-primary-foreground text-sm font-bold",
        "transition-colors duration-150 ease-out hover:bg-primary/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      style={{ boxShadow: "var(--shadow-fab)" }}
    >
      <Icon size={20} strokeWidth={2.4} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export default Sidebar;
