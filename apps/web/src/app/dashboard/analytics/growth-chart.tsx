"use client";

import { useId } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface GrowthPoint {
  date: string;
  count: number;
}

/** 30-day growth — premium editorial bar chart. */
export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  const gradientId = useId();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barCategoryGap={12}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.55} />
     </linearGradient>
    </defs>
    <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={4} dy={6} />
    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
    <Tooltip
     cursor={{ fill: "color-mix(in oklab, var(--muted) 45%, transparent)" }}
     contentStyle={{
       borderRadius: 6,
       border: "1px solid var(--line)",
       background: "var(--panel)",
       boxShadow: "var(--shadow-xs)",
       fontSize: 12,
       color: "var(--ink)",
      }}
      labelStyle={{ color: "var(--ink-3)", marginBottom: 4 }}
     />
      <Bar dataKey="count" name="Subscribers" fill={`url(#${gradientId})`} radius={[4, 4, 0, 0]} barSize={14} />
   </BarChart>
  </ResponsiveContainer>
 );
}