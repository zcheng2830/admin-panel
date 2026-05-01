## AlmostCrackd Admin Panel

Next.js admin interface for Supabase data, including:

- `/admin` redirecting to `/admin/dashboard`
- `/admin/dashboard` with analytics, charts, and activity stats
- `/admin/users` read-only profile explorer (reads from `profiles`)
- `/admin/images` create/read/update/delete image rows + storage uploads
- `/admin/captions` read-only caption explorer with `image_id` filtering and per-page caption rating statistics
- Pagination controls on major data pages (`users`, `images`, `captions`, and `/admin/[resource]`)
- Additional resource sections under `/admin/*`:
  - Read-only: `humor_flavors`, `humor_flavor_steps`, `caption_requests`, `llm_prompt_chains`, `llm_responses`
  - Read/update: `humor_mix`
  - CRUD: `example_captions`, `terms`, `caption_examples`, `llm_models`, `llm_providers`, `allowed_signup_domains`, `whitelisted_email_addresses`

All `/admin/*` routes are protected by:

1. Google authentication
2. `profiles.is_superadmin = true`

Admin APIs are available at `/api/admin/*` and require:

1. `Authorization: Bearer <supabase_access_token>`
2. Google-authenticated user
3. `profiles.is_superadmin = true`

All API DB/storage operations run with the server-side Supabase Service Role key after
the caller has been verified.

Supabase Edge Functions are also included under `supabase/functions/*` for homework flows that
explicitly require an Edge Function server layer.

No RLS policy changes are required.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
# Use either publishable-key naming or anon-key naming:
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
# Optional: force OAuth callback origin instead of runtime origin (useful behind proxies)
# NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN=https://your-admin-frontend-domain.com
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# For Edge Functions:
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=your-anon-key
BOOTSTRAP_SETUP_TOKEN=one-time-secret-token
```

If this admin app should connect to the sibling `hello-world` project, point both
projects to the same Supabase project URL and client key.

3. Run locally:

```bash
npm run dev
```

## Auth Requirements

- Enable Google provider in Supabase Auth settings.
- Add callback URLs to Supabase Auth redirect allow list:

```text
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
https://your-admin-project.vercel.app/auth/callback
https://your-custom-domain.com/auth/callback
```

If your Vercel domain is missing here, OAuth may redirect to another configured site URL.

### OAuth Redirect Troubleshooting

If Google login keeps redirecting to an unexpected domain (for example `https://www.almostcrackd.ai`):

1. Check Supabase Auth `Site URL` and `Redirect URLs` in your project dashboard.
2. Ensure your current frontend origin is listed (local + production).
3. Ensure your frontend is using the correct Supabase project URL/key pair for this environment.
4. Ensure Google OAuth authorized redirect URIs match your Supabase project callback URLs.
5. If you see `{"error":"requested path is invalid"}` at a URL like `https://secure.<your-domain>/?code=...`, you landed on the Supabase API gateway root, not your frontend app. Set `Site URL` to your frontend domain and include `/auth/callback` in redirect allow list.
6. If your runtime origin can vary (proxy/IP/preview), set `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN` to a stable allowed frontend origin.

## Admin API Endpoints

- `GET /api/admin/dashboard`
- `GET /api/admin/users` (supports `limit`, `offset`, `search`)
- `PATCH /api/admin/users/:id`
- `GET /api/admin/images` (supports `limit`, `offset`, `search`, `user_id`, `bucket`)
- `POST /api/admin/images`
- `PATCH /api/admin/images/:id`
- `DELETE /api/admin/images/:id`
- `GET /api/admin/captions` (supports `limit`, `offset`, `image_id`)

## Supabase Edge Functions

Added functions:

- `supabase/functions/admin/index.ts`
- `supabase/functions/bootstrap-set-superadmin/index.ts`

`admin` routes (all require bearer JWT + Google user + `profiles.is_superadmin = true`):

- `GET /functions/v1/admin/users`
- `PATCH /functions/v1/admin/users/:id`
- `GET /functions/v1/admin/images`
- `POST /functions/v1/admin/images`
- `PATCH /functions/v1/admin/images/:id`
- `DELETE /functions/v1/admin/images/:id`
- `GET /functions/v1/admin/captions`
- `GET /functions/v1/admin/stats`

`bootstrap-set-superadmin` (one-time, secret-guarded):

- `POST /functions/v1/bootstrap-set-superadmin`
- Required header: `X-Setup-Token: <BOOTSTRAP_SETUP_TOKEN>`
- Body: `{ "email": "you@example.com" }` or `{ "user_id": "<uuid>" }`

## Avoiding Superadmin Lockout

If no one is superadmin yet, promote your own profile out-of-band once (SQL editor or migration run with elevated DB role):

```sql
update profiles
set is_superadmin = true
where email = 'your-google-email@example.com';
```

After this, sign in with that Google account and you can access `/admin`.
