import { isMissingSchemaError } from "@/lib/admin-utils";
import { requireSuperadmin } from "@/lib/auth/guards";

import {
  createWhitelistedEmailAction,
  deleteWhitelistedEmailAction,
  updateWhitelistedEmailAction,
} from "./actions";

type WhitelistedEmailsPageProps = {
  searchParams: Promise<{ message?: string; status?: string }>;
};

type EmailRow = {
  email: string | null;
  id: string | number;
};

type DomainRow = {
  apex_domain?: string | null;
  domain?: string | null;
  id: string | number;
};

function feedback(status?: string, message?: string) {
  if (!status) {
    return null;
  }

  if (status === "created") {
    return { tone: "success", text: "Whitelisted email created." };
  }

  if (status === "updated") {
    return { tone: "success", text: "Whitelisted email updated." };
  }

  if (status === "deleted") {
    return { tone: "success", text: "Whitelisted email deleted." };
  }

  return { tone: "error", text: message ?? "Whitelisted email action failed." };
}

export default async function AdminWhitelistedEmailsPage({
  searchParams,
}: WhitelistedEmailsPageProps) {
  const params = await searchParams;
  const { supabase } = await requireSuperadmin();
  let tableAvailable = true;
  let { data, error } = await supabase
    .from("whitelisted_emails")
    .select("id, email")
    .order("email");

  if (isMissingSchemaError(error)) {
    tableAvailable = false;
    data = [];
    error = null;
  }

  const rows = ((data ?? []) as EmailRow[]).filter(
    (row) => row.id !== null && row.id !== undefined,
  );
  const shouldShowDomainFallback = !tableAvailable || rows.length === 0;
  const { data: domainData, count: domainCount } = shouldShowDomainFallback
    ? await supabase
        .from("allowed_signup_domains")
        .select("*", { count: "exact" })
        .order("apex_domain")
    : { data: null, count: null };
  const domainRows = ((domainData ?? []) as DomainRow[]).filter(
    (row) => row.id !== null && row.id !== undefined,
  );
  const banner = feedback(params.status, params.message);

  return (
    <main className="space-y-5">
      <section className="rounded-3xl border border-white/40 bg-white/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Whitelisted Emails
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Manage Whitelisted E-mail Addresses
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          Add, edit, and delete the e-mail addresses allowed through the signup gate.
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

      {tableAvailable ? (
        <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Add Whitelisted Email</h3>
          <form action={createWhitelistedEmailAction} className="mt-4 flex flex-wrap gap-4">
            <input
              name="email"
              type="email"
              placeholder="user@example.com"
              required
              className="min-w-64 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Add
            </button>
          </form>
        </section>
      ) : null}

      <section className="space-y-4">
        {rows.length === 0 ? (
          <section className="rounded-3xl border border-white/40 bg-white/80 p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Signup Allowlist Domains
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {tableAvailable
                    ? "No individual e-mail overrides yet, so this view shows the active domain allowlist."
                    : "This schema exposes signup allowlisting as domains, so this view reads the active domain allowlist."}
                </p>
              </div>
              <p className="text-sm text-slate-500">
                {domainCount ?? domainRows.length} domains
              </p>
            </div>
            {domainRows.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No signup allowlist records yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {domainRows.map((domain) => (
                  <article
                    key={String(domain.id)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {domain.apex_domain ?? domain.domain ?? domain.id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">allowed_signup_domains</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          rows.map((row) => (
            <article
              key={String(row.id)}
              className="rounded-3xl border border-white/40 bg-white/85 p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-900">{row.email ?? row.id}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={updateWhitelistedEmailAction} className="flex flex-wrap gap-3">
                  <input type="hidden" name="id" value={String(row.id)} />
                  <input
                    name="email"
                    type="email"
                    defaultValue={row.email ?? ""}
                    required
                    className="min-w-64 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-800"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Save
                  </button>
                </form>
                <form action={deleteWhitelistedEmailAction}>
                  <input type="hidden" name="id" value={String(row.id)} />
                  <button
                    type="submit"
                    className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
