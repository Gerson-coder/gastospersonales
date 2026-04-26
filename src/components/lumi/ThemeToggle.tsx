"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Choice = "system" | "light" | "dark";

const OPTIONS: { value: Choice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

/**
 * ThemeToggle
 *
 * Quick theme switcher: icon-only button + dropdown with the 3 modes.
 * Stays in sync with /settings (both write to next-themes' provider).
 *
 * Hydration safety: next-themes returns sane defaults SSR; the icon
 * we paint defaults to Monitor (Sistema) until mounted, then snaps to
 * the resolved theme. We gate the swap on a `mounted` flag to dodge
 * hydration mismatch warnings.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Pick the icon for the trigger:
  //  - SSR / pre-mount: neutral Monitor (matches first paint everywhere).
  //  - When user explicitly picked light/dark: show Sun/Moon.
  //  - When on "system": show whichever the system resolved to.
  let TriggerIcon = Monitor;
  if (mounted) {
    if (theme === "light") TriggerIcon = Sun;
    else if (theme === "dark") TriggerIcon = Moon;
    else TriggerIcon = resolvedTheme === "dark" ? Moon : Sun;
  }

  const currentValue: Choice = (theme as Choice | undefined) ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar tema"
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          "text-foreground transition-colors hover:bg-accent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <TriggerIcon className="h-5 w-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = mounted && currentValue === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => setTheme(value)}
              aria-checked={selected}
              role="menuitemradio"
              className={cn(
                "gap-2 cursor-pointer",
                selected && "font-semibold",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {selected ? (
                <span
                  className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
