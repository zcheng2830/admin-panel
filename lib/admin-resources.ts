export type AdminResourceMode = "read" | "update" | "crud";

export type AdminResourceConfig = {
  slug: string;
  label: string;
  subtitle: string;
  table: string;
  mode: AdminResourceMode;
  limit?: number;
  preferredColumns?: string[];
};

const ADMIN_RESOURCES: readonly AdminResourceConfig[] = [
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
    slug: "humor-mix",
    label: "Humor Mix",
    subtitle: "Read / update",
    table: "humor_mix",
    mode: "update",
    preferredColumns: ["id", "name", "weight", "updated_at"],
  },
  {
    slug: "example-captions",
    label: "Example Captions",
    subtitle: "Create / read / update / delete",
    table: "example_captions",
    mode: "crud",
    preferredColumns: ["id", "caption", "humor_flavor_id", "created_at", "updated_at"],
  },
  {
    slug: "terms",
    label: "Terms",
    subtitle: "Create / read / update / delete",
    table: "terms",
    mode: "crud",
    preferredColumns: ["id", "term", "category", "created_at", "updated_at"],
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
    slug: "allowed-signup-domains",
    label: "Allowed Signup Domains",
    subtitle: "Create / read / update / delete",
    table: "allowed_signup_domains",
    mode: "crud",
    preferredColumns: ["id", "domain", "created_at", "updated_at"],
  },
  {
    slug: "whitelisted-email-addresses",
    label: "Whitelisted E-mail Addresses",
    subtitle: "Create / read / update / delete",
    table: "whitelisted_email_addresses",
    mode: "crud",
    preferredColumns: ["id", "email", "created_at", "updated_at"],
  },
] as const;

export function getAdminResources() {
  return ADMIN_RESOURCES;
}

export function getAdminResourceConfig(slug: string) {
  return ADMIN_RESOURCES.find((resource) => resource.slug === slug) ?? null;
}
