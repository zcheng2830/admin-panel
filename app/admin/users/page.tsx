import { PaginationControls } from "@/app/admin/components/pagination-controls";
import { RecordTable } from "@/app/admin/components/record-table";
import { asRows } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

type UsersPageProps = {
  searchParams: Promise<{ limit?: string; page?: string; q?: string }>;
};

function sanitizeSearch(raw?: string) {
  if (!raw) {
    return "";
  }

  return raw.replace(/[^a-zA-Z0-9@._ -]/g, "").trim();
}

function parseNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  const search = sanitizeSearch(params.q);
  const page = parseNumber(params.page, 1, 1, 10_000);
  const limit = parseNumber(params.limit, 50, 10, 200);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { supabase } = await requireSuperadmin();

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  const rows = asRows(data);
  const superadminCount = rows.filter((row) => row.is_superadmin === true).length;
  const totalCount = count ?? rows.length;

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">profiles table</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Users (read-only)</h2>
        <p className="mt-3 text-sm text-slate-600">
          {rows.length} profiles loaded on this page. {superadminCount} currently marked as superadmin.
        </p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="limit" value={String(limit)} />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by e-mail or full name"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 sm:max-w-sm"
          />
          <button
            type="submit"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Search
          </button>
        </form>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error.message}
          </p>
        ) : null}
      </section>

      <PaginationControls
        basePath="/admin/users"
        page={page}
        pageSize={limit}
        totalCount={totalCount}
        extraParams={{ q: search }}
        itemLabel="profiles"
      />

      <RecordTable
        rows={rows}
        preferredColumns={["id", "email", "full_name", "is_superadmin", "created_at", "updated_at"]}
        emptyMessage="No profile rows were returned from Supabase."
      />
    </main>
  );
}
