interface AccountPerformance {
  account: string;
  count: number;
  revenue: number;
  profit: number;
}

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AccountTable({ data }: { data: AccountPerformance[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
        No account data yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">Account</th>
            <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Tickets</th>
            <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Revenue</th>
            <th className="text-right px-5 py-2.5 text-xs text-gray-500 font-medium">Profit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a, i) => (
            <tr key={i} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
              <td className="px-5 py-3 text-gray-200">{a.account}</td>
              <td className="px-5 py-3 text-right text-gray-400">{a.count}</td>
              <td className="px-5 py-3 text-right text-gray-300">{usd(a.revenue)}</td>
              <td
                className={`px-5 py-3 text-right font-semibold ${
                  a.profit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {usd(a.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
