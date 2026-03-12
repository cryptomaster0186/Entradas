interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: "default" | "green" | "red" | "blue" | "purple" | "orange";
}

const colorMap = {
  default: "border-gray-700 bg-gray-900",
  green: "border-emerald-700/50 bg-emerald-950/40",
  red: "border-red-700/50 bg-red-950/40",
  blue: "border-blue-700/50 bg-blue-950/40",
  purple: "border-indigo-700/50 bg-indigo-950/40",
  orange: "border-orange-700/50 bg-orange-950/40",
};

const textColorMap = {
  default: "text-white",
  green: "text-emerald-400",
  red: "text-red-400",
  blue: "text-blue-400",
  purple: "text-indigo-400",
  orange: "text-orange-400",
};

export function KPICard({ title, value, subtitle, color = "default" }: KPICardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textColorMap[color]}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
