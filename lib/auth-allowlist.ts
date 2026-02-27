/**
 * Email allowlist for sign-in. Only these domains and explicit emails are allowed.
 * Set AUTH_ALLOWED_DOMAINS (comma-separated, e.g. "ormoni.bio") and
 * AUTH_ALLOWED_EMAILS (comma-separated, e.g. "ericmajinglong@gmail.com") in .env.local.
 */
function getAllowedDomains(): string[] {
  const raw = process.env.AUTH_ALLOWED_DOMAINS ?? "ormoni.bio";
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

function getAllowedEmails(): string[] {
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? "ericmajinglong@gmail.com";
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (getAllowedEmails().includes(normalized)) return true;
  const domain = normalized.split("@")[1];
  if (!domain) return false;
  return getAllowedDomains().includes(domain);
}
