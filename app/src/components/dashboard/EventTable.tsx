interface EventPerformance {
  event: string;
  totalCost: number;
  revenue: number;
  profit: number;
  count: number;
}

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EventTable({
  events,
  title,
  highlight,
}: {
  events: EventPerformance[];
  title: string;
  highlight: "green" | "red";
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="font-semibold text-white text-sm">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Event</th>
            <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Cost</th>
            <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Revenue</th>
            <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Profit</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
              <td className="px-5 py-3 text-gray-200 max-w-[180px] truncate">{e.event}</td>
              <td className="px-5 py-3 text-right text-gray-400">{usd(e.totalCost)}</td>
              <td className="px-5 py-3 text-right text-gray-300">{usd(e.revenue)}</td>
              <td
                className={`px-5 py-3 text-right font-semibold ${
                  highlight === "green" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {usd(e.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
