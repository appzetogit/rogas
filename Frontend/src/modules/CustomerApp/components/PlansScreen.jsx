import { useState, useEffect } from "react";
import useScrollLock from "../../../shared/hooks/useScrollLock";
import { useNavigate } from "react-router-dom";
import { PantryItemsList } from "./PantryItemsList";
import { dmbCustomerAPI, dmbExtraCustomerAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import { X, AlertTriangle, Search, Star, UtensilsCrossed, Youtube, ArrowLeft, Leaf, Shuffle, ShoppingBag, MapPin, Stethoscope } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { SubscribeSheet } from "./amendment/SubscribeSheet";
import { useAddresses } from "./amendment/addresses";
import usePlatformConfig from "../../../shared/platform/usePlatformConfig";
import { tKey } from "@/shared/i18n";
import useMoney from "../../../shared/payments/money";

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl) return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
  if (typeof imageUrl === "object") return imageUrl.url || imageUrl.secure_url || "";
  if (typeof imageUrl === "string") {
    if (/^(https?:)?\/\//i.test(imageUrl)) return imageUrl;
    return `${BACKEND_ORIGIN}${imageUrl.startsWith("/") ? imageUrl : "/" + imageUrl}`;
  }
  return "";
};

const getPrimaryImage = (vendor) => {
  const coverImages = Array.isArray(vendor?.coverImages) ? vendor.coverImages : [];
  const firstCoverImage = coverImages.map(normalizeImageUrl).find(Boolean);
  if (firstCoverImage) return firstCoverImage;
  return normalizeImageUrl(vendor?.profileImage) || normalizeImageUrl(vendor?.logo) || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
};



// ─── Menu Modal ────────────────────────────────────────────────────────────────
function MenuModal({ vendorId, vendorName, onClose }) {
  const { t } = useTranslation("customer");
  const { money } = useMoney({ vendorId });
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  useScrollLock(); // the page behind the sheet must not scroll

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const res = await dmbCustomerAPI.getVendorMenu(vendorId);
        setMenu(res.data?.menu || []);
      } catch (e) {
        console.error("Menu fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();
  }, [vendorId]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md md:max-w-xl bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300 overscroll-contain">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-[#e4e2e1] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f0eded]">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#1b1c1c]">{t("🍽️ Menu")}</h2>
            <p className="text-[12px] text-[#6e7a74]">{vendorName}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#f5f5f0] flex items-center justify-center active:scale-90 transition-transform">
            <X className="text-[20px]" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-4 space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-[13px] text-[#6e7a74]">{t("Loading menu...")}</p>
            </div>
          ) : menu.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <span className="text-4xl">🍴</span>
              <p className="font-bold text-[#6e7a74]">{t("No active menu items yet")}</p>
              <p className="text-[12px] text-[#6e7a74]">{t("This vendor hasn't added menu items")}</p>
            </div>
          ) : menu.map((item) => (
            <div key={item._id} className="bg-[#f9f9f7] rounded-2xl p-4 flex gap-4 border border-[#e4e2e1]/50">
              {item.photos?.[0] ? (
                <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#e4e2e1]">
                  <img src={normalizeImageUrl(item.photos[0])} alt={item.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">🥗</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-[14px] text-[#1b1c1c] truncate">{item.name}</h3>
                {item.description && (
                  <p className="text-[12px] text-[#6e7a74] mt-0.5 line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[15px] font-extrabold text-primary">{t("{{price}}/day", { price: money(item.pricePerDay, { compact: true }) })}</span>
                  {item.nutrition?.calories && (
                    <span className="text-[11px] text-[#6e7a74] bg-white border border-[#e4e2e1] px-2 py-0.5 rounded-full">
                      {t("{{calories}} kcal", { calories: item.nutrition.calories })}
                    </span>
                  )}
                </div>
                {item.allergens?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.allergens.slice(0, 3).map((a) => (
                      <span key={a} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main PlansScreen ──────────────────────────────────────────────────────────
const SPECIALISM_LABELS = {
  hashimoto: tKey("Hashimoto's"),
  pregnancy: tKey("Pregnancy"),
  low_gi: tKey("Low GI / diabetes"),
  menopause: tKey("Menopause"),
};
const VENDOR_TYPE_LABELS = { home_cook: tKey("Home Cook"), cloud_kitchen: tKey("Cloud Kitchen"), restaurant: tKey("Restaurant"), catering: tKey("Catering") };

export function PlansScreen({ onGoBack, onSelectPlan, onGoToProfile, dietaryPrefs }) {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const [matchDietary, setMatchDietary] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [openPlansFor, setOpenPlansFor] = useState(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [showActiveSubWarning, setShowActiveSubWarning] = useState(false);
  const [activeTab, setActiveTab] = useState("vendor_plans");
  const [filters, setFilters] = useState({});
  const [available, setAvailable] = useState({});

  // Gap X: only makers that deliver to the customer's zone (from their default saved address).
  const { addresses, loading: addressesLoading } = useAddresses();
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];
  const zoneId = defaultAddress?.zoneId ? String(defaultAddress.zoneId) : localStorage.getItem("userZoneId") || "";
  const { isOn } = usePlatformConfig(zoneId || undefined);

  useEffect(() => {
    if (addressesLoading) return;
    if (!zoneId) {
      setVendors([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const params = { zoneId };
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v === true ? "true" : v;
    });
    dmbExtraCustomerAPI
      .browseVendors(params)
      .then((res) => {
        if (!alive) return;
        setVendors(res.data?.vendors || []);
        setAvailable(res.data?.filtersAvailable || {});
        setLoadError("");
      })
      .catch((err) => alive && setLoadError(err?.response?.data?.message || t("Could not load makers")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [zoneId, addressesLoading, JSON.stringify(filters), t]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dmbCustomerAPI
      .getMySubscriptions()
      .then((res) => {
        if (res.data?.success) setHasActiveSub(res.data.subscriptions?.some((sub) => sub.status === "active" || sub.status === "paused"));
      })
      .catch(() => {});
  }, []);

  const activePlans = vendors.map((vendor) => {
    const tags = Array.isArray(vendor.cuisines) && vendor.cuisines.length
      ? vendor.cuisines.slice(0, 3).map((c) => (typeof c === "string" ? c : c.name))
      : vendor.vendorType && VENDOR_TYPE_LABELS[vendor.vendorType] ? [t(VENDOR_TYPE_LABELS[vendor.vendorType])] : [t("Fresh Meals")];
    return {
      id: vendor._id,
      name: vendor.name || t("Meal Vendor"),
      chefName: vendor.chefName || "",
      location: vendor.city || "",
      rating: vendor.rating ? Number(vendor.rating).toFixed(1) : null,
      ratingCount: vendor.ratingCount || 0,
      tags,
      image: getPrimaryImage({ coverImages: vendor.image ? [vendor.image] : [], profileImage: vendor.profileImage }),
      badges: vendor.badges || {},
      deliveryWeekdays: vendor.deliveryWeekdays,
      onVacation: vendor.onVacation,
      vendorData: vendor,
    };
  });

  const q = searchQuery.toLowerCase();
  const filteredPlans = activePlans.filter((p) => !q || [p.name, p.chefName, p.location, ...p.tags].some((x) => String(x || "").toLowerCase().includes(q)));
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: f[k] === v ? undefined : v }));

  const openPlans = (plan) => {
    if (hasActiveSub) {
      setShowActiveSubWarning(true);
      return;
    }
    setOpenPlansFor(plan);
  };

  const handleProceedToCheckout = (checkoutData) => {
    setOpenPlansFor(null);
    onSelectPlan(checkoutData);
  };

  return (
    <>
      <div className="bg-[#F5F5F0] text-on-surface min-h-screen pb-32">
        {/* Top Header */}
        <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-xs border-b border-[#bec9c3]/20">
          <button onClick={onGoBack} className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-extrabold text-primary text-center">{t("Meal Plans")}</h1>
          <div className="w-8" />
        </header>

        {/* Fixed Sub-Header Tabs */}
        <div className="fixed top-14 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-30 bg-[#F5F5F0] px-4 sm:px-8 lg:px-10 py-2.5 border-b border-[#bec9c3]/30 shadow-xs">
          <div className="flex items-center bg-[#e4e8e5] p-1.5 rounded-full relative shadow-xs border border-slate-200/50 max-w-7xl mx-auto">
            <button 
              onClick={() => setActiveTab('vendor_plans')}
              className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all duration-300 z-10 cursor-pointer ${activeTab === 'vendor_plans' ? 'bg-[#1F7A63] text-white shadow-md' : 'bg-transparent text-[#1b1c1c] hover:text-[#1F7A63]'}`}
            >
              {t("Meals")}
            </button>
            <button 
              onClick={() => setActiveTab('pantry_items')}
              className={`flex-1 py-2 rounded-full text-[14px] font-bold transition-all duration-300 z-10 cursor-pointer ${activeTab === 'pantry_items' ? 'bg-[#1F7A63] text-white shadow-md' : 'bg-transparent text-[#1b1c1c] hover:text-[#1F7A63]'}`}
            >
              {t("Pantry Items")}
            </button>
          </div>
        </div>

        <main className="pt-36 sm:pt-40 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto pb-32">

          {activeTab === 'vendor_plans' && (
            <>
              {/* Search */}
              <div className="mb-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#bec9c3] text-[20px]" />
                  <input
                    type="text"
                    placeholder={t("Search vendors, cuisines, location...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 pl-11 pr-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6e7a74]">
                      <X className="text-[20px]" />
                    </button>
                  )}
                </div>
                {/* Diet & Allergies Filter Toggle */}
                {dietaryPrefs && (
                  <label className="flex items-center gap-3 bg-white border border-[#e4e2e1] rounded-xl p-3 shadow-sm cursor-pointer hover:border-primary/50 transition-colors">
                    <div className="flex-1">
                      <p className="font-extrabold text-[13px] text-[#1b1c1c]">{t("Match My Diet & Allergens")}</p>
                      <p className="text-[11px] text-[#6e7a74] mt-0.5">{t("Filter plans based on your profile preferences")}</p>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${matchDietary ? 'bg-primary' : 'bg-[#e4e2e1]'}`}>
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={matchDietary}
                        onChange={(e) => setMatchDietary(e.target.checked)}
                      />
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${matchDietary ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </label>
                )}
              </div>

              {/* Amendment v2 Extra filters: eco (AI), weekend (AJ), specialist (AH), hot/cold (AL), rotation (AK) */}
              {zoneId && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
                  <FilterChip active={filters.eco} onClick={() => setFilter("eco", true)}><Leaf size={13} /> {t("Eco packaging")}</FilterChip>
                  {available.saturday && <FilterChip active={filters.saturday} onClick={() => setFilter("saturday", true)}>{t("Saturday")}</FilterChip>}
                  {available.sunday && <FilterChip active={filters.sunday} onClick={() => setFilter("sunday", true)}>{t("Sunday")}</FilterChip>}
                  {(available.temperatures || []).length > 1 && (
                    <>
                      <FilterChip active={filters.temperature === "hot"} onClick={() => setFilter("temperature", "hot")}>{t("🔥 Hot")}</FilterChip>
                      <FilterChip active={filters.temperature === "cold"} onClick={() => setFilter("temperature", "cold")}>{t("❄️ Cold")}</FilterChip>
                    </>
                  )}
                  {(available.specialisms || []).map((sp) => (
                    <FilterChip key={sp} active={filters.specialism === sp} onClick={() => setFilter("specialism", sp)}>
                      <Stethoscope size={13} /> {SPECIALISM_LABELS[sp] ? t(SPECIALISM_LABELS[sp]) : sp}
                    </FilterChip>
                  ))}
                  {available.rotation && <FilterChip active={filters.rotation} onClick={() => setFilter("rotation", true)}><Shuffle size={13} /> {t("Rotation")}</FilterChip>}
                </div>
              )}

              {zoneId && (isOn("smartRotation") || isOn("selectMode")) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  {isOn("smartRotation") && (
                    <button type="button" onClick={() => navigate("/user/rotation")} className="text-left bg-white rounded-2xl p-4 border border-[#e4e2e1] hover:border-primary/40 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Shuffle size={20} /></span>
                      <span>
                        <span className="block font-extrabold text-[14px]">{t("Smart Rotation")}</span>
                        <span className="block text-[12px] text-[#6e7a74]">{t("A different maker on different days")}</span>
                      </span>
                    </button>
                  )}
                  {isOn("selectMode") && (
                    <button type="button" onClick={() => navigate("/user/select")} className="text-left bg-white rounded-2xl p-4 border border-[#e4e2e1] hover:border-primary/40 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><ShoppingBag size={20} /></span>
                      <span>
                        <span className="block font-extrabold text-[14px]">{t("Try a single meal")}</span>
                        <span className="block text-[12px] text-[#6e7a74]">{t("Order for today or tomorrow, no subscription")}</span>
                      </span>
                    </button>
                  )}
                </div>
              )}

          {/* Hero Banner */}
          <div className="bg-gradient-to-br from-[#1F7A63] to-[#155a49] rounded-2xl p-5 mb-5 relative overflow-hidden shadow-lg">
            <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/10 rounded-full blur-xl" />
            <div className="absolute right-4 bottom-2 opacity-20 text-[80px] leading-none">🥗</div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🤖</span>
                <p className="text-white/80 text-[12px] font-bold uppercase tracking-wider">{t("AI Curated for You")}</p>
              </div>
              <p className="text-white text-[19px] font-extrabold leading-tight">{t("Choose Your Daily Meal Partner")}</p>
              <p className="text-white/70 text-[12px] mt-1">{t("Fresh • Healthy • Delivered to your door")}</p>
            </div>
          </div>

          {!addressesLoading && !zoneId && (
            <div className="bg-white rounded-2xl p-5 border border-[#e4e2e1] mb-5 flex items-start gap-3">
              <MapPin className="text-primary shrink-0" size={22} />
              <div className="flex-1">
                <p className="font-extrabold text-[14px]">{t("Where should we deliver?")}</p>
                <p className="text-[12px] text-[#6e7a74] mt-0.5">{t("Add your address to see the makers who deliver to you.")}</p>
                <button type="button" onClick={() => navigate("/user/addresses")} className="mt-3 px-4 py-2 rounded-xl bg-[#1F7A63] text-white text-[13px] font-bold">{t("Add address")}</button>
              </div>
            </div>
          )}
          {loadError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{loadError}</div>}

          {/* Section heading */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold text-[#6e7a74] uppercase tracking-widest">
              {loading ? t("Loading...") : t("{{count}} vendor available", { count: filteredPlans.length })}
            </h2>
          </div>

          {/* Vendor Cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-6">
            {loading ? (
              <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                    <div className="h-44 bg-[#e4e2e1]" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-[#e4e2e1] rounded w-3/4" />
                      <div className="h-3 bg-[#e4e2e1] rounded w-1/2" />
                      <div className="h-8 bg-[#e4e2e1] rounded-xl mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="col-span-full text-center py-16 space-y-3">
                <span className="text-5xl">🍽️</span>
                <p className="font-extrabold text-[#1b1c1c] text-[16px]">{t("No vendors found")}</p>
                <p className="text-[13px] text-[#6e7a74]">{searchQuery ? t("Try a different search") : t("No approved vendors yet")}</p>
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-primary font-bold text-sm underline">{t("Clear search")}</button>
                )}
              </div>
            ) : (
              filteredPlans.map((plan) => (
                <article
                  key={plan.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-md border border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300"
                >
                  {/* Cover Image */}
                  <div className="relative h-44 w-full bg-[#e4e2e1] overflow-hidden">
                    <img
                      alt={plan.name}
                      className="w-full h-full object-cover"
                      src={plan.image}
                      onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80"; }}
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                    {/* Rating badge (a vendor with no reviews yet is shown as New, never a made-up score) */}
                    <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm flex items-center gap-1 px-2.5 py-1 rounded-full shadow">
                      <Star className="text-amber-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                      <span className="text-[12px] font-extrabold text-[#1b1c1c]">{plan.rating ?? t("New")}</span>
                    </div>

                    {/* Vendor name on image */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-white font-extrabold text-[16px] drop-shadow-md">{plan.name}</h3>
                      <p className="text-white/80 text-[12px] font-medium drop-shadow">
                        {plan.chefName} • {plan.location}
                      </p>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4">
                    <VendorBadges badges={plan.badges} onVacation={plan.onVacation} />
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {plan.tags.map((tag) => (
                        <span key={tag} className="bg-primary/8 text-primary text-[11px] font-bold px-2.5 py-1 rounded-full border border-primary/15">
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex gap-2">
                      {/* View Menu Button */}
                      <button
                        onClick={() => setOpenMenuFor(plan)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#f5f5f0] text-[#1b1c1c] border border-[#e4e2e1] py-3 rounded-xl text-[13px] font-bold active:scale-[0.97] transition-all hover:bg-[#eef0ec]"
                      >
                        <UtensilsCrossed className="text-[18px] text-primary" />
                        {t("View Menu")}
                      </button>

                      {/* View Plans Button */}
                      <button
                        onClick={() => openPlans(plan)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#1F7A63] text-white py-3 rounded-xl text-[13px] font-bold active:scale-[0.97] transition-all hover:bg-[#155a49] shadow-sm"
                      >
                        <Youtube className="text-[18px]" />
                        {t("View Plans")}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
          </>
          )}

          {activeTab === 'pantry_items' && (
            <PantryItemsList />
          )}

          <div className="h-20" />
        </main>
      </div>

      {/* Menu Modal */}
      {openMenuFor && (
        <MenuModal
          vendorId={openMenuFor.id}
          vendorName={openMenuFor.name}
          onClose={() => setOpenMenuFor(null)}
        />
      )}

      {/* Subscribe sheet (server-quoted, Amendment v2 Extra) */}
      {openPlansFor && (
        <SubscribeSheet
          vendor={{ id: openPlansFor.id, name: openPlansFor.name, image: openPlansFor.image, deliveryWeekdays: openPlansFor.deliveryWeekdays }}
          onClose={() => setOpenPlansFor(null)}
          onProceedToCheckout={handleProceedToCheckout}
          matchDietary={matchDietary}
          dietaryPrefs={dietaryPrefs}
        />
      )}

      {showActiveSubWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[210]">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-left">
            <h3 className="text-lg font-extrabold text-[#F59E0B] flex items-center gap-2">
              <AlertTriangle />
              {t("Active Subscription Exists")}
            </h3>
            <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
              {t("You already have a subscription. Change your plan, switch maker or add a delivery slot from your subscription instead.")}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => setShowActiveSubWarning(false)} className="py-2.5 rounded-xl border border-[#e4e2e1] font-bold text-xs">{t("Close")}</button>
              <button type="button" onClick={() => navigate("/user/subscription")} className="bg-primary text-white py-2.5 rounded-xl font-bold text-xs">{t("Manage subscription")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${active ? "bg-[#1F7A63] text-white border-[#1F7A63]" : "bg-white text-[#1b1c1c] border-[#e4e2e1]"}`}
    >
      {children}
    </button>
  );
}

/** Eco (AI), 7-day / weekend (AJ), dietitian-certified (AH), hot/cold (AL) and pre-order (M) badges. */
function VendorBadges({ badges = {}, onVacation }) {
  const { t } = useTranslation("customer");
  const items = [];
  if (onVacation) items.push(<span key="vac" className="bg-slate-100 text-slate-700 border-slate-200">{t("On holiday")}</span>);
  if (badges.eco) items.push(<span key="eco" className="bg-emerald-50 text-emerald-800 border-emerald-200 inline-flex items-center gap-1"><Leaf size={11} /> {t("Eco packaging")}</span>);
  if (badges.weekend === "7_days") items.push(<span key="wk" className="bg-indigo-50 text-indigo-800 border-indigo-200">{t("7 days a week")}</span>);
  else if (badges.weekend === "sat") items.push(<span key="wk" className="bg-indigo-50 text-indigo-800 border-indigo-200">{t("Also Saturdays")}</span>);
  else if (badges.weekend === "sun") items.push(<span key="wk" className="bg-indigo-50 text-indigo-800 border-indigo-200">{t("Also Sundays")}</span>);
  (badges.dietitianCertified || []).forEach((sp) =>
    items.push(
      <span key={`sp-${sp.specialism}`} className="bg-violet-50 text-violet-800 border-violet-200 inline-flex items-center gap-1">
        <Stethoscope size={11} /> {SPECIALISM_LABELS[sp.specialism] ? t(SPECIALISM_LABELS[sp.specialism]) : sp.specialism} · {t("dietitian certified")}
      </span>,
    ),
  );
  (badges.temperatures || []).forEach((tp) =>
    items.push(<span key={`t-${tp}`} className={tp === "hot" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-sky-50 text-sky-700 border-sky-200"}>{tp === "hot" ? t("🔥 Hot") : t("❄️ Cold")}</span>),
  );
  if (badges.preOrder) items.push(<span key="pre" className="bg-amber-50 text-amber-800 border-amber-200">{t("New dish — pre-order")}</span>);
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5 mb-3 [&>span]:text-[10.5px] [&>span]:font-bold [&>span]:px-2 [&>span]:py-0.5 [&>span]:rounded-full [&>span]:border">{items}</div>;
}
