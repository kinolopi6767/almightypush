import type { ReactNode } from "react";

/** Console page head: eyebrow + title + description + actions, hairline below. */
export function PageHeader({
 eyebrow,
 title,
 description,
 actions,
 children,
}: {
 eyebrow?: ReactNode;
 title: ReactNode;
 description?: ReactNode;
 actions?: ReactNode;
 children?: ReactNode;
}) {
 return (
  <div className="enter">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0 space-y-1.5">
     {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
     <h1 className="page-title">{title}</h1>
     {description && <p className="page-desc">{description}</p>}
     {children}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
   </div>
   <hr aria-hidden className="divider mt-4" />
  </div>
 );
}
