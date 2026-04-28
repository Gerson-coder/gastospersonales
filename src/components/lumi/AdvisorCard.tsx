"use client";

import * as React from "react";
import { Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AdvisorCardProps {
  message?: string;
  onTalk?: () => void;
  className?: string;
}

const DEFAULT_MESSAGE =
  "Gastaste 23% más en comida esta semana. ¿Te gustaría que te ayude a crear un plan para mejorar tus hábitos de gasto?";

// Alturas relativas de las barras del waveform (decorativas)
const WAVEFORM_HEIGHTS = [10, 18, 14, 22, 12, 20, 9];

export function AdvisorCard({
  message,
  onTalk,
  className,
}: AdvisorCardProps) {
  const disabled = !onTalk;

  return (
    <Card
      className={cn(
        "rounded-2xl border-border p-5 md:p-6",
        "bg-gradient-to-br from-primary/5 to-card",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">
          Tu asesor financiero
        </span>
        <span className="bg-primary/15 text-primary px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
          Nuevo
        </span>
      </div>

      {/* Body */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-12 w-12 bg-primary/15 text-primary rounded-full flex items-center justify-center shrink-0">
          <Bot className="h-6 w-6" aria-hidden />
        </div>

        {/* Mensaje */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-relaxed text-foreground">
            {message ?? DEFAULT_MESSAGE}
          </p>
        </div>

        {/* Waveform decorativo */}
        <svg
          width="36"
          height="28"
          viewBox="0 0 36 28"
          className="shrink-0 text-primary"
          aria-hidden
          role="presentation"
        >
          {WAVEFORM_HEIGHTS.map((h, i) => (
            <rect
              key={i}
              x={i * 5}
              y={(28 - h) / 2}
              width={3}
              height={h}
              rx={1.5}
              fill="currentColor"
              opacity={0.6}
            />
          ))}
        </svg>
      </div>

      {/* CTA */}
      <div className="mt-5 flex">
        <button
          type="button"
          onClick={onTalk}
          disabled={disabled}
          className={cn(
            "h-10 px-5 rounded-full text-sm font-semibold transition-colors",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 active:bg-primary/80",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary",
          )}
        >
          Hablar con asesor
        </button>
      </div>
    </Card>
  );
}
