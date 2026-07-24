import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { deliveryAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";
import { SUPPORTED_COUNTRIES } from "@/config/countries";
import CountrySelector from "@/shared/components/CountrySelector";
import { useTranslation } from "@/contexts/LanguageContext";

const COLORS = {
  primary: "#1F7A63",
  primaryContainer: "#1F7A63",
  onPrimary: "#ffffff",
  surface: "#F5F5F0",
  surfaceContainer: "#ebefeb",
  surfaceContainerLow: "#f1f4f1",
  surfaceContainerHigh: "#e5e9e5",
  surfaceContainerLowest: "#ffffff",
  onSurface: "#2B2B2B",
  onSurfaceVariant: "#5d5f5b",
  outline: "#6e7a74",
  outlineVariant: "#bec9c3",
};

const MaterialIcon = ({ name, filled = false, style = {}, className = "" }) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      ...style,
    }}
  >
    {name}
  </span>
);

const matchCountryFromPhone = (phoneVal) => {
  if (!phoneVal) return SUPPORTED_COUNTRIES.find(c => c.code === "+48") || SUPPORTED_COUNTRIES[0];
  const cleanDigits = phoneVal.replace(/\D/g, "");
  const sorted = [...SUPPORTED_COUNTRIES].sort(
    (a, b) => b.code.replace(/\D/g, "").length - a.code.replace(/\D/g, "").length
  );
  for (const c of sorted) {
    const codeDigits = c.code.replace(/\D/g, "");
    if (cleanDigits.startsWith(codeDigits)) {
      return c;
    }
  }
  return SUPPORTED_COUNTRIES.find(c => c.code === "+48") || SUPPORTED_COUNTRIES[0];
};

const getPhoneInitialValue = (draft, country) => {
  const prefix = country.code;
  let local = "";
  if (draft.startsWith(prefix)) {
    local = draft.slice(prefix.length).replace(/\D/g, "");
  } else {
    local = draft.replace(/\D/g, "");
    const prefixDigits = prefix.replace(/\D/g, "");
    if (local.startsWith(prefixDigits)) {
      local = local.slice(prefixDigits.length);
    }
  }
  const truncatedLocal = local.slice(0, country.phoneLength);
  return prefix + (truncatedLocal ? " " + truncatedLocal : "");
};

export default function DeliverySignIn() {
  const navigate = useNavigate();
  const { t, changeLanguage } = useTranslation();
  const submitting = useRef(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState(() => {
    const draft = sessionStorage.getItem("delivery_draft_phone");
    if (draft) return matchCountryFromPhone(draft);
    const stored = sessionStorage.getItem("deliveryAuthData");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.phone) return matchCountryFromPhone(data.phone);
      } catch (e) { }
    }
    return SUPPORTED_COUNTRIES.find(c => c.code === "+48") || SUPPORTED_COUNTRIES[0];
  });

  const [phone, setPhone] = useState(() => {
    let draft = sessionStorage.getItem("delivery_draft_phone") || "";
    if (!draft) {
      const stored = sessionStorage.getItem("deliveryAuthData");
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.phone) draft = data.phone;
        } catch (e) { }
      }
    }
    const country = matchCountryFromPhone(draft);
    const prefix = country.code;
    if (draft.startsWith(prefix)) {
      return draft.slice(prefix.length).replace(/\D/g, "").slice(0, country.phoneLength);
    }
    return draft.replace(/\D/g, "").slice(0, country.phoneLength);
  });

  const normalizedPhone = () => {
    const cleanDigits = phone.replace(/\D/g, "");
    return cleanDigits.length === selectedCountry.phoneLength ? `${selectedCountry.code}${cleanDigits}` : "";
  };

  const handlePhoneChange = (val, country) => {
    const cleanDigits = val.replace(/\D/g, "").slice(0, country.phoneLength);
    setPhone(cleanDigits);
    sessionStorage.setItem("delivery_draft_phone", country.code + cleanDigits);
  };

  const handleCountryChange = (country) => {
    setSelectedCountry(country);
    const slicedDigits = phone.slice(0, country.phoneLength);
    setPhone(slicedDigits);
    sessionStorage.setItem("delivery_draft_phone", country.code + slicedDigits);
  };

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault();
    const fullPhone = normalizedPhone();
    if (!fullPhone) {
      toast.error(`Please enter a valid mobile number (${selectedCountry.phoneLength} digits)`);
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);

    try {
      clearModuleAuth("delivery");
      await deliveryAPI.sendOTP(fullPhone, "login");

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        purpose: "login",
        module: "delivery",
      };
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData));
      toast.success("Verification code sent to your phone!");
      navigate("/food/delivery/otp");
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP.";
      toast.error(msg);
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          background: COLORS.surface,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <header
          style={{
            width: "100%",
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: COLORS.surface,
            borderBottom: `1px solid ${COLORS.outlineVariant}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              height: "56px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => navigate("/food/delivery/welcome")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                  borderRadius: "9999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: COLORS.primary,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceContainerLow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <MaterialIcon name="arrow_back" style={{ color: COLORS.primary }} />
              </button>
              <h1
                style={{
                  marginLeft: "16px",
                  fontSize: "18px",
                  lineHeight: "24px",
                  fontWeight: 600,
                  color: COLORS.primary,
                }}
              >
                DailyMealBox
              </h1>
            </div>

            {/* Language Switcher */}
            <select
              value={localStorage.getItem("app_lang") || "en"}
              onChange={(e) => changeLanguage(e.target.value)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid ${COLORS.outlineVariant}`,
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 600,
                color: COLORS.outline,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="en">English</option>
              <option value="pl">Polski</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>
        </header>

        {/* Main */}
        <main
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          {/* Card */}
          <div
            style={{
              width: "100%",
              maxWidth: "448px",
              background: COLORS.surfaceContainerLowest,
              border: `1px solid ${COLORS.outlineVariant}`,
              borderRadius: "12px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* Welcome */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h2
                style={{
                  fontSize: "28px",
                  lineHeight: "36px",
                  letterSpacing: "-0.02em",
                  fontWeight: 700,
                  color: COLORS.onSurface,
                  margin: 0,
                }}
              >
                {t("welcome_heading", "Welcome")}
              </h2>
              <p
                style={{
                  fontSize: "14px",
                  lineHeight: "20px",
                  fontWeight: 400,
                  color: COLORS.onSurfaceVariant,
                  margin: 0,
                }}
              >
                {t("login_phone_subtitle", "Enter your phone number to sign in")}
              </p>
            </div>

            {/* Image */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "160px",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAIubMPXLUvG0E0qRemNMJuGQl6YWAZTZgzhB9mHOzEzS0MVDHTcA0KFL5qNvxFMtoTdHP3dpgf1CYqxDTlaKjYINxQ0SHb4GwMHsSTzgSkMtCYvSZTw3QwPC9LVoW9a3Bb3jZG5pTZUQv15KicG1DdRlhJ75BJn7RMpCxa9rUQZlB2AR-9knFhPMibT_Haz8GtJ2QcQtfFMGid-ST5kcfQYKT0C89Ih_Nm6IMhrtIChN32GeRYCA6EZt69MpaewtcVJFJyghRjVJH4"
                alt="Courier on bike"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.2), transparent)",
                }}
              />
            </div>

            {/* Form */}
            <form
              onSubmit={handleSendOTP}
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              <div>
                <label
                  htmlFor="phone"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    lineHeight: "16px",
                    letterSpacing: "0.05em",
                    fontWeight: 600,
                    color: COLORS.onSurfaceVariant,
                    marginBottom: "8px",
                  }}
                >
                  Phone Number
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {/* Country Picker */}
                  <CountrySelector
                    selectedCountry={selectedCountry}
                    onSelect={handleCountryChange}
                    className="shrink-0"
                    buttonClassName="flex items-center justify-between gap-1 px-3 h-[48px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 rounded-md shadow-sm hover:border-gray-400 dark:hover:border-gray-600 transition-colors shrink-0 cursor-pointer min-w-[95px]"
                  />

                  {/* Phone Input */}
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value, selectedCountry)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={selectedCountry.placeholder}
                    maxLength={selectedCountry.phoneLength}
                    required
                    style={{
                      flexGrow: 1,
                      height: "48px",
                      padding: "0 16px",
                      background: "#ffffff",
                      border: `1px solid ${focused ? COLORS.primary : COLORS.outlineVariant}`,
                      borderRadius: "12px",
                      fontSize: "16px",
                      lineHeight: "24px",
                      fontWeight: 500,
                      color: COLORS.onSurface,
                      outline: focused ? `2px solid ${COLORS.primary}` : "none",
                      outlineOffset: "-1px",
                      transition: "border 0.15s, outline 0.15s",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !normalizedPhone()}
                style={{
                  width: "100%",
                  height: "52px",
                  background: COLORS.primaryContainer,
                  color: "#ffffff",
                  fontSize: "18px",
                  lineHeight: "24px",
                  fontWeight: 600,
                  borderRadius: "12px",
                  border: "none",
                  cursor: (loading || !normalizedPhone()) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  transition: "opacity 0.15s, transform 0.15s",
                  fontFamily: "inherit",
                  opacity: (loading || !normalizedPhone()) ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading && normalizedPhone()) e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  if (!loading && normalizedPhone()) e.currentTarget.style.opacity = "1";
                }}
                onMouseDown={(e) => {
                  if (!loading && normalizedPhone()) e.currentTarget.style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  if (!loading && normalizedPhone()) e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {loading ? "Sending..." : t("send_otp")}
                <MaterialIcon name="chevron_right" style={{ color: "#ffffff" }} />
              </button>
            </form>

            {/* Secondary Actions */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                paddingTop: "8px",
                borderTop: `1px solid ${COLORS.outlineVariant}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", gap: "24px" }}>
                <Link
                  to="/food/delivery/profile/terms"
                  state={{ backTo: "/food/delivery/login" }}
                  style={{
                    fontSize: "10px",
                    lineHeight: "14px",
                    letterSpacing: "0.02em",
                    fontWeight: 700,
                    color: COLORS.onSurfaceVariant,
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                >
                  Terms of Service
                </Link>
                <Link
                  to="/food/delivery/profile/privacy"
                  state={{ backTo: "/food/delivery/login" }}
                  style={{
                    fontSize: "10px",
                    lineHeight: "14px",
                    letterSpacing: "0.02em",
                    fontWeight: 700,
                    color: COLORS.onSurfaceVariant,
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                >
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>

          {/* Support Footer */}
          <div style={{ marginTop: "32px", textAlign: "center" }}>
            <p
              style={{
                fontSize: "13px",
                lineHeight: "18px",
                fontWeight: 400,
                color: COLORS.onSurfaceVariant,
              }}
            >
              Having trouble?{" "}
              <span
                onClick={() => navigate("/food/delivery/support", { state: { backTo: "/food/delivery/login" } })}
                style={{
                  color: COLORS.primary,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Contact Support
              </span>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
