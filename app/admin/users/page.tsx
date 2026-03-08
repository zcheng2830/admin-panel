import { asRows } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

import { RecordTable } from "@/app/admin/components/record-table";

export default async function AdminUsersPage() {
  const { supabase } = await requireSuperadmin();

  const { data, error } = await supabase.from("profiles").select("*").limit(500);
  const rows = asRows(data);

  const superadminCount = rows.filter((row) => row.is_superadmin === true).length;

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Profiles</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Users & Profiles (read-only)</h2>
        <p className="mt-3 text-sm text-slate-600">
          {rows.length} profiles loaded. {superadminCount} currently marked as superadmin.
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error.message}
          </p>
        ) : null}
      </section>

      <RecordTable
        rows={rows}
        preferredColumns={[
          "id",
          "email",
          "full_name",
          "username",
          "is_superadmin",
          "created_at",
          "updated_at",
        ]}
        emptyMessage="No profile rows were returned from Supabase."
      />
    </main>
  );
}
