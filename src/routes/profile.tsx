import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bike,
  ChevronLeft,
  CreditCard,
  Heart,
  LogOut,
  MapPin,
  Package,
  Phone,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Timer,
  TrendingUp,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { getLocalUser } from "@/hooks/use-session";
import { signOut } from "@/lib/auth";
import {
  ORDER_STAGES,
  PAYMENTS,
  RIDERS,
  loadAddresses,
  type Address,
  type OrderStatusKey,
} from "@/lib/orders";
import { DISHES } from "@/lib/menu";
import { demoTargetFor } from "@/lib/tracking";
import { createOrder, fetchOrders, fetchProfile, type DbOrder } from "@/lib/account";

import { addToCart, dishBySlug, useLikes, useWishlist } from "@/lib/cart";
import { fetchAssignedCaddy, type CaddyStatus } from "@/lib/caddy";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { CaddyCard } from "@/components/profile/CaddyCard";
import { OrderTracking } from "@/components/profile/OrderTracking";
import { useOrderTracking } from "@/hooks/use-order-tracking";




export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile, Orders & Live Tracking — Kennedy Moon Grill" },
      {
        name: "description",
        content:
          "Your Kennedy account hub: live rider map, order stages, payment history, wishlist, liked recipes, notifications and personal stats.",
      },
      { property: "og:title", content: "My Profile — Kennedy Moon Grill" },
      {
        property: "og:description",
        content:
          "Track your rider live, review every payment, and manage your wishlist in one Kennedy dashboard.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const money = (n: number | string) => `Rs ${Number(n).toLocaleString("en-PK")}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const paymentLabel = (id: string) => PAYMENTS.find((p) => p.id === id)?.label ?? id.toUpperCase();
const stageIndex = (key: OrderStatusKey) => ORDER_STAGES.findIndex((s) => s.key === key);
const stageLabel = (key: OrderStatusKey) =>
  ORDER_STAGES.find((s) => s.key === key)?.label ?? "Confirmed";

type AddressWithCoords = DbOrder["address"] & { lat?: number; lng?: number };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live order" },
  { id: "history", label: "History" },
  { id: "addresses", label: "Addresses" },
  { id: "payments", label: "Payments" },
  { id: "saved", label: "Saved" },
  { id: "alerts", label: "Notifications" },
] as const;
type TabId = (typeof TABS)[number]["id"];


function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const wishlist = useWishlist();
  const likes = useLikes();

  useEffect(() => {
    const local = getLocalUser();
    if (!local) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    if (local.role === "admin" || local.role === "staff" || local.role === "kitchen") {
      void navigate({ to: "/admin", replace: true });
      return;
    }
    if (local.role === "rider") {
      void navigate({ to: "/rider", replace: true });
      return;
    }
    setUserId(local.id);
    setEmail(local.email);
    setJoined(local.created_at);
    void loadAddresses().then((addrs) => setSavedAddresses(addrs || []));
  }, [navigate]);


  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", userId],
    queryFn: () => fetchOrders(userId!),
    enabled: !!userId,
    refetchInterval: 20000,
  });

  const caddyStatus: CaddyStatus | null = ordersQuery.data?.some((o) => o.status !== "delivered")
    ? ordersQuery.data.some((o) => o.status === "onway")
      ? "onway"
      : "picking"
    : null;

  const caddyQuery = useQuery({
    queryKey: ["assigned-caddy", userId, caddyStatus],
    queryFn: () => fetchAssignedCaddy(caddyStatus),
    enabled: !!userId && !!caddyStatus,
  });
  const caddy = caddyQuery.data ?? null;


  const orders = ordersQuery.data ?? [];
  const current = useMemo(() => orders.find((o) => o.status !== "delivered"), [orders]);
  const past = useMemo(() => orders.filter((o) => o !== current), [orders, current]);
  const profile = profileQuery.data;

  const spent = orders.reduce((n, o) => n + Number(o.total), 0);
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const avg = orders.length ? Math.round(spent / orders.length) : 0;
  const favouriteDish = useMemo(() => {
    const tally = new Map<string, number>();
    orders.forEach((o) => tally.set(o.dish_name, (tally.get(o.dish_name) ?? 0) + o.qty));
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [orders]);
  const favouritePayment = useMemo(() => {
    const tally = new Map<string, number>();
    orders.forEach((o) => tally.set(o.payment, (tally.get(o.payment) ?? 0) + 1));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? paymentLabel(top) : "—";
  }, [orders]);

  /** Address book = saved addresses + every address ever used on an order. */
  const addressBook = useMemo(() => {
    const map = new Map<string, { address: Address; uses: number; last: string | null }>();
    savedAddresses.forEach((a) => {
      const key = `${a.street}|${a.area}|${a.city}`.toLowerCase();
      map.set(key, { address: a, uses: 0, last: null });
    });
    orders.forEach((o) => {
      const a = o.address;
      if (!a) return;
      const key = `${a.street}|${a.area}|${a.city}`.toLowerCase();
      const found = map.get(key);
      if (found) {
        found.uses += 1;
        if (!found.last || found.last < o.created_at) found.last = o.created_at;
      } else {
        map.set(key, { address: a, uses: 1, last: o.created_at });
      }
    });
    return [...map.values()].sort((a, b) => b.uses - a.uses);
  }, [savedAddresses, orders]);

  /** Payment ledger grouped by method. */
  const paymentSummary = useMemo(
    () =>
      PAYMENTS.map((p) => {
        const rows = orders.filter((o) => o.payment === p.id);
        return {
          ...p,
          count: rows.length,
          total: rows.reduce((n, o) => n + Number(o.total), 0),
        };
      }),
    [orders],
  );

  const notifications = useMemo(
    () =>
      orders.slice(0, 12).map((o) => ({
        id: o.id,
        title:
          o.status === "delivered"
            ? `${o.dish_name} deliver ho gaya`
            : `${stageLabel(o.status)} — ${o.dish_name}`,
        body: `${o.order_code} · ${money(o.total)} · ${paymentLabel(o.payment)}`,
        at: o.created_at,
        live: o.status !== "delivered",
      })),
    [orders],
  );

  const resetLocal = async () => {
    signOut();
    await queryClient.cancelQueries();
    queryClient.clear();
    toast.success("Signed out successfully");
    void navigate({ to: "/login", replace: true });
  };

  const displayName = profile?.full_name || email.split("@")[0] || "Kennedy guest";
  const initials =
    displayName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "K";

  const address = (current?.address ?? null) as AddressWithCoords | null;
  const target = useMemo(
    () =>
      address?.lat != null && address?.lng != null
        ? { lat: address.lat, lng: address.lng }
        : null,
    [address?.lat, address?.lng],
  );

  const onTrackingStatus = useCallback(() => {

    void queryClient.invalidateQueries({ queryKey: ["orders", userId] });
  }, [queryClient, userId]);

  /** Live tracking snapshot (demo sim now, Django stream later). */
  const tracking = useOrderTracking(current ?? null, target, {
    onStatusChange: onTrackingStatus,
  });

  /**
   * Demo-only: spawn a live order so tracking can be reviewed without checkout.
   * Delete once Django creates real orders.
   */
  const startDemoDelivery = useCallback(async () => {
    if (!userId) return;
    const dish = DISHES[Math.floor(Math.random() * DISHES.length)]!;
    const drop = demoTargetFor(`demo-${Date.now()}`);
    await createOrder({
      userId,
      orderCode: `MG-${Math.floor(100000 + Math.random() * 899999)}`,
      dishName: dish.name,
      dishImage: dish.image,
      size: "Regular",
      qty: 1,
      total: Number(String(dish.price).replace(/[^\d]/g, "")) || 1200,

      payment: "cod",
      address: {
        id: `demo-${Date.now()}`,
        label: "Demo drop",
        name: profile?.full_name || "Kennedy guest",
        phone: profile?.phone || "0300-0000000",
        street: "Demo Street 12",
        area: "Circular Road",
        city: "Narowal",
        ...drop,
      } as Address,
      rider: RIDERS[Math.floor(Math.random() * RIDERS.length)]!,
    });
    await queryClient.invalidateQueries({ queryKey: ["orders", userId] });
    toast.success("Demo delivery started", { description: "Caddy aapki taraf nikal gaya." });
  }, [userId, profile?.full_name, profile?.phone, queryClient]);



  return (
    <main className="min-h-screen bg-cream px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.18em] text-charcoal/70 hover:text-flame"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to Kennedy
          </Link>
          <button
            type="button"
            onClick={() => void resetLocal()}
            className="hidden items-center gap-1.5 rounded-full border-2 border-charcoal/12 px-4 py-2 font-display text-[11px] font-extrabold uppercase tracking-[0.16em] text-charcoal/70 hover:border-flame hover:text-flame sm:flex"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Exit
          </button>
        </div>

        {/* hero banner + avatar */}
        <ProfileBanner
          name={displayName}
          email={email}
          joined={joined}
          avatarUrl={avatarPreview || profile?.avatar_url || null}
          stats={[
            { label: "Orders", value: String(orders.length) },
            { label: "Spent", value: money(spent) },
            { label: "Saved", value: String(wishlist.slugs.length + likes.slugs.length) },
          ]}
          onPickAvatar={(file) => {
            setAvatarPreview(URL.createObjectURL(file));
            toast.success("Photo updated on this device");
          }}
        />

        {/* account details — collapsed by default on mobile */}
        <section className="mt-4 overflow-hidden rounded-[1.5rem] border-2 border-charcoal/10">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between gap-3 bg-white/70 px-5 py-3.5 text-left sm:hidden"
          >
            <span className="flex items-center gap-2 font-display text-[11px] font-extrabold uppercase tracking-[0.18em] text-charcoal/70">
              <UserIcon className="h-4 w-4" aria-hidden="true" /> Account details
            </span>
            <span className="font-body text-[11px] text-charcoal/50">
              {detailsOpen ? "Hide" : "Show"}
            </span>
          </button>
          <div
            className={`grid gap-px bg-charcoal/10 sm:grid-cols-3 ${detailsOpen ? "grid" : "hidden sm:grid"}`}
          >
            <Detail icon={<UserIcon className="h-4 w-4" aria-hidden="true" />} label="Name">
              {profile?.full_name || "Added with your first order"}
            </Detail>
            <Detail icon={<Phone className="h-4 w-4" aria-hidden="true" />} label="Phone">
              {profile?.phone || "Added with your first order"}
            </Detail>
            <Detail icon={<MapPin className="h-4 w-4" aria-hidden="true" />} label="Address">
              {[profile?.street, profile?.city].filter(Boolean).join(", ") ||
                "Added with your first order"}
            </Detail>
          </div>
        </section>


        {/* tabs */}
        <nav className="scrollbar-none sticky top-0 z-30 -mx-5 mt-6 flex gap-2 overflow-x-auto bg-cream/95 px-5 py-2 backdrop-blur sm:static sm:mx-0 sm:flex-wrap sm:overflow-visible sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
          {TABS.map((t) => {
            const active = tab === t.id;
            const badge =
              t.id === "live" && current
                ? "1"
                : t.id === "history"
                  ? String(past.length)
                  : t.id === "addresses"
                    ? String(addressBook.length)
                    : t.id === "payments"
                      ? String(orders.length)
                      : t.id === "saved"
                        ? String(wishlist.slugs.length + likes.slugs.length)
                        : t.id === "alerts"
                          ? String(notifications.length)
                          : null;
            return (
              <motion.button
                key={t.id}
                type="button"
                data-sfx="pop"
                whileHover={{ y: -3, rotate: -0.6 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-full border-2 px-4 py-2 font-display text-[11px] font-extrabold uppercase tracking-[0.16em] transition-colors ${
                  active
                    ? "border-flame bg-flame text-cream shadow-[0_10px_22px_-12px_rgba(210,35,31,0.9)]"
                    : "border-charcoal/12 bg-white/60 text-charcoal/65 hover:border-flame hover:text-flame"

                }`}
              >
                {t.label}
                {badge && badge !== "0" && (
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 font-body text-[10px] ${
                      active ? "bg-cream/20" : "bg-charcoal/10"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </motion.button>

            );
          })}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="mt-5"
          >
            {tab === "overview" && (
              <section className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat
                    icon={<Package className="h-4 w-4" aria-hidden="true" />}
                    label="Delivered"
                    value={String(delivered)}
                    hint={`${orders.length - delivered} in progress`}
                  />
                  <Stat
                    icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                    label="Average order"
                    value={money(avg)}
                    hint={`Lifetime ${money(spent)}`}
                  />
                  <Stat
                    icon={<Heart className="h-4 w-4" aria-hidden="true" />}
                    label="Favourite dish"
                    value={favouriteDish}
                    hint="Sabse zyada order"
                  />
                  <Stat
                    icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
                    label="Top payment"
                    value={favouritePayment}
                    hint="Aksar isi se pay karte hain"
                  />
                </div>

                {caddy && (
                  <CaddyCard
                    caddy={caddy}
                    onMessage={() =>
                      toast.info("Chat hooks into POST /api/v1/orders/{id}/caddy/messages/.")
                    }
                  />
                )}


                <div className="rounded-[1.75rem] border-2 border-charcoal/10 bg-white/70 p-5">
                  <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.18em] text-charcoal">
                    Current status
                  </h2>
                  {current ? (
                    <p className="mt-2 font-body text-sm text-charcoal/70">
                      <span className="font-semibold text-flame">
                        {stageLabel(tracking?.status ?? current.status)}
                      </span>{" "}
                      — {current.dish_name} ({current.order_code}), ETA ~
                      {tracking?.etaMinutes ?? current.eta_minutes} min
                      {tracking ? ` · ${tracking.remainingKm.toFixed(2)} km baaki` : ""}.{" "}
                      <button
                        type="button"
                        onClick={() => setTab("live")}
                        className="font-display text-[11px] font-extrabold uppercase tracking-[0.14em] text-flame"
                      >
                        Track live
                      </button>
                    </p>
                  ) : (

                    <p className="mt-2 font-body text-sm text-charcoal/60">
                      Abhi koi active order nahi hai.{" "}
                      <Link to="/" className="font-semibold text-flame">
                        Menu dekhein
                      </Link>
                      .
                    </p>
                  )}
                </div>

                <div className="rounded-[1.75rem] border-2 border-charcoal/10 p-5">
                  <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.18em] text-charcoal">
                    Recent activity
                  </h2>
                  {orders.length === 0 ? (
                    <p className="mt-2 font-body text-sm text-charcoal/60">
                      Pehla order karein aur yahan poori history ban jayegi.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {orders.slice(0, 4).map((o) => (
                        <OrderRow key={o.id} order={o} />
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {tab === "live" && (
              <section>
                {current && tracking ? (
                  <div className="space-y-5">
                    <div className="grid gap-5 rounded-[1.75rem] border-2 border-charcoal/10 bg-white/70 p-5 lg:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-3">
                          {current.dish_image && (
                            <img
                              src={current.dish_image}
                              alt={current.dish_name}
                              className="h-16 w-16 rounded-xl object-cover" loading="lazy" decoding="async" />
                          )}
                          <div>
                            <p className="font-display text-sm font-extrabold uppercase text-charcoal">
                              {current.dish_name}
                            </p>
                            <p className="font-body text-xs text-charcoal/60">
                              {current.order_code} · {current.size} · {current.qty} items ·{" "}
                              {money(current.total)}
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 rounded-2xl bg-charcoal/5 px-4 py-3 font-body text-[12px] text-charcoal/65">
                          <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                          {[address?.street, address?.area, address?.city]
                            .filter(Boolean)
                            .join(", ") || "Address order ke saath save hoga"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 self-start">
                        <MiniFact
                          icon={<CreditCard className="h-3.5 w-3.5" aria-hidden="true" />}
                          label="Payment"
                          value={paymentLabel(current.payment)}
                        />
                        <MiniFact
                          icon={<Timer className="h-3.5 w-3.5" aria-hidden="true" />}
                          label="ETA"
                          value={
                            tracking.delivered ? "Delivered" : `~${tracking.etaMinutes} min`
                          }
                        />
                        <MiniFact
                          icon={<Bike className="h-3.5 w-3.5" aria-hidden="true" />}
                          label="Caddy"
                          value={current.rider?.name ?? "Assign ho raha"}
                        />
                        <MiniFact
                          icon={<Phone className="h-3.5 w-3.5" aria-hidden="true" />}
                          label="Caddy phone"
                          value={current.rider?.phone ?? "—"}
                        />
                      </div>
                    </div>

                    <OrderTracking
                      snapshot={tracking}
                      riderName={current.rider?.name ?? "Caddy"}
                      targetLabel={
                        [address?.street, address?.area, address?.city]
                          .filter(Boolean)
                          .join(", ") || "Your location"
                      }
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl bg-charcoal/5 px-5 py-6 font-body text-sm text-charcoal/60">
                    Koi live order nahi.{" "}
                    <Link to="/" className="font-semibold text-flame">
                      Kuch order karein
                    </Link>
                    .
                    <button
                      type="button"
                      onClick={() => void startDemoDelivery()}
                      className="mt-4 block rounded-full bg-charcoal px-5 py-2.5 font-display text-[11px] font-extrabold uppercase tracking-[0.16em] text-cream transition-colors hover:bg-flame"
                    >
                      Start demo delivery
                    </button>
                  </div>
                )}

              </section>
            )}


            {tab === "history" && (
              <section>
                <h2 className="flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-[0.16em] text-charcoal">
                  <ReceiptText className="h-4 w-4" aria-hidden="true" /> Order & payment history
                </h2>
                {orders.length === 0 ? (
                  <p className="mt-3 font-body text-sm text-charcoal/60">
                    Abhi tak koi order nahi.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {orders.map((o) => (
                      <OrderRow key={o.id} order={o} expandable />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === "addresses" && (
              <section>
                <h2 className="flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-[0.16em] text-charcoal">
                  <MapPin className="h-4 w-4" aria-hidden="true" /> Saved addresses
                </h2>
                <p className="mt-1 font-body text-sm text-charcoal/60">
                  Aapke saare delivery points — checkout par ek tap mein select ho jate hain.
                </p>
                {addressBook.length === 0 ? (
                  <p className="mt-4 rounded-[1.5rem] border-2 border-dashed border-charcoal/15 p-6 text-center font-body text-sm text-charcoal/60">
                    Abhi koi address save nahi. Pehla order karte waqt address save ho jayega.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {addressBook.map(({ address, uses, last }, i) => (
                      <motion.article
                        key={`${address.id}-${i}`}
                        initial={{ opacity: 0, y: 16, rotateX: 12 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 24 }}
                        className="candy-3d candy-3d-hover p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-flame/10 px-3 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.18em] text-flame">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {address.label || "Address"}
                          </span>
                          {i === 0 && uses > 0 && (
                            <span className="rounded-full bg-charcoal/8 px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-widest text-charcoal/60">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="mt-3 font-display text-base font-extrabold text-charcoal">
                          {address.name}
                        </p>
                        <p className="mt-1 font-body text-sm leading-relaxed text-charcoal/70">
                          {address.street}
                          {address.area ? `, ${address.area}` : ""}
                          {address.city ? `, ${address.city}` : ""}
                        </p>
                        {address.notes && (
                          <p className="mt-1 font-body text-xs italic text-charcoal/50">
                            “{address.notes}”
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-charcoal/10 pt-3 font-body text-xs text-charcoal/60">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                            {address.phone || "—"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" aria-hidden="true" />
                            {uses} order{uses === 1 ? "" : "s"}
                          </span>
                          {last && <span>Last: {when(last)}</span>}
                        </div>
                      </motion.article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === "payments" && (
              <section>
                <h2 className="flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-[0.16em] text-charcoal">
                  <Wallet className="h-4 w-4" aria-hidden="true" /> Payment history
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {paymentSummary.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 16, rotateX: 12 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
                      className="candy-3d candy-3d-hover p-5"
                    >
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-charcoal/8 px-3 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.18em] text-charcoal/70">
                        <CreditCard className="h-3 w-3" aria-hidden="true" />
                        {p.label}
                      </span>
                      <p className="mt-3 font-display text-2xl font-black text-charcoal">
                        {money(p.total)}
                      </p>
                      <p className="mt-1 font-body text-xs text-charcoal/60">
                        {p.count} payment{p.count === 1 ? "" : "s"} · {p.note}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <h3 className="mt-7 flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-[0.18em] text-charcoal">
                  <ReceiptText className="h-4 w-4" aria-hidden="true" /> Receipts
                </h3>
                {orders.length === 0 ? (
                  <p className="mt-3 font-body text-sm text-charcoal/60">Abhi koi receipt nahi.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {orders.map((o, i) => (
                      <motion.li
                        key={o.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i, 8) * 0.04 }}
                        className="candy-3d flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-display text-sm font-extrabold uppercase tracking-widest text-charcoal">
                            {o.order_code}
                          </p>
                          <p className="truncate font-body text-xs text-charcoal/60">
                            {o.dish_name} · {when(o.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-charcoal/8 px-3 py-1 font-body text-[11px] font-bold text-charcoal/70">
                            {paymentLabel(o.payment)}
                          </span>
                          <span className="font-display text-base font-black text-flame">
                            {money(o.total)}
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </section>
            )}


            {tab === "saved" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <SavedGrid
                  title="Wishlist"
                  icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
                  slugs={wishlist.slugs}
                  emptyText="Menu par dil ka nishan dabayein aur dish yahan save ho jayegi."
                  onRemove={wishlist.toggle}
                />
                <SavedGrid
                  title="Liked recipes"
                  icon={<Heart className="h-4 w-4" aria-hidden="true" />}
                  slugs={likes.slugs}
                  emptyText="Jo recipes pasand aayein unhein like karein — yahan mil jayengi."
                  onRemove={likes.toggle}
                />
              </div>
            )}

            {tab === "alerts" && (
              <section className="rounded-[1.75rem] border-2 border-charcoal/10 p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-[0.18em] text-charcoal">
                  <Bell className="h-4 w-4" aria-hidden="true" /> Notifications
                </h2>
                {notifications.length === 0 ? (
                  <p className="mt-3 font-body text-sm text-charcoal/60">
                    Abhi koi notification nahi — order karte hi updates yahan aayenge.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {notifications.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-start gap-3 rounded-2xl border-2 border-charcoal/10 p-3"
                      >
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            n.live ? "bg-flame" : "bg-charcoal/25"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-xs font-extrabold uppercase text-charcoal">
                            {n.title}
                          </p>
                          <p className="font-body text-[11px] text-charcoal/55">{n.body}</p>
                        </div>
                        <span className="shrink-0 font-body text-[11px] text-charcoal/45">
                          {new Date(n.at).toLocaleDateString("en-GB")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function OrderRow({ order, expandable }: { order: DbOrder; expandable?: boolean }) {
  const [open, setOpen] = useState(false);
  const addr = order.address as AddressWithCoords | null;

  return (
    <li className="rounded-2xl border-2 border-charcoal/10 p-3">
      <div className="flex items-center gap-3">
        {order.dish_image && (
          <img
            src={order.dish_image}
            alt={order.dish_name}
            className="h-12 w-12 rounded-xl object-cover" loading="lazy" decoding="async" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xs font-extrabold uppercase text-charcoal">
            {order.dish_name}
          </p>
          <p className="font-body text-[11px] text-charcoal/55">
            {order.order_code} · {new Date(order.created_at).toLocaleDateString("en-GB")} ·{" "}
            {paymentLabel(order.payment)}
          </p>
        </div>
        <span
          className={`hidden rounded-full px-2.5 py-1 font-body text-[10px] uppercase tracking-widest sm:block ${
            order.status === "delivered" ? "bg-charcoal/8 text-charcoal/60" : "bg-flame/12 text-flame"
          }`}
        >
          {stageLabel(order.status)}
        </span>
        <span className="font-display text-sm font-extrabold text-flame">{money(order.total)}</span>
        {expandable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border-2 border-charcoal/12 px-2.5 py-1 font-display text-[10px] font-extrabold uppercase tracking-[0.14em] text-charcoal/60 hover:border-flame hover:text-flame"
          >
            {open ? "Hide" : "Details"}
          </button>
        )}
      </div>

      {expandable && open && (
        <dl className="mt-3 grid gap-2 rounded-2xl bg-charcoal/5 p-3 sm:grid-cols-2">
          {[
            ["Size", order.size],
            ["Quantity", String(order.qty)],
            ["Payment", paymentLabel(order.payment)],
            ["Status", stageLabel(order.status)],
            ["Rider", order.rider?.name ?? "—"],
            ["Rider phone", order.rider?.phone ?? "—"],
            ["ETA", `~${order.eta_minutes} min`],
            [
              "Address",
              [addr?.street, addr?.area, addr?.city].filter(Boolean).join(", ") || "—",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-body text-[10px] uppercase tracking-widest text-charcoal/45">
                {k}
              </dt>
              <dd className="font-body text-[12px] text-charcoal/80">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-charcoal/10 bg-white/70 p-4">
      <span className="flex items-center gap-1.5 font-body text-[10px] uppercase tracking-widest text-charcoal/50">
        {icon}
        {label}
      </span>
      <p className="mt-1 truncate font-display text-base font-extrabold uppercase text-charcoal">
        {value}
      </p>
      <p className="font-body text-[11px] text-charcoal/45">{hint}</p>
    </div>
  );
}

function MiniFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-charcoal/5 px-3 py-2">
      <span className="flex items-center gap-1.5 font-body text-[10px] uppercase tracking-widest text-charcoal/45">
        {icon}
        {label}
      </span>
      <p className="truncate font-display text-xs font-extrabold uppercase text-charcoal">
        {value}
      </p>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-charcoal px-6 py-4">
      <span className="flex items-center gap-1.5 font-body text-[10px] uppercase tracking-widest text-cream/55">
        {icon}
        {label}
      </span>
      <span className="mt-1 block font-display text-sm font-extrabold uppercase text-cream">
        {children}
      </span>
    </div>
  );
}

function SavedGrid({
  title,
  icon,
  slugs,
  emptyText,
  onRemove,
}: {
  title: string;
  icon: React.ReactNode;
  slugs: string[];
  emptyText: string;
  onRemove: (slug: string) => void;
}) {
  const dishes = slugs.map(dishBySlug).filter(Boolean);

  return (
    <section className="rounded-[1.75rem] border-2 border-charcoal/10 p-5">
      <h2 className="flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-[0.18em] text-charcoal">
        {icon}
        {title}
        <span className="ml-auto font-body text-[11px] font-normal text-charcoal/50">
          {dishes.length}
        </span>
      </h2>

      {dishes.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 font-body text-xs text-charcoal/55">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {emptyText}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {dishes.map((d) => (
            <li key={d!.slug} className="flex items-center gap-3 rounded-2xl bg-charcoal/5 p-2.5">
              <img
                src={d!.image}
                alt={d!.name}
                className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" />
              <div className="min-w-0 flex-1">
                <Link
                  to="/dish/$slug"
                  params={{ slug: d!.slug }}
                  className="block truncate font-display text-xs font-extrabold uppercase text-charcoal hover:text-flame"
                >
                  {d!.name}
                </Link>
                <span className="font-body text-[11px] text-charcoal/55">{money(d!.price)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  addToCart(d!.slug);
                  toast.success(`${d!.name} cart mein add`);
                }}
                className="rounded-full bg-flame px-3 py-1.5 font-display text-[10px] font-extrabold uppercase tracking-[0.14em] text-cream"
              >
                Add
              </button>
              <button
                type="button"
                aria-label={`Remove ${d!.name}`}
                onClick={() => onRemove(d!.slug)}
                className="rounded-full p-1.5 text-charcoal/45 hover:text-flame"
              >
                <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
