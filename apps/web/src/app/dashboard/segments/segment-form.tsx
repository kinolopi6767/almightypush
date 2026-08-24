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

  const runEstimate = useCallback(async () => {
    const fd = new FormData();
    fd.set("domainIds", JSON.stringify(domainIds));
    fd.set("groups", JSON.stringify({ groups }));
    setEstimate(await estimateSegmentDraft(fd));
  }, [domainIds, groups]);

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
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{initial ? "Edit segment" : "New segment"}</h2>
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            <div key={gi} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Match</span>
                <select
                  aria-label={`Group ${gi + 1} logic`}
                  value={group.logic}
                  onChange={(e) => updateGroup(gi, { logic: e.target.value as "AND" | "OR" })}
                  className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className="rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className="rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                      className="min-w-40 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                        className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-destructive"
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
                className="mt-2 rounded-md px-2 py-1 text-sm text-primary hover:bg-primary/10"
              >
                + Add condition
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setGroups((gs) => [...gs, { logic: "AND", conditions: [emptyCondition()] }])}
            className="rounded-md px-2 py-1 text-sm text-primary hover:bg-primary/10"
          >
            + Add group
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runEstimate}
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Estimate
          </button>
          {estimate && (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {estimate.error ? estimate.error : `~${estimate.count.toLocaleString()} subscribers`}
            </span>
          )}
        </div>

        {state?.error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
