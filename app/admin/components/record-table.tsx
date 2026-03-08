import { deriveColumns, formatCell, type DataRow } from "@/lib/admin-utils";

type RecordTableProps = {
  rows: DataRow[];
  preferredColumns?: string[];
  emptyMessage?: string;
};

export function RecordTable({
  rows,
  preferredColumns = [],
  emptyMessage = "No data found.",
}: RecordTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-white/70 p-6 text-sm text-slate-600 shadow-sm backdrop-blur">
        {emptyMessage}
      </div>
    );
  }

  const columns = deriveColumns(rows, preferredColumns, 10);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/85 shadow-sm backdrop-blur">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200/70 text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-200">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 bg-white/70 text-slate-700">
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${rowIndex}-${column}`} className="max-w-xs px-4 py-3 align-top">
                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                      {formatCell(row[column])}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
