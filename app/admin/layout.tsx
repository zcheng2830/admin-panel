import Link from "next/link";

import { getAdminResources } from "@/lib/admin-resources";
import { requireSuperadmin } from "@/lib/auth/guards";

import { SignOutButton } from "./components/sign-out-button";

const NAV_LINKS = [
  { href: "/admin", label: "Overview", subtitle: "Activity & trends" },
  { href: "/admin/users", label: "Users", subtitle: "Profiles (read)" },
  {
    href: "/admin/images",
    label: "Images",
    subtitle: "Create / read / update / delete + upload",
  },
  { href: "/admin/captions", label: "Captions", subtitle: "Read & quality checks" },
  ...getAdminResources().map((resource) => ({
    href: `/admin/${resource.slug}`,
    label: resource.label,
    subtitle: resource.subtitle,
  })),
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSuperadmin();

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#f8fafc,_#e2e8f0_50%,_#dbeafe)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="w-full rounded-3xl border border-white/40 bg-white/70 p-5 shadow-lg backdrop-blur lg:w-80 lg:sticky lg:top-6 lg:h-fit">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              AlmostCrackd
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Admin Control</h1>
            <p className="mt-2 text-sm text-slate-600">{user.email ?? user.id}</p>
          </div>
          <nav className="mt-6 space-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-2xl border border-slate-200/80 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <p className="text-sm font-semibold text-slate-900">{link.label}</p>
                <p className="text-xs text-slate-500">{link.subtitle}</p>
              </Link>
            ))}
          </nav>
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Session protected</p>
            <SignOutButton />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
