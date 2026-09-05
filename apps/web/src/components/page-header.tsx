import type { ReactNode } from "react";

/** Premium page header: editorial hierarchy + refined actions. */
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
        <div className="min-w-0 space-y-2">
          <h1 className="text-[26px] font-semibold leading-none tracking-tight md:text-[28px]">{title}</h1>
          {description && <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground text-pretty">{description}</p>}
          {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5 pt-1">{actions}</div>}
      </div>
      <div
        aria-hidden
        className="mt-6 h-px premium-divider"
      />
    </div>
  );
}
