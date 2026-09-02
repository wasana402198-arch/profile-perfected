import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  Bike,
  IdCard,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Star,
  UserPlus,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  CHART,
  DonutChart,
  Field,
  fieldClass,
  GhostButton,
  GoldButton,
  Legendette,
  Panel,
  SectionTitle,
  StatCard,
} from "@/components/admin/bits";
import {
  dateTime,
  money,
  riderDaySeries,
  riderQueue,
  saveRider,
  setCurrentRider,
  useAdmin,
  type Rider,
} from "@/lib/admin-store";
import {
  useSetRiderLocationMutation,
  useSetRiderStatusMutation,
} from "@/hooks/use-order-mutations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rider/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rider Profile & Verification — Kennedy Moon Grill" },
      {
        name: "description",
        content:
          "Create or update your delivery rider profile: bike details, CNIC, zone, live location sharing and verification status.",
      },
      { property: "og:title", content: "Rider Profile — Kennedy Moon Grill" },
      {
        property: "og:description",
        content: "Register as a Kennedy delivery partner and manage your verification details.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiderProfile,
});

const ZONES = ["Kacheri Road", "Model Town", "Zafarwal Road", "Circular Road", "Muradpur"];

type Form = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  bike: string;
  plate: string;
  cnic: string;
  zone: string;
};

const empty: Form = {
  name: "",
  phone: "",
  email: "",
  bike: "",
  plate: "",
  cnic: "",
  zone: ZONES[0]!,
};

function RiderProfile() {
  const state = useAdmin();
  const rider = state.riders.find((r) => r.id === state.currentRiderId) ?? null;
  const statusMutation = useSetRiderStatusMutation();
  const locationMutation = useSetRiderLocationMutation();
  const [mode, setMode] = useState<"edit" | "new">("edit");
  const [form, setForm] = useState<Form>(empty);

  useEffect(() => {
    if (mode === "edit" && rider) {
      setForm({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        email: rider.email,
        bike: rider.bike,
        plate: rider.plate,
        cnic: rider.cnic,
        zone: rider.zone,
      });
    }
    if (mode === "new") setForm(empty);
  }, [mode, rider]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    if (!form.name.trim() || !/^[0-9+\-\s]{10,}$/.test(form.phone)) {
      toast.error("Name and a valid phone number are required");
      return;
    }
    const id = await saveRider({ ...form, name: form.name.trim(), phone: form.phone.trim() });
    if (id) {
      setCurrentRider(id);
      setMode("edit");
      toast.success(
        mode === "new" ? "Profile created — waiting for owner verification" : "Profile updated",
      );
    }
  };

  const queue = rider ? riderQueue(state, rider.id) : null;
  const week = rider ? riderDaySeries(state.orders, rider.id, 7) : [];
  const codShare = queue
    ? queue.completed.filter((o) => o.payment.method === "cod").length
    : 0;
  const onlineShare = queue ? queue.completed.length - codShare : 0;

  const shareLocation = () => {
    if (!rider) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ok = await locationMutation
          .mutateAsync({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
          .then(() => true)
          .catch(() => false);
        if (ok) {
          toast.success("Live location shared");
        }
      },
      () => toast.error("Location permission denied"),
      { enableHighAccuracy: true },
    );
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Delivery partner"
        title="Rider profile"
        subtitle="Register as a Kennedy delivery partner, keep your bike and CNIC details current, and control live location sharing."
        action={
          <div className="flex gap-2">
            <GhostButton onClick={() => setMode("edit")} className={cn(mode === "edit" && "text-lux")}>
              Edit mine
            </GhostButton>
            <GoldButton onClick={() => setMode("new")}>
              <UserPlus className="h-3.5 w-3.5" /> New profile
            </GoldButton>
          </div>
        }
      />

      {rider ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Deliveries"
            value={rider.deliveries}
            tone="gold"
            icon={<Bike className="h-4 w-4" />}
            series={week.map((w) => w.drops)}
          />
          <StatCard
            label="Earnings"
            value={money(rider.earnings)}
            tone="good"
            icon={<Wallet className="h-4 w-4" />}
            series={week.map((w) => w.earnings)}
          />
          <StatCard
            label="Rating"
            value={rider.rating ? rider.rating.toFixed(1) : "—"}
            tone="info"
            icon={<Star className="h-4 w-4" />}
          />
          <StatCard
            label="Verification"
            value={rider.verified ? "Verified" : "Pending"}
            hint={`Joined ${dateTime(rider.joinedAt)}`}
            tone={rider.verified ? "good" : "bad"}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title={mode === "new" ? "Create rider profile" : "Profile details"}
          subtitle="Owner verifies every new partner before jobs are offered."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Adeel Hussain"
              />
            </Field>
            <Field label="Phone">
              <input
                className={fieldClass}
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="0300 1122 334"
              />
            </Field>
            <Field label="Email">
              <input
                className={fieldClass}
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="rider@moongrill.pk"
              />
            </Field>
            <Field label="CNIC">
              <input
                className={fieldClass}
                value={form.cnic}
                onChange={(e) => set({ cnic: e.target.value })}
                placeholder="34603-1234567-8"
              />
            </Field>
            <Field label="Bike">
              <input
                className={fieldClass}
                value={form.bike}
                onChange={(e) => set({ bike: e.target.value })}
                placeholder="Honda CD 70"
              />
            </Field>
            <Field label="Number plate">
              <input
                className={fieldClass}
                value={form.plate}
                onChange={(e) => set({ plate: e.target.value })}
                placeholder="NRL-4412"
              />
            </Field>
            <Field label="Delivery zone" className="sm:col-span-2">
              <select
                className={fieldClass}
                value={form.zone}
                onChange={(e) => set({ zone: e.target.value })}
              >
                {ZONES.map((z) => (
                  <option key={z} value={z} className="bg-ink text-frost">
                    {z}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <GoldButton onClick={submit}>
              <Save className="h-3.5 w-3.5" />
              {mode === "new" ? "Create profile" : "Save changes"}
            </GoldButton>
            {rider ? (
              <>
                <GhostButton
                  onClick={async () => {
                    const nextStatus = rider.status === "online" ? "offline" : "online";
                    const ok = await statusMutation
                      .mutateAsync({ status: nextStatus })
                      .then(() => true)
                      .catch(() => false);
                    if (ok) {
                      toast.success(`Status updated to ${nextStatus}`);
                    }
                  }}
                  disabled={statusMutation.isPending}
                >
                  {rider.status === "online" ? "Go offline" : "Go online"}
                </GhostButton>
                <GhostButton onClick={shareLocation} disabled={locationMutation.isPending}>
                  <MapPin className="h-3.5 w-3.5" /> Share live location
                </GhostButton>
                <GhostButton
                  onClick={async () => {
                    const ok = await locationMutation
                      .mutateAsync({ location: null })
                      .then(() => true)
                      .catch(() => false);
                    if (ok) {
                      toast.success("Stopped sharing location");
                    }
                  }}
                  disabled={locationMutation.isPending}
                >
                  Stop sharing
                </GhostButton>
              </>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Verification record" subtitle="What the owner sees on your file">
            {!rider ? (
              <p className="text-sm text-slate-dim">Create a profile to open a record.</p>
            ) : (
              <ul className="space-y-3 text-xs">
                <Line icon={<IdCard className="h-4 w-4" />} label="CNIC" value={rider.cnic || "—"} />
                <Line icon={<Bike className="h-4 w-4" />} label="Bike" value={`${rider.bike} · ${rider.plate}`} />
                <Line icon={<Phone className="h-4 w-4" />} label="Phone" value={rider.phone} />
                <Line icon={<MapPin className="h-4 w-4" />} label="Zone" value={rider.zone} />
                <Line
                  icon={<BadgeCheck className="h-4 w-4" />}
                  label="Status"
                  value={rider.verified ? "Verified by owner" : "Awaiting owner verification"}
                />
                <Line
                  icon={<MapPin className="h-4 w-4" />}
                  label="Location"
                  value={
                    rider.location?.sharing
                      ? `${rider.location.lat.toFixed(4)}, ${rider.location.lng.toFixed(4)} · ${dateTime(rider.location.at)}`
                      : "Not sharing"
                  }
                />
              </ul>
            )}
          </Panel>

          <Panel title="Payment mix" subtitle="How your deliveries were paid">
            <DonutChart
              data={[
                { name: "Cash on delivery", value: codShare, color: CHART.amber },
                { name: "Prepaid", value: onlineShare, color: CHART.jade },
              ]}
              centerLabel="Drops"
              centerValue={String(codShare + onlineShare)}
            />
            <div className="mt-3">
              <Legendette
                items={[
                  { name: "Cash on delivery", value: String(codShare), color: CHART.amber },
                  { name: "Prepaid", value: String(onlineShare), color: CHART.jade },
                ]}
              />
            </div>
          </Panel>

          <Panel title="Switch partner" subtitle="Demo: preview any rider's console">
            <div className="flex flex-wrap gap-2">
              {state.riders.map((r: Rider) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setCurrentRider(r.id);
                    setMode("edit");
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition",
                    r.id === state.currentRiderId
                      ? "border-lux/50 bg-lux/12 text-lux"
                      : "border-line/70 text-slate-dim hover:text-frost",
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Line({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line/60 bg-ink/40 p-3">
      <span className="text-lux">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-dim">
          {label}
        </span>
        <span className="block break-words text-mist">{value}</span>
      </span>
    </li>
  );
}
