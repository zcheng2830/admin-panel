## AlmostCrackd Admin Panel

Next.js admin interface for Supabase data, including:

- `/admin` dashboard with data insights and activity stats
- `/admin/users` read-only profiles view
- `/admin/images` create/read/update/delete image rows + storage uploads
- `/admin/captions` read-only caption explorer
- Additional resource sections under `/admin/*`:
  - Read-only: `humor_flavors`, `humor_flavor_steps`, `caption_requests`, `llm_prompt_chains`, `llm_responses`
  - Read/update: `humor_mix`
  - CRUD: `example_captions`, `terms`, `caption_examples`, `llm_models`, `llm_providers`, `allowed_signup_domains`, `whitelisted_email_addresses`

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
