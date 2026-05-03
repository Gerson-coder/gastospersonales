/**
 * More route — Kane
 *
 * Mobile menu surface for everything that doesn't fit in the bottom TabBar.
 * Mirrors the desktop Sidebar's secondary navigation: Categorías, Presupuestos,
 * Metas, Asesor IA, Cuentas, Perfil, Configuración. Pure list — no data
 * fetching, no localStorage, no client mutations. Each row is a Link that
 * navigates within the (tabs) group so the bar persists.
 *
 * Hidden on desktop (md+) via the layout's Sidebar replacement.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  ChevronRight,
  Clock,
  Settings,
  Tag,
  Target,
  User,
  Wallet,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/kane/AppHeader";

type MoreItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    "aria-hidden"?: boolean | "true";
  }>;
  badge?: "new";
};

type MoreGroup = {
  title: string;
  items: MoreItem[];
};

const GROUPS: MoreGroup[] = [
  {
    title: "Tu dinero",
    items: [
      {
        href: "/categories",
        label: "Categorías",
        description: "Personaliza tus etiquetas",
        icon: Tag,
      },
      {
        href: "/budgets",
        label: "Presupuestos",
        description: "Pon un tope mensual por categoría",
        icon: Clock,
      },
      {
        href: "/goals",
        label: "Metas",
        description: "Haz crecer tus ahorros",
        icon: Target,
      },
      {
        href: "/accounts",
        label: "Cuentas",
        description: "Efectivo, tarjeta, banco, Yape, Plin",
        icon: Wallet,
      },
    ],
  },
  {
    title: "Asistencia",
    items: [
      {
        href: "/advisor",
        label: "Asesor IA",
        description: "Insights de tus gastos",
        icon: Bot,
        badge: "new",
      },
    ],
  },
  {
    title: "Tu cuenta",
    items: [
      {
        href: "/profile",
        label: "Perfil",
        description: "Nombre, foto y preferencias",
        icon: User,
      },
      {
        href: "/settings",
        label: "Configuración",
        description: "Tema, moneda, sesión",
        icon: Settings,
      },
    ],
  },
];

export default function MorePage(): React.ReactElement {
  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground md:hidden">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6">
        <AppHeader
          eyebrow="Kane"
          title="Más"
          titleStyle="page"
          className="px-0 pt-0"
        />

        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`group-${group.title}`}>
            <h2
              id={`group-${group.title}`}
              className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              {group.title}
            </h2>
            <Card className="overflow-hidden rounded-2xl border-border p-0">
              <ul className="divide-y divide-border" role="list">
                {group.items.map((item) => (
                  <MoreRow key={item.href} item={item} />
                ))}
              </ul>
            </Card>
          </section>
        ))}

        <p className="px-1 pt-2 text-[11px] text-muted-foreground">
          Kane · controla tu dinero
        </p>
      </div>
    </main>
  );
}

function MoreRow({ item }: { item: MoreItem }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-label={item.label}
        className={cn(
          "flex min-h-[64px] w-full items-center gap-3 px-4 py-3 transition-colors",
          "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">
              {item.label}
            </span>
            {item.badge === "new" ? (
              <span className="inline-flex h-[18px] flex-shrink-0 items-center rounded-full bg-primary/15 px-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                Nuevo
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        </div>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="ml-2 flex-shrink-0 text-muted-foreground"
        />
      </Link>
    </li>
  );
}
