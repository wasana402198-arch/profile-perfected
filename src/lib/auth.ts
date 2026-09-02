import { useEffect, useState } from "react";
import { api, isBackendConfigured, tokens } from "@/lib/api/client";
import { AUTH } from "@/lib/api/endpoints";

export type AccountRole = "customer" | "staff" | "rider" | "admin" | "kitchen";

export type AuthAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: AccountRole;
  status?: "active" | "pending_approval" | "inactive";
  createdAt: string;
};

const KEY = "kmg.auth.v1";
export const AUTH_EVENT = "kmg-auth-change";

export const ROLE_HOME: Record<string, string> = {
  customer: "/profile",
  staff: "/admin/orders",
  kitchen: "/admin/orders",
  admin: "/admin",
  rider: "/rider",
};

export const ROLE_COPY: Record<
  AccountRole,
  { label: string; tagline: string; destination: string }
> = {
  customer: {
    label: "Customer",
    tagline: "Order, track your rider live and keep your favourites",
    destination: "Customer profile",
  },
  rider: {
    label: "Delivery Rider",
    tagline: "Apply to join our fleet — deliver hot meals & earn per drop",
    destination: "Rider console",
  },
  staff: {
    label: "Kitchen Staff",
    tagline: "Kitchen console: manage tickets, cooking and packing",
    destination: "Staff dashboard",
  },
  kitchen: {
    label: "Kitchen Staff",
    tagline: "Kitchen console: manage tickets, cooking and packing",
    destination: "Staff dashboard",
  },
  admin: {
    label: "Owner / Admin",
    tagline: "Owner console: orders, payments, riders and revenue graphs",
    destination: "Owner console",
  },
};

export function readAccount(): AuthAccount | null {
  if (typeof window === "undefined") return null;
  const token = tokens.access();
  if (!token) return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthAccount) : null;
  } catch {
    return null;
  }
}

export function publish(next: AuthAccount | null) {
  if (typeof window === "undefined") return;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else {
      localStorage.removeItem(KEY);
      tokens.clear();
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

type BackendLoginResponse = {
  access: string;
  refresh: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: AccountRole;
    full_name?: string;
  };
};

type BackendSignupResponse = {
  detail: string;
  username: string;
  role?: string;
  status?: string;
};

export async function signIn(usernameOrEmail: string, pass: string, role?: AccountRole): Promise<AuthAccount> {
  if (!isBackendConfigured()) {
    return signInLocal(usernameOrEmail, role);
  }

  const res = await api.post<BackendLoginResponse>(AUTH.login, {
    username: usernameOrEmail.trim(),
    password: pass,
  });

  tokens.set(res.access, res.refresh);

  const u = res.user;
  const rawRole = (u?.role || ((u as { is_superuser?: boolean } | undefined)?.is_superuser ? "admin" : role) || "customer") as AccountRole;
  const account: AuthAccount = {
    id: u?.id ? String(u.id) : `user-${Date.now()}`,
    name: u?.full_name || u?.username || usernameOrEmail.split("@")[0] || "User",
    email: u?.email || (usernameOrEmail.includes("@") ? usernameOrEmail : ""),
    phone: "",
    role: rawRole,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  publish(account);
  return account;
}

export async function signUp(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: AccountRole;
}): Promise<AuthAccount> {
  if (!isBackendConfigured()) {
    return signUpLocal(input);
  }

  const rawName = input.name.trim();
  const cleanUsername = rawName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_@.+-]/g, "") || input.email.split("@")[0];

  const requestedRole = input.role === "staff" ? "kitchen" : input.role;

  const res = await api.post<BackendSignupResponse>(AUTH.register, {
    username: cleanUsername,
    email: input.email.trim().toLowerCase(),
    password: input.password,
    full_name: rawName,
    phone: input.phone.trim(),
    requested_role: requestedRole,
  });

  if (res && res.status === "pending_approval") {
    const pendingAccount: AuthAccount = {
      id: cleanUsername,
      name: rawName,
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      role: (res.role as AccountRole) || input.role,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
    };
    return pendingAccount;
  }

  return signIn(cleanUsername, input.password, input.role);
}


export function signOut() {
  publish(null);
}

export function signUpLocal(input: {
  name: string;
  email: string;
  phone: string;
  role: AccountRole;
}): AuthAccount {
  const account: AuthAccount = {
    id: `acc-${Date.now()}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  publish(account);
  return account;
}

export function signInLocal(email: string, role?: AccountRole): AuthAccount {
  const existing = readAccount();
  const normalized = email.trim().toLowerCase();
  const base: AuthAccount =
    existing && existing.email === normalized
      ? existing
      : {
          id: existing?.id ?? `acc-${Date.now()}`,
          name: existing?.name ?? normalized.split("@")[0] ?? "Guest",
          email: normalized,
          phone: existing?.phone ?? "",
          role: existing?.role ?? "customer",
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
  const account: AuthAccount = { ...base, role: role ?? base.role };
  publish(account);
  return account;
}

export function signOutLocal() {
  signOut();
}

export function useAccount() {
  const [account, setAccount] = useState<AuthAccount | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setAccount(readAccount());
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { account: account ?? null, isLoading: account === undefined };
}
