import type { ReactNode } from "react";

/** Consistent page header: title, description, right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rise">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight md:text-2xl">{title}</h1>
          {description && <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
          {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5">{actions}</div>}
      </div>
      <div className="mt-6 h-px bg-border/60" aria-hidden />
    </div>
  );
}
