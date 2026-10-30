import useDeliverySlots from "../hooks/useDeliverySlots";

/**
 * Checkbox list of admin-configured delivery slots. `value` is an array of slot keys.
 * Draft slots are listed too: a new slot can only go live once a driver works its shift, so the admin must be able to
 * give a driver a draft slot's shift first.
 */
export default function SlotCheckboxes({ value = [], onChange, className = "", labelClassName = "flex items-center gap-2 cursor-pointer text-sm" }) {
  const { slots: allSlots } = useDeliverySlots();
  const slots = allSlots.filter((s) => s.isEnabled || s.status === "draft");
  const toggle = (key, checked) => onChange(checked ? [...value, key] : value.filter((k) => k !== key));
  return (
    <div className={className}>
      {slots.map((s) => (
        <label key={s.key} className={labelClassName}>
          <input
            type="checkbox"
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={value.includes(s.key)}
            onChange={(e) => toggle(s.key, e.target.checked)}
          />
          {s.icon} {s.name}{s.status === "draft" && <span className="text-xs text-slate-400">(draft)</span>}
        </label>
      ))}
    </div>
  );
}
