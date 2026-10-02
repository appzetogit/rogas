import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { MapPin, Locate, Trash2, Pencil, Plus, Star } from "lucide-react";
import { dmbExtraCustomerAPI } from "@food/api";
import { ScreenHeader, Section, Chip, Notice, PrimaryButton, Spinner, errorText, errorCode } from "./ui";

// Must match every other useJsApiLoader call in the app (same id + options), or the Maps loader throws.
const MAP_LIBRARIES = ["places", "drawing", "geometry"];
const WARSAW = { lat: 52.2297, lng: 21.0122 };
const kmText = (km) => (Number.isFinite(Number(km)) ? Number(km).toFixed(1) : "?");

/** Saved addresses (max 5: Home, Office and up to 3 named "Other" ones — Gap V). */
export function useAddresses() {
  const [state, setState] = useState({ addresses: [], limits: { max: 5, maxOther: 3 }, loading: true, error: "" });
  const load = useCallback(async () => {
    try {
      const res = await dmbExtraCustomerAPI.getAddresses();
      const data = res.data?.data || {};
      setState({ addresses: data.addresses || [], limits: data.limits || { max: 5, maxOther: 3 }, loading: false, error: "" });
      return data.addresses || [];
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorText(err, "Could not load your addresses") }));
      return [];
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

// `translate` is the caller's t() — the keys "Home", "Office" and "Other" are also used directly below.
export const addressTitle = (a, translate) => (a?.label === "Other" ? a.customLabel || translate("Other") : a?.label === "Office" ? translate("Office") : translate("Home"));
export const addressLine = (a) => [a?.street, a?.additionalDetails, a?.zipCode, a?.city].filter(Boolean).join(", ");

/**
 * Add / edit an address. The pin is required: the server checks it against the delivery zones (Gap U) and refuses
 * addresses outside them ("This address is outside our delivery area"), suggesting the nearest zone when it can.
 */
export function AddressForm({ initial, onSaved, onCancel }) {
  const { t } = useTranslation("customer");
  const editing = Boolean(initial?._id);
  const coords = initial?.location?.coordinates;
  const [form, setForm] = useState({
    label: initial?.label || "Home",
    customLabel: initial?.customLabel || "",
    street: initial?.street || "",
    additionalDetails: initial?.additionalDetails || "",
    city: initial?.city || "",
    state: initial?.state || "",
    zipCode: initial?.zipCode || "",
    phone: initial?.phone || "",
  });
  const [pin, setPin] = useState(coords?.length === 2 ? { lat: coords[1], lng: coords[0] } : null);
  const [center, setCenter] = useState(pin || WARSAW);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [zoneHint, setZoneHint] = useState(null);
  const { isLoaded } = useJsApiLoader({ id: "google-map-script", googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "", libraries: MAP_LIBRARIES });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const reverseGeocode = (lat, lng) => {
    if (!window.google?.maps) return;
    new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results?.[0]) return;
      const comp = (type) => results[0].address_components.find((c) => c.types.includes(type))?.long_name || "";
      setForm((f) => ({
        ...f,
        street: f.street || [comp("route"), comp("street_number")].filter(Boolean).join(" ") || results[0].formatted_address,
        city: comp("locality") || comp("postal_town") || f.city,
        state: comp("administrative_area_level_1") || f.state,
        zipCode: comp("postal_code") || f.zipCode,
      }));
    });
  };

  const placePin = (lat, lng) => {
    setPin({ lat, lng });
    setZoneHint(null);
    reverseGeocode(lat, lng);
    // Tell the customer right away whether we deliver there (the server checks again on save).
    dmbExtraCustomerAPI
      .zoneCheck({ lat, lng, source: "address_add" })
      .then((res) => setZoneHint(res.data?.result || null))
      .catch(() => {});
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError(t("Location is not available in this browser"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude });
        placePin(p.coords.latitude, p.coords.longitude);
      },
      () => setError(t("Allow location access, or place the pin on the map yourself")),
    );
  };

  const save = async () => {
    setError("");
    if (!pin) return setError(t("Place the pin on your door so we can check we deliver there"));
    if (!form.street.trim() || !form.city.trim() || !form.state.trim()) return setError(t("Street, city and region are required"));
    if (form.label === "Other" && !form.customLabel.trim()) return setError(t("Give this address a name, e.g. Gym or Mum's"));
    setSaving(true);
    try {
      const body = { ...form, latitude: pin.lat, longitude: pin.lng };
      const res = editing ? await dmbExtraCustomerAPI.updateAddress(initial._id, body) : await dmbExtraCustomerAPI.addAddress(body);
      onSaved?.(res.data?.data?.address || null);
    } catch (err) {
      const code = errorCode(err);
      const nearest = err?.response?.data?.details?.nearest;
      if (code === "ADDRESS_OUTSIDE_ZONE") {
        setError(nearest?.zoneName ? t("This address is outside our delivery area. The nearest area we deliver to is {{zone}} ({{km}} km away).", { zone: nearest.zoneName, km: kmText(nearest.distanceKm) }) : t("This address is outside our delivery area."));
      } else if (code === "SUBSCRIPTION_ZONE_MISMATCH") {
        setError(t("Your current maker doesn't deliver to this address. Choose a new maker for this subscription first."));
      } else {
        setError(errorText(err, t("Could not save the address")));
      }
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full bg-white border border-[#e4e2e1] rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-primary";
  return (
    <div className="space-y-4">
      <Section title={t("Label")}>
        <div className="flex gap-2 flex-wrap">
          {["Home", "Office", "Other"].map((l) => (
            <Chip key={l} active={form.label === l} onClick={() => setForm((f) => ({ ...f, label: l }))}>
              {l === "Home" ? t("Home") : l === "Office" ? t("Office") : t("Other")}
            </Chip>
          ))}
        </div>
        {form.label === "Other" && <input className={input} maxLength={30} value={form.customLabel} onChange={set("customLabel")} placeholder={t("Name, e.g. Gym or Mum's")} />}
      </Section>

      <Section title={t("Pin your door")}>
        <div className="h-[220px] w-full rounded-xl overflow-hidden border border-[#e4e2e1] bg-[#f9f9f7]">
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: "100%", height: "100%" }} center={center} zoom={pin ? 16 : 12} onClick={(e) => placePin(e.latLng.lat(), e.latLng.lng())} options={{ disableDefaultUI: true, zoomControl: true }}>
              {pin && <Marker position={pin} />}
            </GoogleMap>
          ) : (
            <div className="h-full flex items-center justify-center text-[12px] text-[#6e7a74]">{t("Loading Map...")}</div>
          )}
        </div>
        <button type="button" onClick={useMyLocation} className="w-full py-2 rounded-xl text-[12px] font-bold bg-[#1F7A63]/10 text-[#1F7A63] flex items-center justify-center gap-1.5">
          <Locate size={16} /> {t("Use my current location")}
        </button>
        {zoneHint && (zoneHint.inZone ? (
          <Notice tone="success">{t("Great — we deliver here ({{zone}}).", { zone: zoneHint.zoneName || "" })}</Notice>
        ) : (
          <Notice tone="error">
            {zoneHint.nearest?.zoneName
              ? t("We don't deliver to this spot yet. Nearest delivery area: {{zone}} ({{km}} km).", { zone: zoneHint.nearest.zoneName, km: kmText(zoneHint.nearest.distanceKm) })
              : t("We don't deliver to your area yet. Deliveries coming soon.")}
          </Notice>
        ))}
      </Section>

      <Section title={t("Address details")}>
        <input className={input} value={form.street} onChange={set("street")} placeholder={t("Street and number")} maxLength={200} />
        <input className={input} value={form.additionalDetails} onChange={set("additionalDetails")} placeholder={t("Flat, floor, door code (optional)")} maxLength={500} />
        <div className="grid grid-cols-2 gap-2">
          <input className={input} value={form.zipCode} onChange={set("zipCode")} placeholder={t("Postcode")} maxLength={20} />
          <input className={input} value={form.city} onChange={set("city")} placeholder={t("City")} maxLength={100} />
        </div>
        <input className={input} value={form.state} onChange={set("state")} placeholder={t("Region")} maxLength={100} />
        <input className={input} value={form.phone} onChange={set("phone")} placeholder={t("Phone for the driver (optional)")} maxLength={20} inputMode="tel" />
      </Section>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-[#e4e2e1] font-bold text-[13px]">
            {t("Cancel")}
          </button>
        )}
        <PrimaryButton className="flex-1" busy={saving} onClick={save}>
          {editing ? t("Save address") : t("Add address")}
        </PrimaryButton>
      </div>
    </div>
  );
}

/** Pick one of the saved addresses (or add a new one inline). Used by subscribe, Select-mode and address changes. */
export function AddressPicker({ value, onChange, title }) {
  const { t } = useTranslation("customer");
  const { addresses, limits, loading, reload } = useAddresses();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!value && addresses.length) {
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      onChange(def);
    }
  }, [addresses, value, onChange]);

  if (loading) return <Spinner />;
  if (adding) {
    return (
      <Section title={t("New address")}>
        <AddressForm
          onCancel={addresses.length ? () => setAdding(false) : undefined}
          onSaved={async (saved) => {
            const list = await reload();
            setAdding(false);
            onChange(list.find((a) => String(a._id) === String(saved?._id)) || saved);
          }}
        />
      </Section>
    );
  }
  return (
    <Section title={title || t("Delivery address")}>
      {addresses.length === 0 && <Notice tone="info">{t("Add the address we should deliver to.")}</Notice>}
      <div className="space-y-2">
        {addresses.map((a) => {
          const active = String(value?._id) === String(a._id);
          return (
            <button
              key={a._id}
              type="button"
              onClick={() => onChange(a)}
              className={`w-full text-left p-3 rounded-xl border-2 flex items-start gap-3 ${active ? "border-primary bg-primary/5" : "border-[#e4e2e1] bg-white"}`}
            >
              <MapPin size={18} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-extrabold text-[13px] text-[#1b1c1c]">{addressTitle(a, t)}</p>
                <p className="text-[12px] text-[#6e7a74] truncate">{addressLine(a)}</p>
              </div>
            </button>
          );
        })}
      </div>
      {addresses.length < (limits?.max || 5) ? (
        <button type="button" onClick={() => setAdding(true)} className="w-full py-2.5 rounded-xl border border-dashed border-primary text-primary font-bold text-[12px] flex items-center justify-center gap-1.5">
          <Plus size={16} /> {t("Add a new address")}
        </button>
      ) : (
        <p className="text-[11px] text-[#6e7a74]">{t("You have saved the maximum of {{max}} addresses.", { max: limits.max })}</p>
      )}
    </Section>
  );
}

/** CA-15 Profile → Addresses. */
export function AddressBookScreen({ onGoBack, onShowToast }) {
  const { t } = useTranslation("customer");
  const { addresses, limits, loading, error, reload } = useAddresses();
  const [editing, setEditing] = useState(null); // null | {} (new) | address
  const [busyId, setBusyId] = useState("");
  const [rowError, setRowError] = useState("");

  const remove = async (a) => {
    if (!window.confirm(t("Delete the address \"{{name}}\"?", { name: addressTitle(a, t) }))) return;
    setBusyId(a._id);
    setRowError("");
    try {
      await dmbExtraCustomerAPI.deleteAddress(a._id);
      await reload();
      onShowToast?.(t("Address deleted"));
    } catch (err) {
      setRowError(errorText(err, t("Could not delete the address")));
    } finally {
      setBusyId("");
    }
  };

  const makeDefault = async (a) => {
    setBusyId(a._id);
    try {
      await dmbExtraCustomerAPI.setDefaultAddress(a._id);
      await reload();
    } catch (err) {
      setRowError(errorText(err, t("Could not update the address")));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-28">
      <ScreenHeader title={editing ? (editing._id ? t("Edit address") : t("New address")) : t("My addresses")} onBack={editing ? () => setEditing(null) : onGoBack} />
      <main className="px-5 pt-5 max-w-xl mx-auto space-y-4">
        {editing ? (
          <AddressForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              await reload();
              setEditing(null);
              onShowToast?.(t("Address saved"));
            }}
          />
        ) : loading ? (
          <Spinner />
        ) : (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            {rowError && <Notice tone="error">{rowError}</Notice>}
            <p className="text-[12px] text-[#6e7a74]">
              {t("Save up to {{max}} addresses: Home, Office and up to {{other}} more with your own names. You can send any delivery to a different saved address from the calendar.", { max: limits.max, other: limits.maxOther })}
            </p>
            {addresses.map((a) => (
              <div key={a._id} className="bg-white rounded-2xl p-4 border border-[#e4e2e1] flex items-start gap-3">
                <MapPin size={20} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-[14px] text-[#1b1c1c] flex items-center gap-2">
                    {addressTitle(a, t)}
                    {a.isDefault && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t("Default")}</span>}
                  </p>
                  <p className="text-[12px] text-[#6e7a74] mt-0.5">{addressLine(a)}</p>
                  {!a.zoneId && <p className="text-[11px] text-amber-700 mt-1">{t("Not checked against our delivery area yet — edit and re-pin it.")}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <button type="button" aria-label={t("Edit")} onClick={() => setEditing(a)} className="p-2 rounded-lg hover:bg-slate-100 text-[#1b1c1c]"><Pencil size={16} /></button>
                  {!a.isDefault && <button type="button" aria-label={t("Make default")} disabled={busyId === a._id} onClick={() => makeDefault(a)} className="p-2 rounded-lg hover:bg-slate-100 text-amber-600"><Star size={16} /></button>}
                  <button type="button" aria-label={t("Delete")} disabled={busyId === a._id} onClick={() => remove(a)} className="p-2 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            {addresses.length < limits.max && (
              <PrimaryButton onClick={() => setEditing({})}>
                <Plus size={18} /> {t("Add address")}
              </PrimaryButton>
            )}
          </>
        )}
      </main>
    </div>
  );
}
