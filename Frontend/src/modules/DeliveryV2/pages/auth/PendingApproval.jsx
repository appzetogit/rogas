import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const COLORS = {
  primary: "#00604c",
  surface: "#f9faf6",
  onSurface: "#2B2B2B",
  onSurfaceVariant: "#5d5f5b",
  outlineVariant: "#bec9c3",
};

/** Shown right after a driver finishes registration: the application now waits for admin approval. */
export default function PendingApproval() {
  const { t } = useTranslation("driver");
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: COLORS.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'DM Sans', sans-serif",
        color: COLORS.onSurface,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "24px",
          border: `1px solid ${COLORS.outlineVariant}`,
          padding: "32px 24px",
          textAlign: "center",
          boxShadow: "0 12px 32px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            width: "76px",
            height: "76px",
            borderRadius: "9999px",
            background: "#FEF9C3",
            margin: "0 auto 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "40px", color: "#EAB308" }}>
            hourglass_top
          </span>
        </div>

        <h1 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: 700, color: COLORS.primary, margin: "0 0 10px" }}>
          {t("Application submitted")}
        </h1>
        <p style={{ fontSize: "15px", lineHeight: "22px", color: COLORS.onSurfaceVariant, margin: "0 0 8px" }}>
          {t("Your registration is pending admin approval.")}
        </p>
        <p style={{ fontSize: "13px", lineHeight: "19px", color: COLORS.onSurfaceVariant, margin: "0 0 28px" }}>
          {t("We will notify you as soon as your documents are verified. You can log in once you are approved.")}
        </p>

        <button
          type="button"
          onClick={() => navigate("/food/delivery/login", { replace: true })}
          style={{
            width: "100%",
            height: "50px",
            borderRadius: "12px",
            border: "none",
            background: COLORS.primary,
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "10px",
            fontFamily: "inherit",
          }}
        >
          {t("Back to Login")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/food/delivery/support")}
          style={{
            width: "100%",
            height: "46px",
            borderRadius: "12px",
            border: `1px solid ${COLORS.outlineVariant}`,
            background: "#fff",
            color: COLORS.primary,
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("Contact Support")}
        </button>
      </div>
    </div>
  );
}
