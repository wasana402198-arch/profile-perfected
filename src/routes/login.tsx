import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bike, Crown, Eye, EyeOff, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { VoltScene, VoltStrength } from "@/components/auth/chef-volt";
import { EMAIL_RE, pickLine, useChefVolt } from "@/hooks/use-chef-volt";
import { ROLE_COPY, ROLE_HOME, signIn, type AccountRole } from "@/lib/auth";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Kennedy Moon Grill Account" },
      {
        name: "description",
        content:
          "Sign in to Kennedy Moon Grill — track live charcoal-grilled orders, saved addresses and rider updates in one place.",
      },
      { property: "og:title", content: "Sign In — Kennedy Moon Grill" },
      {
        property: "og:description",
        content: "One account for guests, kitchen staff, delivery riders and admin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

const ROLES: { key: AccountRole; icon: typeof UserRound }[] = [
  { key: "customer", icon: UserRound },
  { key: "admin", icon: ShieldCheck },
  { key: "staff", icon: Crown },
  { key: "rider", icon: Bike },
];

function LoginPage() {
  const navigate = useNavigate();
  const volt = useChefVolt("Welcome back — the charcoal is already glowing.");
  const [role, setRole] = useState<AccountRole>("customer");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (volt.done || isSubmitting) return;
    if (!email.trim()) {
      volt.complain("Enter your username or email first.");
      return;
    }
    if (!pass) {
      volt.complain("A password would help. Even a small one.");
      return;
    }

    setIsSubmitting(true);
    // Keep the pending animation on screen long enough to read, even when the
    // API answers instantly.
    const minPending = new Promise((r) => setTimeout(r, 650));
    try {
      const [account] = await Promise.all([signIn(email, pass, role), minPending]);
      const target = ROLE_HOME[account.role] || ROLE_HOME[role] || "/profile";
      volt.celebrate("Grill's hot. Welcome back to Kennedy Moon Grill!");
      toast.success(`Welcome back, ${account.name}`);
      setTimeout(() => navigate({ to: target }), 900);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as Error)?.message || "Sign in failed";
      if (msg.toLowerCase().includes("approval") || msg.toLowerCase().includes("intezar")) {
        volt.complain("Application under review! Please wait for admin approval.");
      } else {
        volt.complain(msg);
      }
      toast.error(msg);
      setIsSubmitting(false);
    }

  }

  return (
    <VoltScene
      volt={volt}
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="Pick how you're arriving tonight — we'll drop you into the right console."
      footer={
        <>
          New to the grill?{" "}
          <Link to="/signup" className="font-extrabold text-flame hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <p className="mb-2 font-display text-[10px] font-extrabold tracking-[0.2em] text-charcoal/60 uppercase">
            Sign in as
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ROLES.map(({ key, icon: Icon }) => (
              <motion.button
                key={key}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setRole(key);
                  volt.setMoodSafe("watching");
                  volt.say(`${ROLE_COPY[key].label} mode. Console warming up.`);
                }}
                className={cn("role-tile px-2 py-3 text-center", role === key && "role-tile-active")}
              >
                <Icon className={cn("mx-auto h-5 w-5", role === key ? "text-flame" : "text-charcoal/50")} />
                <span className="mt-1.5 block font-display text-[10px] font-extrabold tracking-[0.12em] text-charcoal uppercase">
                  {ROLE_COPY[key].label}
                </span>
              </motion.button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-charcoal/55">{ROLE_COPY[role].tagline}</p>
        </div>

        <label className="auth-field-wrap block">
          <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-charcoal/40" />
          <input
            type="text"
            value={email}
            placeholder="Username or email (e.g. kennedy_admin)"
            className="auth-field"
            autoComplete="username"
            onFocus={() => {
              volt.setTurned(false);
              volt.setMoodSafe("watching");
              volt.say("Username or email first.");
              volt.follow(email);
            }}
            onChange={(e) => {
              setEmail(e.target.value);
              volt.follow(e.target.value);
              if (e.target.value.trim().length > 2) {
                volt.setMoodSafe("happy");
              } else {
                volt.setMoodSafe("watching");
              }
            }}
          />
        </label>

        <div>
          <label className="auth-field-wrap block">
            <Lock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-charcoal/40" />
            <input
              type={showPass ? "text" : "password"}
              value={pass}
              placeholder="Password"
              className="auth-field pr-12"
              autoComplete="current-password"
              onFocus={() => {
                volt.setMoodSafe("shy");
                volt.setTurned(true);
                volt.resetLook();
                volt.say("A secret? Say no more. *turns around*");
              }}
              onBlur={(e) => {
                if ((e.relatedTarget as HTMLElement | null)?.dataset?.["peek"]) return;
                volt.setTurned(false);
              }}
              onChange={(e) => {
                setPass(e.target.value);
                volt.scorePassword(e.target.value);
              }}
            />
            <button
              type="button"
              data-peek="1"
              aria-label={showPass ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-4 -translate-y-1/2 text-charcoal/45 transition hover:text-flame"
              onClick={() => {
                setShowPass((s) => !s);
                if (!showPass) volt.say("Revealing it? Good thing I'm facing the wall.");
              }}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </label>
          <VoltStrength volt={volt} />
        </div>

        <button
          ref={volt.btnRef}
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn("auth-cta", isSubmitting && "btn-pending")}
          onMouseEnter={() => volt.hype(true)}
          onMouseLeave={() => volt.hype(false)}
          onFocus={() => volt.hype(true)}
          onBlur={() => volt.hype(false)}
          onPointerDown={() => {
            volt.setPressedMood(true);
            volt.say(pickLine(["Ahh. That's the stuff.", "Mmm. Satisfying.", "Beep. Do that again."]));
          }}
          onPointerUp={() => volt.setPressedMood(false)}
        >
          {isSubmitting ? <span className="btn-spinner" aria-hidden /> : <span aria-hidden>🍕</span>}
          {isSubmitting ? (
            <span className="btn-dots">Checking your pass</span>
          ) : volt.done ? (
            "Order up ✓"
          ) : (
            `Enter ${ROLE_COPY[role].destination}`
          )}
        </button>
      </form>
    </VoltScene>
  );
}
