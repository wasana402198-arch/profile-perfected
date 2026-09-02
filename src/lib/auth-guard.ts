/**
 * Route guards for the dashboards (/profile, /admin, /rider).
 *
 * BACKEND: today the identity comes from localStorage (`src/lib/auth.ts`).
 * When Django is wired, replace `readAccount()` with a cached `AUTH.me` read
 * (see src/lib/api/endpoints.ts) — the guard shape below does not change.
 */
import { redirect } from "@tanstack/react-router";

import { ROLE_HOME, readAccount, type AccountRole } from "@/lib/auth";

/** Where the user was heading, so login can bounce them straight back. */
export type RedirectSearch = { redirect?: string };

export const validateRedirectSearch = (search: Record<string, unknown>): RedirectSearch => {
  const raw = search["redirect"];
  // Only same-origin, path-style redirects — never an absolute URL.
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? { redirect: raw } : {};
};

export function requireRole(allowed: AccountRole[]) {
  return ({ location }: { location: { href: string } }) => {
    // These routes render client-side (ssr: false), so localStorage is safe.
    if (typeof window === "undefined") return;

    const account = readAccount();
    if (!account) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (!allowed.includes(account.role)) {
      throw redirect({ to: ROLE_HOME[account.role] });
    }
  };
}
