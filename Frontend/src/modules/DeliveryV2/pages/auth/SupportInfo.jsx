import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import { publicGetOnce } from "@food/api";

const COLORS = {
  primary: "#1F7A63",
  primaryContainer: "#1F7A63",
  onPrimary: "#ffffff",
  surface: "#F5F5F0",
  surfaceContainer: "#ebefeb",
  surfaceContainerLow: "#f1f4f1",
  surfaceContainerLowest: "#ffffff",
  onSurface: "#2B2B2B",
  onSurfaceVariant: "#5d5f5b",
  outline: "#6e7a74",
  outlineVariant: "#bec9c3",
};

const MaterialIcon = ({ name, style = {}, className = "" }) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      ...style,
    }}
  >
    {name}
  </span>
);

export default function SupportInfo() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await publicGetOnce("/food/admin/business-settings/public");
        if (response?.data?.data) {
          setSettings(response.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch business settings", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  return (
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        background: COLORS.surface,
        color: COLORS.onSurface,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: "600px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px",
            background: COLORS.surfaceContainerLowest,
            borderBottom: `1px solid ${COLORS.outlineVariant}`,
          }}
        >
          <button
            onClick={goBack}
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
            }}
          >
            <MaterialIcon name="arrow_back" style={{ color: COLORS.primary }} />
          </button>
          <h1
            style={{
              marginLeft: "16px",
              fontSize: "18px",
              fontWeight: 600,
              color: COLORS.primary,
              margin: 0,
            }}
          >
            Support
          </h1>
        </header>

      <main style={{ padding: "24px", flexGrow: 1 }}>
        {loading ? (
          <p style={{ textAlign: "center", color: COLORS.onSurfaceVariant }}>Loading...</p>
        ) : settings ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Email Card */}
            <a 
              href={`mailto:${settings.supportEmail}`}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `mailto:${settings.supportEmail}`;
              }}
              style={{
                background: COLORS.surfaceContainerLowest,
                borderRadius: "16px",
                padding: "20px",
                border: `1px solid ${COLORS.outlineVariant}`,
                display: "flex",
                alignItems: "center",
                gap: "16px",
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
              }}
            >
              <div style={{
                width: "48px", height: "48px", borderRadius: "12px",
                background: "rgba(31,122,99,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <MaterialIcon name="mail" style={{ color: COLORS.primary, fontSize: "24px" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "13px", color: COLORS.outline, marginBottom: "2px", fontWeight: 600 }}>Email Support</h2>
                <p style={{ fontSize: "16px", fontWeight: 600, color: COLORS.onSurface, margin: 0 }}>
                  {settings.supportEmail || "N/A"}
                </p>
              </div>
              <MaterialIcon name="chevron_right" style={{ color: COLORS.outline }} />
            </a>

            {/* Phone Card */}
            <a 
              href={`tel:${settings.supportPhone}`}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `tel:${settings.supportPhone}`;
              }}
              style={{
                background: COLORS.surfaceContainerLowest,
                borderRadius: "16px",
                padding: "20px",
                border: `1px solid ${COLORS.outlineVariant}`,
                display: "flex",
                alignItems: "center",
                gap: "16px",
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
              }}
            >
              <div style={{
                width: "48px", height: "48px", borderRadius: "12px",
                background: "rgba(31,122,99,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <MaterialIcon name="call" style={{ color: COLORS.primary, fontSize: "24px" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "13px", color: COLORS.outline, marginBottom: "2px", fontWeight: 600 }}>Call Support</h2>
                <p style={{ fontSize: "16px", fontWeight: 600, color: COLORS.onSurface, margin: 0 }}>
                  {settings.supportPhone || "N/A"}
                </p>
              </div>
              <MaterialIcon name="chevron_right" style={{ color: COLORS.outline }} />
            </a>

            {/* Support Hours */}
            <div style={{
              background: COLORS.surfaceContainerLowest,
              borderRadius: "16px",
              padding: "20px",
              border: `1px solid ${COLORS.outlineVariant}`,
              display: "flex",
              alignItems: "center",
              gap: "16px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
            }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "12px",
                background: "rgba(31,122,99,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <MaterialIcon name="schedule" style={{ color: COLORS.primary, fontSize: "24px" }} />
              </div>
              <div>
                <h2 style={{ fontSize: "13px", color: COLORS.outline, marginBottom: "2px", fontWeight: 600 }}>Support Hours</h2>
                <p style={{ fontSize: "16px", fontWeight: 600, color: COLORS.onSurface, margin: 0 }}>
                  {settings.supportHours || "Available 24/7"}
                </p>
              </div>
            </div>

            {/* Terms and Conditions */}
            {settings.termsAndConditionsPdf?.url && (
              <a 
                href={settings.termsAndConditionsPdf.url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  background: COLORS.surfaceContainerLowest,
                  borderRadius: "16px",
                  padding: "20px",
                  border: `1px solid ${COLORS.outlineVariant}`,
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                }}
              >
                <div style={{
                  width: "48px", height: "48px", borderRadius: "12px",
                  background: "rgba(31,122,99,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <MaterialIcon name="description" style={{ color: COLORS.primary, fontSize: "24px" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: "13px", color: COLORS.outline, marginBottom: "2px", fontWeight: 600 }}>Documents</h2>
                  <p style={{ fontSize: "16px", fontWeight: 600, color: COLORS.onSurface, margin: 0 }}>
                    Terms & Conditions
                  </p>
                </div>
                <MaterialIcon name="open_in_new" style={{ color: COLORS.outline }} />
              </a>
            )}
          </div>
        ) : (
          <p style={{ textAlign: "center", color: COLORS.onSurfaceVariant }}>
            Could not load support info.
          </p>
        )}
      </main>
      </div>
    </div>
  );
}
