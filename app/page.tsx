import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_#f8fafc_50%,_#ffffff)] px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/60 bg-white/80 p-8 shadow-lg backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">AlmostCrackd</p>
        <h1 className="mt-2 text-4xl font-semibold text-slate-900">Admin Area</h1>
        <p className="mt-4 text-sm text-slate-600">
          Protected admin routes are available at <code>/admin</code>. Access requires Google auth and
          a profile flagged as superadmin.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open admin
          </Link>
          <Link
            href="/auth/login"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Google sign-in
          </Link>
        </div>
      </div>
    </main>
  );
}
