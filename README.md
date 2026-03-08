## AlmostCrackd Admin Panel

Next.js admin interface for Supabase data, including:

- `/admin` dashboard with data insights and activity stats
- `/admin/users` read-only profiles view
- `/admin/images` create/read/update/delete image rows
- `/admin/captions` read-only caption explorer

All `/admin/*` routes are protected by:

1. Google authentication
2. `profiles.is_superadmin = true`

No RLS policy changes are required.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Optional: set environment variables (defaults are already wired to the provided project credentials):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://secure.almostcrackd.ai
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_M_xswaAEKZTJj9BCPkBxTA_2rfpKam8
```

3. Run locally:

```bash
npm run dev
```

## Auth Requirements

- Enable Google provider in Supabase Auth settings.
- Add your local/staging callback URLs to Supabase Auth redirect allow list:

```text
http://localhost:3000/auth/callback
https://secure.almostcrackd.ai/auth/callback
```

## Avoiding Superadmin Lockout

If no one is superadmin yet, promote your own profile out-of-band once (SQL editor or migration run with elevated DB role):

```sql
update profiles
set is_superadmin = true
where email = 'your-google-email@example.com';
```

After this, sign in with that Google account and you can access `/admin`.

