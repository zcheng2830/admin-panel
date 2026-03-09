import { asRows } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

import { updateUserProfileAction } from "./actions";

type UsersPageProps = {
  searchParams: Promise<{ message?: string; q?: string; status?: string }>;
};

function feedback(status?: string, message?: string) {
  if (!status) {
    return null;
  }

  if (status === "updated") {
    return {
      text: "Profile updated.",
      tone: "success" as const,
    };
  }

  return {
    text: message ?? "Update failed.",
    tone: "error" as const,
  };
}

function sanitizeSearch(raw?: string) {
  if (!raw) {
    return "";
  }

  return raw.replace(/[^a-zA-Z0-9@._ -]/g, "").trim();
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  const search = sanitizeSearch(params.q);
  const { supabase } = await requireSuperadmin();

  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  const rows = asRows(data);
  const superadminCount = rows.filter((row) => row.is_superadmin === true).length;
  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Profiles</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Users & Profiles</h2>
        <p className="mt-3 text-sm text-slate-600">
          {rows.length} profiles loaded. {superadminCount} currently marked as superadmin.
        </p>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
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

      {banner ? (
        <section
          className={`rounded-2xl p-4 text-sm ${
            banner.tone === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {banner.text}
        </section>
      ) : null}

      <section className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/20 bg-white/70 p-6 text-sm text-slate-600 shadow-sm backdrop-blur">
            No profile rows were returned from Supabase.
          </div>
        ) : (
          rows.map((row, index) => {
            const id = typeof row.id === "string" ? row.id : "";
            const email = typeof row.email === "string" ? row.email : "(no e-mail)";
            const fullName = typeof row.full_name === "string" ? row.full_name : "";
            const isSuperadmin = row.is_superadmin === true;
            const hasEditableId = id.length > 0;

            return (
              <article
                key={`${id || "profile"}-${index}`}
                className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-slate-900">{email}</p>
                  <p className="text-xs text-slate-500">id: {id || "(missing id)"}</p>
                </div>

                {hasEditableId ? (
                  <form action={updateUserProfileAction} className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr_auto] lg:items-end">
                    <input type="hidden" name="id" value={id} />
                    <label className="space-y-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      Full Name
                      <input
                        name="full_name"
                        defaultValue={fullName}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                      />
                    </label>
                    <label className="space-y-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      Superadmin
                      <select
                        name="is_superadmin"
                        defaultValue={isSuperadmin ? "true" : "false"}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-800"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Cannot update this profile because no `id` column was returned.
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
