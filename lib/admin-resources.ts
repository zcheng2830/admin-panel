export type AdminResourceMode = "read" | "update" | "crud";

export type AdminResourceConfig = {
  slug: string;
  label: string;
  subtitle: string;
  table: string;
  mode: AdminResourceMode;
  limit?: number;
  preferredColumns?: string[];
  hiddenColumns?: string[];
};

export type AdminTableLink = {
  href: string;
  label: string;
  subtitle: string;
  table: string;
};

export const PRIMARY_ADMIN_LINKS: readonly AdminTableLink[] = [
  { href: "/admin/dashboard", label: "Dashboard", subtitle: "Activity & trends", table: "" },
  { href: "/admin/users", label: "Users", subtitle: "Profiles (read-only)", table: "profiles" },
  {
    href: "/admin/images",
    label: "Images",
    subtitle: "Create / read / update / delete + upload",
    table: "images",
  },
  {
    href: "/admin/captions",
    label: "Captions",
    subtitle: "Read & quality checks",
    table: "captions",
  },
  {
    href: "/admin/terms",
    label: "Terms",
    subtitle: "Create / read / update / delete",
    table: "terms",
  },
  { href: "/admin/humor-mix", label: "Humor Mix", subtitle: "Read / update", table: "humor_mix" },
];

const ADMIN_RESOURCES: readonly AdminResourceConfig[] = [
  {
    slug: "caption-votes",
    label: "Caption Votes",
    subtitle: "Read-only",
    table: "caption_votes",
    mode: "read",
    preferredColumns: ["id", "caption_id", "profile_id", "user_id", "vote_value", "created_at"],
  },
  {
    slug: "caption-likes",
    label: "Caption Likes",
    subtitle: "Read-only",
    table: "caption_likes",
    mode: "read",
    preferredColumns: ["id", "caption_id", "profile_id", "user_id", "created_at"],
  },
  {
    slug: "caption-saved",
    label: "Saved Captions",
    subtitle: "Read-only",
    table: "caption_saved",
    mode: "read",
    preferredColumns: ["id", "caption_id", "profile_id", "user_id", "created_at"],
  },
  {
    slug: "reported-captions",
    label: "Reported Captions",
    subtitle: "Read-only",
    table: "reported_captions",
    mode: "read",
    preferredColumns: ["id", "caption_id", "profile_id", "reason", "status", "created_at"],
  },
  {
    slug: "humor-flavors",
    label: "Humor Flavors",
    subtitle: "Read-only",
    table: "humor_flavors",
    mode: "read",
    preferredColumns: ["id", "name", "slug", "description", "created_at", "updated_at"],
  },
  {
    slug: "humor-flavor-steps",
    label: "Humor Flavor Steps",
    subtitle: "Read-only",
    table: "humor_flavor_steps",
    mode: "read",
    preferredColumns: [
      "id",
      "humor_flavor_id",
      "step",
      "position",
      "created_at",
      "updated_at",
    ],
  },
  {
    slug: "example-captions",
    label: "Example Captions",
    subtitle: "Create / read / update / delete",
    table: "example_captions",
    mode: "crud",
    preferredColumns: ["id", "caption", "humor_flavor_id", "created_at", "updated_at"],
    hiddenColumns: ["created_by_user_id", "updated_by_user_id"],
  },
  {
    slug: "term-types",
    label: "Term Types",
    subtitle: "Read-only",
    table: "term_types",
    mode: "read",
    preferredColumns: ["id", "name", "slug", "description", "created_at", "updated_at"],
  },
  {
    slug: "caption-requests",
    label: "Caption Requests",
    subtitle: "Read-only",
    table: "caption_requests",
    mode: "read",
    preferredColumns: ["id", "profile_id", "image_id", "status", "created_at"],
  },
  {
    slug: "caption-examples",
    label: "Caption Examples",
    subtitle: "Create / read / update / delete",
    table: "caption_examples",
    mode: "crud",
    preferredColumns: ["id", "caption", "caption_request_id", "created_at", "updated_at"],
    hiddenColumns: ["created_by_user_id", "updated_by_user_id"],
  },
  {
    slug: "llm-models",
    label: "LLM Models",
    subtitle: "Create / read / update / delete",
    table: "llm_models",
    mode: "crud",
    preferredColumns: ["id", "name", "provider_id", "created_at", "updated_at"],
  },
  {
    slug: "llm-providers",
    label: "LLM Providers",
    subtitle: "Create / read / update / delete",
    table: "llm_providers",
    mode: "crud",
    preferredColumns: ["id", "name", "slug", "created_at", "updated_at"],
  },
  {
    slug: "llm-prompt-chains",
    label: "LLM Prompt Chains",
    subtitle: "Read-only",
    table: "llm_prompt_chains",
    mode: "read",
    preferredColumns: ["id", "name", "version", "created_at", "updated_at"],
  },
  {
    slug: "llm-responses",
    label: "LLM Responses",
    subtitle: "Read-only",
    table: "llm_responses",
    mode: "read",
    preferredColumns: ["id", "provider", "model", "created_at"],
  },
  {
    slug: "allowed-domains",
    label: "Allowed Signup Domains",
    subtitle: "Create / read / update / delete",
    table: "allowed_signup_domains",
    mode: "crud",
    preferredColumns: ["id", "domain", "created_at", "updated_at"],
  },
  {
    slug: "whitelisted-emails",
    label: "Whitelisted E-mail Addresses",
    subtitle: "Create / read / update / delete",
    table: "whitelisted_emails",
    mode: "crud",
    preferredColumns: ["id", "email", "created_at", "updated_at"],
  },
] as const;

const RESOURCE_ALIASES = new Map([
  ["allowed-signup-domains", "allowed-domains"],
  ["whitelisted-email-addresses", "whitelisted-emails"],
]);

export function getAdminResources() {
  return ADMIN_RESOURCES;
}

export function getAdminResourceConfig(slug: string) {
  const normalizedSlug = RESOURCE_ALIASES.get(slug) ?? slug;
  return ADMIN_RESOURCES.find((resource) => resource.slug === normalizedSlug) ?? null;
}

export function getDomainModelTables() {
  const primaryTables = PRIMARY_ADMIN_LINKS.filter((link) => link.table);
  const resourceTables = ADMIN_RESOURCES.map((resource) => ({
    href: `/admin/${resource.slug}`,
    label: resource.label,
    subtitle: resource.subtitle,
    table: resource.table,
  }));

  return [...primaryTables, ...resourceTables];
}
