/**
 * KaneIcon — versión React del logo de Kane.
 *
 * Mismo diseño que `public/brand/kane-icon.svg` (la fuente de verdad
 * desde la que se rasterizan los PNG del PWA via
 * `scripts/generate-pwa-icons.mjs`). Este componente sirve para
 * superficies in-app donde queremos render vectorial nítido en
 * cualquier tamaño: splash, onboarding hero, settings → about.
 *
 * Si actualizás los colores o las coordenadas acá, sincronizá también
 * `public/brand/kane-icon.svg` y volvé a correr el script de PNGs;
 * sino el icono del home screen y el logo in-app divergen.
 */
"use client";

import * as React from "react";

export type KaneIconProps = {
  /** Tamaño en px. Default 140 — bueno para hero / splash. Para
   *  superficies más densas pasá 24/32/48. */
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

export function KaneIcon({
  size = 140,
  className,
  "aria-hidden": ariaHidden = "true",
}: KaneIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaHidden}
      className={className}
    >
      <defs>
        <linearGradient
          id="kane-icon-bg"
          x1="0"
          y1="0"
          x2="512"
          y2="512"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#0F3D2E" />
          <stop offset="100%" stopColor="#052E1F" />
        </linearGradient>
        <linearGradient id="kane-icon-k" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F8F2" />
        </linearGradient>
      </defs>

      {/* Fondo: rounded rect estilo iOS app icon (rx ≈ 21%) */}
      <rect
        x="0"
        y="0"
        width="512"
        height="512"
        rx="110"
        ry="110"
        fill="url(#kane-icon-bg)"
      />

      {/* K construida con stem + dos brazos diagonales (look bold, moderno) */}
      <rect x="100" y="96" width="64" height="320" rx="10" fill="url(#kane-icon-k)" />
      <line
        x1="148"
        y1="258"
        x2="362"
        y2="96"
        stroke="url(#kane-icon-k)"
        strokeWidth="60"
        strokeLinecap="round"
      />
      <line
        x1="148"
        y1="258"
        x2="362"
        y2="416"
        stroke="url(#kane-icon-k)"
        strokeWidth="60"
        strokeLinecap="round"
      />

      {/* Círculo del dólar (top-right) */}
      <circle cx="370" cy="148" r="68" fill="#FFFFFF" />
      <text
        x="370"
        y="175"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight={900}
        fontSize={78}
        fill="#0B3D2E"
      >
        $
      </text>

      {/* Flecha de crecimiento (bottom-right, forma de L) */}
      <line
        x1="268"
        y1="418"
        x2="398"
        y2="298"
        stroke="#22C55E"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <line
        x1="298"
        y1="278"
        x2="418"
        y2="278"
        stroke="#22C55E"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <line
        x1="418"
        y1="278"
        x2="418"
        y2="398"
        stroke="#22C55E"
        strokeWidth="26"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default KaneIcon;
