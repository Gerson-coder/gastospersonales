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
        <linearGradient id="kane-icon-k-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5FAF5" />
          <stop offset="100%" stopColor="#DDE8DD" />
        </linearGradient>
      </defs>

      {/* Fondo: rounded rect (rx ≈ 21%) */}
      <rect
        x="0"
        y="0"
        width="512"
        height="512"
        rx="110"
        ry="110"
        fill="url(#kane-icon-bg)"
      />

      {/* K cuerpo principal: paths sólidos con brazos cortados al ras */}
      <path
        d="M130 100 L130 410 L250 270 L380 100 L300 100 L210 215 L210 100 Z"
        fill="url(#kane-icon-k)"
      />

      {/* K base curve */}
      <path
        d="M130 410 Q220 340 305 360 L380 440 L130 440 Z"
        fill="url(#kane-icon-k-base)"
      />

      {/* $ circle + simbolo */}
      <circle cx="195" cy="395" r="52" fill="#FFFFFF" />
      <text
        x="195"
        y="413"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight={900}
        fontSize={58}
        fill="#0B3D2E"
      >
        $
      </text>

      {/* Flecha de crecimiento que atraviesa el K hacia arriba-derecha */}
      <path
        d="M250 400 Q335 320, 430 215"
        stroke="#22C55E"
        strokeWidth="22"
        fill="none"
        strokeLinecap="round"
      />
      <polygon points="450,200 412,217 432,250" fill="#22C55E" />
    </svg>
  );
}

export default KaneIcon;
