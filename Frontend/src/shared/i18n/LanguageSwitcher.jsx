import { useTranslation } from "react-i18next";
import useLanguages from "./useLanguages";

/**
 * Language picker driven by the admin-managed list.
 * variant="select" -> compact dropdown, variant="list" -> tappable rows.
 */
export default function LanguageSwitcher({ variant = "select", className = "", selectClassName = "", selectStyle, onChanged }) {
  const { t } = useTranslation("common");
  const { languages, current, setLanguage, switching } = useLanguages();

  const choose = async (code) => {
    if (code === current || switching) return;
    await setLanguage(code);
    onChanged?.(code);
  };

  if (variant === "list") {
    return (
      <div className={className} role="radiogroup" aria-label={t("Language")}>
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={l.code === current}
            disabled={switching}
            onClick={() => choose(l.code)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
              l.code === current ? "border-primary bg-primary/5 text-primary" : "border-gray-200 bg-white text-gray-800"
            }`}
          >
            <span>
              {l.flag} {l.nativeName}
            </span>
            {l.code === current && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <select
        value={current}
        disabled={switching}
        onChange={(e) => choose(e.target.value)}
        aria-label={t("Language")}
        style={selectStyle}
        className={selectClassName || "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
}
