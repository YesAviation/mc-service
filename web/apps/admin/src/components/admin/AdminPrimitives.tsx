import type { ReactNode } from "react";
import clsx from "clsx";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-white/10 text-text-secondary border border-white/15",
  info: "bg-accent-muted text-accent-soft border border-accent/30",
  success: "bg-success/14 text-success border border-success/30",
  warning: "bg-amber-400/12 text-amber-200 border border-amber-300/30",
  danger: "bg-danger/14 text-danger border border-danger/30",
};

export function PageHero({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <section className="page-header py-6 md:py-8">
      {badge ? (
        <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-accent-soft">
          {badge}
        </p>
      ) : null}
      <h1 className="text-[1.85rem] md:text-[2rem] font-semibold tracking-tight text-text-primary">
        {title}
      </h1>
      <p className="text-sm md:text-[0.95rem] text-text-secondary mt-1.5 max-w-3xl">
        {description}
      </p>
    </section>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("surface-panel p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {description ? (
            <p className="text-sm text-text-secondary mt-1">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", toneClasses[tone])}>
      {label}
    </span>
  );
}

export function PrimaryAction({
  label,
  disabled,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex items-center rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function SecondaryAction({
  label,
  disabled,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex items-center rounded-lg border border-border-default px-3.5 py-2 text-sm font-medium text-text-secondary hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
    >
      {label}
    </button>
  );
}
