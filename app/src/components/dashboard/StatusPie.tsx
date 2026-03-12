"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface StatusSummary {
  status: string;
  count: number;
  revenue: number;
  profit: number;
}

const COLORS: Record<string, string> = {
  sold: "#10b981",
  listed: "#6366f1",
  pending: "#f59e0b",
  cancelled: "#ef4444",
  unknown: "#6b7280",
};

function getColor(status: string) {
  return COLORS[status.toLowerCase()] ?? COLORS.unknown;
}

export function StatusPie({ data }: { data: StatusSummary[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
        No status data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={(props) => {
            const entry = data.find((d) => d.status === props.name);
            const pct = props.percent != null ? (props.percent * 100).toFixed(0) : "0";
            return entry ? `${entry.status} (${pct}%)` : "";
          }}
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={getColor(entry.status)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`${value ?? 0} tickets`, "Count"]}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: "#9ca3af", fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
