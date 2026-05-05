import { requireSuperadmin } from "@/lib/auth/guards";

import {
  createTermAction,
  deleteTermAction,
  updateTermAction,
} from "./actions";

type TermsPageProps = {
  searchParams: Promise<{ message?: string; status?: string }>;
};

function feedback(status?: string, message?: string) {
  if (!status) {
    return null;
  }

  if (status === "created") {
    return { tone: "success", text: "Term created." };
  }

  if (status === "updated") {
    return { tone: "success", text: "Term updated." };
  }

  if (status === "deleted") {
    return { tone: "success", text: "Term deleted." };
  }

  return { tone: "error", text: message ?? "Term action failed." };
}

type TermRow = {
  id: string | number;
  term: string | null;
  definition?: string | null;
};

export default async function AdminTermsPage({ searchParams }: TermsPageProps) {
  const params = await searchParams;
  const { supabase } = await requireSuperadmin();
  const { data, error } = await supabase
    .from("terms")
    .select("*")
    .order("term");

  const rows = ((data ?? []) as TermRow[]).filter((row) => row.id !== null && row.id !== undefined);
  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Terms</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Manage Terms</h2>
        <p className="mt-3 text-sm text-slate-600">
          Create, edit, and delete terms with a simple form.
        </p>
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

      <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Add Term</h3>
        <form action={createTermAction} className="mt-4 grid gap-4 md:grid-cols-[240px_1fr_auto]">
          <input
            name="term"
            placeholder="Term"
            required
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
          />
          <input
            name="definition"
            placeholder="Definition (optional)"
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/40 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
            No terms returned.
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={String(row.id)}
              className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm"
            >
              <form action={updateTermAction} className="grid gap-4 md:grid-cols-[240px_1fr_auto]">
                <input type="hidden" name="id" value={String(row.id)} />
                <input
                  name="term"
                  required
                  defaultValue={row.term ?? ""}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                />
                <input
                  name="definition"
                  defaultValue={row.definition ?? ""}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Save
                </button>
              </form>
              <form action={deleteTermAction} className="mt-3">
                <input type="hidden" name="id" value={String(row.id)} />
                <button
                  type="submit"
                  className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Delete
                </button>
              </form>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
