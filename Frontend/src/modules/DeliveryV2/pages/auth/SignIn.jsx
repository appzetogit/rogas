import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { deliveryAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";

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

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + " " + digits.slice(3);
  return digits.slice(0, 3) + " " + digits.slice(3, 6) + " " + digits.slice(6);
}

export default function DeliverySignIn() {
  const navigate = useNavigate();
  const submitting = useRef(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const [phone, setPhone] = useState(() => {
    const draft = sessionStorage.getItem("delivery_draft_phone");
    if (draft) return formatPhone(draft);
    const stored = sessionStorage.getItem("deliveryAuthData");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.phone) {
          const raw = data.phone.replace("+48", "").trim();
          return formatPhone(raw);
        }
      } catch (e) {
        return "";
      }
    }
    return "";
  });

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    sessionStorage.setItem("delivery_draft_phone", formatted.replace(/\s/g, ""));
  };

  const validatePhone = (num) => {
    const digits = num.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 11;
  };

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault();
    if (!validatePhone(phone)) {
      toast.error("Please enter a valid mobile number (9 digits)");
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);

    const rawPhone = phone.replace(/\s/g, "");
    const fullPhone = `+48 ${rawPhone}`.trim();

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

  const handleCountryPicker = () => {
    toast.info("Defaulting to Poland (+48)");
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
              padding: "0 16px",
              height: "56px",
            }}
          >
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
                Welcome Back
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
                Enter your phone number to sign in
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
                  <button
                    type="button"
                    onClick={handleCountryPicker}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "0 12px",
                      height: "48px",
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.outlineVariant}`,
                      borderRadius: "12px",
                      cursor: "pointer",
                      transition: "background 0.15s",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceContainerHigh)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surface)}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        lineHeight: "20px",
                        fontWeight: 400,
                        color: COLORS.onSurface,
                        fontFamily: "inherit",
                      }}
                    >
                      +48
                    </span>
                    <MaterialIcon
                      name="expand_more"
                      style={{ fontSize: "18px", color: COLORS.onSurfaceVariant }}
                    />
                  </button>

                  {/* Phone Input */}
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder="000 000 000"
                    maxLength={11}
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
                disabled={loading || phone.replace(/\s/g, "").length < 9}
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
                  cursor: (loading || phone.replace(/\s/g, "").length < 9) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  transition: "opacity 0.15s, transform 0.15s",
                  fontFamily: "inherit",
                  opacity: (loading || phone.replace(/\s/g, "").length < 9) ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!loading && phone.replace(/\s/g, "").length >= 9) e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  if (!loading && phone.replace(/\s/g, "").length >= 9) e.currentTarget.style.opacity = "1";
                }}
                onMouseDown={(e) => {
                  if (!loading && phone.replace(/\s/g, "").length >= 9) e.currentTarget.style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  if (!loading && phone.replace(/\s/g, "").length >= 9) e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {loading ? "Sending..." : "Send OTP"}
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
              <button
                onClick={() => navigate("/food/delivery/signup/details")}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: "16px",
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                  color: COLORS.primary,
                  textTransform: "uppercase",
                  borderRadius: "8px",
                  transition: "background 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceContainerLow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                New courier? Apply Now
              </button>
              <div style={{ display: "flex", justifyContent: "center", gap: "24px" }}>
                <Link
                  to="/food/delivery/profile/terms"
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
                onClick={() => toast.info("Support contact: support@dailymealbox.com")}
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
