import Link from "next/link";

type PaginationControlsProps = {
  basePath: string;
  page: number;
  pageSize: number;
  totalCount: number;
  extraParams?: Record<string, string | undefined>;
  itemLabel?: string;
};

function sanitizePage(value: number) {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }

  return Math.floor(value);
}

function createHref(
  basePath: string,
  page: number,
  pageSize: number,
  extraParams: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(extraParams)) {
    if (typeof value === "string" && value.trim()) {
      params.set(key, value);
    }
  }

  params.set("page", String(page));
  params.set("limit", String(pageSize));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function navLink(
  enabled: boolean,
  href: string,
  label: string,
) {
  if (!enabled) {
    return (
      <span className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-400">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}

export function PaginationControls({
  basePath,
  page,
  pageSize,
  totalCount,
  extraParams = {},
  itemLabel = "rows",
}: PaginationControlsProps) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const currentPage = Math.min(sanitizePage(page), totalPages);
  const start = totalCount === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const end = totalCount === 0 ? 0 : Math.min(currentPage * safePageSize, totalCount);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/30 bg-white/75 px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-600">
        Page <span className="font-semibold text-slate-900">{currentPage}</span> of{" "}
        <span className="font-semibold text-slate-900">{totalPages}</span>. Showing{" "}
        <span className="font-semibold text-slate-900">{start}</span>-
        <span className="font-semibold text-slate-900">{end}</span> of{" "}
        <span className="font-semibold text-slate-900">{totalCount}</span> {itemLabel}.
      </p>
      <div className="flex items-center gap-2">
        {navLink(
          currentPage > 1,
          createHref(basePath, currentPage - 1, safePageSize, extraParams),
          "Previous",
        )}
        {navLink(
          currentPage < totalPages,
          createHref(basePath, currentPage + 1, safePageSize, extraParams),
          "Next",
        )}
      </div>
    </section>
  );
}
