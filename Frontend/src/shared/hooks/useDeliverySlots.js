import { useEffect, useState, useCallback } from "react";
import { dmbSlotAPI } from "../../services/api";

const TTL_MS = 60 * 1000;
let cache = { slots: null, at: 0, promise: null };
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(cache.slots));

export const fetchDeliverySlots = async (force = false) => {
  if (!force && cache.slots && Date.now() - cache.at < TTL_MS) return cache.slots;
  if (cache.promise) return cache.promise;
  cache.promise = dmbSlotAPI
    .list()
    .then((res) => {
      const slots = res?.data?.slots || res?.data?.data?.slots || [];
      cache = { slots, at: Date.now(), promise: null };
      notify();
      return slots;
    })
    .catch((err) => {
      cache.promise = null;
      throw err;
    });
  return cache.promise;
};

export const to12h = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Admin-defined delivery slots, ordered. `slots` holds every slot so that an order placed on a
 * slot the admin later disabled still renders its name; `enabledSlots` is what may still be picked.
 */
export default function useDeliverySlots() {
  const [slots, setSlots] = useState(cache.slots || []);
  const [loading, setLoading] = useState(!cache.slots);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onChange = (s) => setSlots(s || []);
    listeners.add(onChange);
    fetchDeliverySlots()
      .then((s) => setSlots(s))
      .catch((err) => {
        console.error("Failed to load delivery slots", err);
        setError(err);
      })
      .finally(() => setLoading(false));
    return () => listeners.delete(onChange);
  }, []);

  const getSlot = useCallback((key) => slots.find((s) => s.key === String(key || "").toLowerCase()), [slots]);
  // Empty string, not undefined, so a key that has not resolved yet (first render, before the
  // fetch lands) renders as nothing rather than the text "undefined" inside a template literal.
  const label = useCallback((key) => getSlot(key)?.name ?? "", [getSlot]);
  const icon = useCallback((key) => getSlot(key)?.icon ?? "", [getSlot]);
  const window = useCallback(
    (key) => {
      const s = getSlot(key);
      if (!s) return "";
      return `${to12h(s.deliveryStartTime || s.startTime)} – ${to12h(s.deliveryEndTime || s.endTime)}`;
    },
    [getSlot]
  );

  const enabledSlots = slots.filter((s) => s.isEnabled);

  return { slots, enabledSlots, loading, error, getSlot, label, icon, window, refresh: () => fetchDeliverySlots(true) };
}

const toMins = (str) => {
  if (!str) return null;
  const [h, m] = str.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/**
 * Which slot a vendor/driver screen should show: the one in progress, else the most recent one to
 * have started, else the earliest still to come. `config` is the vendor timing-settings object
 * ({ slots: [...], <key>: {...} }). Returns undefined when no slot is configured.
 */
export const pickCurrentSlot = (config, knownSlots = []) => {
  const slots = (config?.slots || knownSlots).filter((s) => s.isEnabled);
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const s of slots) {
    const a = toMins(s.startTime);
    const b = toMins(s.endTime);
    if (a !== null && b !== null && cur >= a && cur <= b) return s.key;
  }
  const started = slots.filter((s) => toMins(s.startTime) !== null && toMins(s.startTime) <= cur);
  return (started[started.length - 1] ?? slots[0])?.key;
};

/** Synchronous read of the cached slot list (for non-React callbacks). */
export const getCachedSlots = () => cache.slots || [];
