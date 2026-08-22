"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface GrowthPoint {
  date: string;
  count: number;
}

/** E1: 30-day subscriber growth (Recharts — per BUILD-PLAN §1 UI stack). */
export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval={4} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
        <Tooltip
          cursor={{ fill: "color-mix(in oklab, var(--muted) 40%, transparent)" }}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
        />
        <Bar dataKey="count" name="Subscribers" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}