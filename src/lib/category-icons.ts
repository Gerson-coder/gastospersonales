/**
 * Hand-curated palette of Lucide icons available for categories.
 *
 * The DB stores `icon` as the kebab-case Lucide name (e.g. "utensils-crossed").
 * This module provides:
 *   - `CATEGORY_ICONS`: ordered list for the picker grid.
 *   - `getCategoryIcon(name)`: fallback-safe lookup for rendering.
 *
 * Import the components directly to keep tree-shaking happy. If you add a new
 * icon, also import the corresponding Lucide component below.
 */
import {
  UtensilsCrossed,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  Home,
  GraduationCap,
  Briefcase,
  Circle,
  PiggyBank,
  Coffee,
  Dumbbell,
  Plane,
  Gift,
  Wrench,
  HeartPulse,
  Gamepad2,
  Plug,
  BookOpen,
  CircleEllipsis,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * Minimal prop subset we actually use when rendering category icons in the
 * UI. Kept narrow on purpose so this type is assignable to the slightly
 * different "icon" component signatures used by the inline mocks in
 * `capture/page.tsx` and `settings/page.tsx`.
 */
export type LucideIconLike = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

export type CategoryIconChoice = {
  name: string;
  label: string;
  Icon: LucideIconLike;
};

/**
 * Picker grid — keep ~16 entries for a clean 4-column layout.
 * Names match Lucide's kebab-case identifiers.
 */
export const CATEGORY_ICONS: CategoryIconChoice[] = [
  { name: "utensils-crossed", label: "Comida", Icon: UtensilsCrossed },
  { name: "car", label: "Auto", Icon: Car },
  { name: "shopping-cart", label: "Compras", Icon: ShoppingCart },
  { name: "heart", label: "Corazón", Icon: Heart },
  { name: "film", label: "Cine", Icon: Film },
  { name: "zap", label: "Servicios", Icon: Zap },
  { name: "home", label: "Hogar", Icon: Home },
  { name: "graduation-cap", label: "Estudios", Icon: GraduationCap },
  { name: "briefcase", label: "Trabajo", Icon: Briefcase },
  { name: "piggy-bank", label: "Ahorro", Icon: PiggyBank },
  { name: "coffee", label: "Café", Icon: Coffee },
  { name: "dumbbell", label: "Gimnasio", Icon: Dumbbell },
  { name: "plane", label: "Viaje", Icon: Plane },
  { name: "gift", label: "Regalo", Icon: Gift },
  { name: "wrench", label: "Mantenimiento", Icon: Wrench },
  { name: "circle", label: "Otros", Icon: Circle },
];

/**
 * Aliases for system-seeded icons that aren't in the picker grid above. The
 * picker doesn't expose them (we don't want users picking "circle-ellipsis"
 * by hand), but they still need to render correctly when read back from the
 * DB seed.
 */
const ICON_ALIASES: Record<string, LucideIconLike> = {
  "heart-pulse": HeartPulse,
  "gamepad-2": Gamepad2,
  plug: Plug,
  "book-open": BookOpen,
  "circle-ellipsis": CircleEllipsis,
};

/**
 * Look up an icon component by kebab-case name. Falls back to `Circle` if the
 * name is unknown or null — the UI never crashes on a stale icon string.
 */
export function getCategoryIcon(name: string | null | undefined): LucideIconLike {
  if (!name) return Circle;
  const fromGrid = CATEGORY_ICONS.find((c) => c.name === name);
  if (fromGrid) return fromGrid.Icon;
  if (name in ICON_ALIASES) return ICON_ALIASES[name];
  return Circle;
}

export const DEFAULT_CATEGORY_ICON = "circle";
