"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings as SettingsIcon, User, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/use-session";
import { useUserName } from "@/lib/use-user-name";
import { UserAvatarCircle } from "@/components/lumi/UserAvatarCircle";
import { cn } from "@/lib/utils";

const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

function deriveInitial(name: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "?";
}

export function ProfileMenu({ className }: { className?: string }) {
  const router = useRouter();
  const { user, hydrated: sessionHydrated } = useSession();
  const { name, clearName, hydrated: nameHydrated } = useUserName();

  const initial = nameHydrated ? deriveInitial(name) : "?";
  const displayName = nameHydrated ? (name ?? "Sin nombre") : " ";
  const email = sessionHydrated ? (user?.email ?? null) : null;

  async function handleSignOut() {
    if (SUPABASE_ENABLED) {
      try {
        const supabase = createSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        /* fall through — local clear still proceeds */
      }
    }
    clearName();
    toast.success("Sesión cerrada");
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir perfil"
        className={cn(
          "inline-flex shrink-0 rounded-full transition-colors hover:opacity-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <UserAvatarCircle size="md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[240px] p-2">
        {/* Identity header */}
        <div className="flex items-center gap-3 px-2 py-2.5">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)] text-sm font-bold"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{displayName}</div>
            {email ? (
              <div className="truncate text-[11px] text-muted-foreground">
                {email}
              </div>
            ) : null}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={<Link href="/profile" />}
          className="gap-2 cursor-pointer"
        >
          <User className="h-4 w-4" aria-hidden="true" />
          <span>Perfil</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<Link href="/settings" />}
          className="gap-2 cursor-pointer"
        >
          <SettingsIcon className="h-4 w-4" aria-hidden="true" />
          <span>Ajustes</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<Link href="/accounts" />}
          className="gap-2 cursor-pointer"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          <span>Cuentas</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={handleSignOut}
          className="gap-2 cursor-pointer"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
