"use client";

import { useActionState, useCallback, useState } from "react";
import { createSegmentAction, estimateSegmentDraft, updateSegmentAction, type SegmentFormState } from "./actions";

const FIELDS: { value: string; label: string; ops: { value: string; label: string }[] }[] = [
 {
  value: "url",
  label: "Subscription URL",
  ops: [
   { value: "equals", label: "equals" },
   { value: "contains", label: "contains" },
   { value: "starts_with", label: "starts with" },
   { value: "ends_with", label: "ends with" },
  ],
 },
 {
  value: "country",
  label: "Country",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
  ],
 },
 {
  value: "state",
  label: "State",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
  ],
 },
 {
  value: "city",
  label: "City (hyper-precision)",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
  ],
 },
 {
  value: "tag",
  label: "Custom Tag (unlimited)",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
   { value: "contains", label: "contains" },
  ],
 },
 {
  value: "device",
  label: "Device",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
  ],
 },
 {
  value: "os",
  label: "OS",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
  ],
 },
 {
  value: "browser",
  label: "Browser",
  ops: [
   { value: "equals", label: "is" },
   { value: "in", label: "in list" },
  ],
 },
 {
  value: "subscribed_after",
  label: "Subscribed after",
  ops: [
   { value: "gte", label: "on or after" },
   { value: "gt", label: "after" },
  ],
 },
 {
  value: "subscribed_before",
  label: "Subscribed before",
  ops: [
   { value: "lte", label: "on or before" },
   { value: "lt", label: "before" },
  ],
 },
 {
  value: "last_active_after",
  label: "Active after",
  ops: [
   { value: "gte", label: "on or after" },
   { value: "gt", label: "after" },
  ],
 },
 {
  value: "opened_campaign",
  label: "Opened campaign",
  ops: [{ value: "equals", label: "campaign id" }],
 },
 {
  value: "campaign_total_opens",
  label: "Total opens",
  ops: [
   { value: "gte", label: "at least" },
   { value: "equals", label: "exactly" },
  ],
 },
];

const DEFAULT_OP = "equals";

interface Condition {
 field: string;
 op: string;
 value: string;
}

interface Group {
 logic: "AND" | "OR";
 conditions: Condition[];
}

function emptyCondition(): Condition {
 return { field: "url", op: "equals", value: "" };
}

interface SegmentFormProps {
 domains: { id: number; name: string }[];
 /** Edit mode: existing segment to prefill + update action. */
 initial?: { id: number; name: string; domainIds: number[]; groups: Group[] };
}

export function SegmentForm({ domains, initial }: SegmentFormProps) {
 const [state, formAction, pending] = useActionState<SegmentFormState | undefined, FormData>(
  initial
   ? (_prev: SegmentFormState | undefined, fd: FormData) => updateSegmentAction(initial.id, fd)
   : createSegmentAction,
  undefined,
 );
 const [domainIds, setDomainIds] = useState<number[]>(initial?.domainIds ?? []);
 const [groups, setGroups] = useState<Group[]>(
  initial?.groups ?? [{ logic: "AND", conditions: [emptyCondition()] }],
 );
 const [estimate, setEstimate] = useState<{ count: number; error?: string } | null>(null);
 const [estimating, setEstimating] = useState(false);

 const runEstimate = useCallback(async () => {
  if (estimating) return;
  setEstimating(true);
  try {
   const fd = new FormData();
   fd.set("domainIds", JSON.stringify(domainIds));
   fd.set("groups", JSON.stringify({ groups }));
   setEstimate(await estimateSegmentDraft(fd));
  } finally {
   setEstimating(false);
  }
 }, [domainIds, groups, estimating]);

 const submitLabel = initial ? "Save segment" : "Create segment";

 const updateGroup = useCallback((gi: number, patch: Partial<Group>) => {
  setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
 }, []);

 const updateCondition = useCallback((gi: number, ci: number, patch: Partial<Condition>) => {
  setGroups((gs) =>
   gs.map((g, i) => (i !== gi ? g : { ...g, conditions: g.conditions.map((c, j) => (j === ci ? { ...c, ...patch } : c)) })),
  );
 }, []);

 return (
  <form action={formAction} className="panel p-4">
   <h2 className="text-[15px] font-semibold tracking-tight">{initial ? "Edit segment" : "New segment"}</h2>
   <p className="mt-1 text-sm text-muted-foreground">Reusable audience rules — pick any subscribers matching the conditions.</p>

   <div className="mt-4 space-y-4">
    <div>
     <label htmlFor="name" className="text-sm font-medium">
      Name
     </label>
     <input
      id="name"
      name="name"
      required
      maxLength={100}
      defaultValue={initial?.name}
      placeholder="Chrome users on mobile"
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
     />
    </div>

    <div>
     <span className="text-sm font-medium">Domains</span>
     <div className="mt-1 flex flex-wrap gap-2">
      {domains.map((d) => {
       const checked = domainIds.includes(d.id);
       return (
        <label
         key={d.id}
         className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring ${
          checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
         }`}
        >
         <input
          type="checkbox"
          checked={checked}
          onChange={(e) =>
           setDomainIds((prev) =>
            e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id),
           )
          }
          className="sr-only"
         />
         {d.name}
        </label>
       );
      })}
      {domains.length === 0 && (
       <span className="text-sm text-muted-foreground">No domains yet — segments apply to all domains.</span>
      )}
     </div>
     <input type="hidden" name="domainIds" value={JSON.stringify(domainIds)} />
    </div>

    <div className="space-y-3">
     <span className="text-sm font-medium">Conditions</span>
     <input type="hidden" name="groups" value={JSON.stringify(groups)} />

     {groups.map((group, gi) => (
      <div key={gi} className="form-note">
       <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Match</span>
        <select
         aria-label={`Group ${gi + 1} logic`}
         value={group.logic}
         onChange={(e) => updateGroup(gi, { logic: e.target.value as "AND" | "OR" })}
         className="input"
        >
         <option value="AND">all conditions (AND)</option>
         <option value="OR">any condition (OR)</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">group {gi + 1}</span>
       </div>

       <div className="mt-2 space-y-2">
        {group.conditions.map((cond, ci) => (
         <div key={ci} className="flex flex-wrap items-center gap-2">
          <select
           aria-label={`Condition ${gi + 1}.${ci + 1} field`}
           value={cond.field}
           onChange={(e) => {
            const field = FIELDS.find((f) => f.value === e.target.value);
            updateCondition(gi, ci, { field: e.target.value, op: field?.ops[0]?.value ?? DEFAULT_OP });
           }}
           className="input"
          >
           {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
             {f.label}
            </option>
           ))}
          </select>
          <select
           aria-label={`Condition ${gi + 1}.${ci + 1} operator`}
           value={cond.op}
           onChange={(e) => updateCondition(gi, ci, { op: e.target.value })}
           className="input"
          >
           {(FIELDS.find((f) => f.value === cond.field)?.ops ?? []).map((o) => (
            <option key={o.value} value={o.value}>
             {o.label}
            </option>
           ))}
          </select>
          <input
           aria-label={`Condition ${gi + 1}.${ci + 1} value`}
           value={cond.value}
           onChange={(e) => updateCondition(gi, ci, { value: e.target.value })}
           placeholder={cond.field === "opened_campaign" || cond.field === "campaign_total_opens" ? "e.g. 12" : "value"}
           className="input min-w-40 flex-1"
          />
          {group.conditions.length > 1 && (
           <button
            type="button"
            onClick={() =>
             setGroups((gs) =>
              gs.map((g, i) =>
               i !== gi ? g : { ...g, conditions: g.conditions.filter((_, j) => j !== ci) },
              ),
             )
            }
            className="btn btn-ghost btn-sm"
           >
            Remove
           </button>
          )}
         </div>
        ))}
       </div>

       <button
        type="button"
        onClick={() => updateGroup(gi, { conditions: [...group.conditions, emptyCondition()] })}
        className="btn btn-ghost btn-sm mt-2 text-[var(--brand)]!"
       >
        + Add condition
       </button>
      </div>
     ))}

     <button
      type="button"
      onClick={() => setGroups((gs) => [...gs, { logic: "AND", conditions: [emptyCondition()] }])}
      className="btn btn-ghost btn-sm text-[var(--brand)]!"
     >
      + Add group
     </button>
    </div>

    <div className="flex items-center gap-3">
     <button
      type="button"
      onClick={runEstimate}
      disabled={estimating}
      aria-busy={estimating}
      className="btn btn-secondary"
     >
      {estimating ? "Estimating…" : "Estimate"}
     </button>
     {estimate && (
      <span className="text-sm text-muted-foreground" aria-live="polite">
       {estimate.error ? estimate.error : `~${estimate.count.toLocaleString()} subscribers`}
      </span>
     )}
    </div>

    {state?.error && (
     <p role="alert" className="form-alert">
      {state.error}
     </p>
    )}

    <button
     type="submit"
     disabled={pending}
     className="btn btn-primary"
    >
     {pending ? "Saving…" : submitLabel}
    </button>
   </div>
  </form>
 );
}
