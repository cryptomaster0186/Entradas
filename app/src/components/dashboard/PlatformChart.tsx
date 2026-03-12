"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface PlatformBreakdown {
  platform: string;
  count: number;
  revenue: number;
  profit: number;
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function PlatformChart({ data }: { data: PlatformBreakdown[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
        No platform data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <XAxis
          dataKey="platform"
          tick={{ fill: "#9ca3af", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={usd}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
          labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [
            typeof value === "number" ? usd(value) : String(value ?? ""),
            "Revenue",
          ]}
        />
        <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
