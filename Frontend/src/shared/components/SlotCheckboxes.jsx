import useDeliverySlots from "../hooks/useDeliverySlots";

/** Checkbox list of admin-configured delivery slots. `value` is an array of slot keys. */
export default function SlotCheckboxes({ value = [], onChange, className = "", labelClassName = "flex items-center gap-2 cursor-pointer text-sm" }) {
  const { enabledSlots: slots } = useDeliverySlots();
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
          {s.icon} {s.name}
        </label>
      ))}
    </div>
  );
}
