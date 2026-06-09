import { useState } from "react";
import { useNavigate } from "react-router-dom";

const COLORS = {
  primary: "#00604c",
  primaryContainer: "#1f7a63",
  onPrimaryContainer: "#b1ffe4",
  primaryFixed: "#9ef3d7",
  primaryFixedDim: "#82d6bb",
  onPrimary: "#ffffff",
  background: "#f7faf7",
  surface: "#f7faf7",
  surfaceContainer: "#ebefeb",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerHigh: "#e5e9e5",
  onSurface: "#181d1b",
  onSurfaceVariant: "#3e4945",
  outline: "#6e7a74",
  outlineVariant: "#bec9c3",
};

const MaterialIcon = ({ name, filled = false, className = "", style = {} }) => (
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

const VehicleCard = ({ icon, label, rate, selected, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      borderRadius: "12px",
      border: selected ? `1px solid ${COLORS.primary}` : `1px solid ${COLORS.outlineVariant}`,
      background: selected ? COLORS.primary : COLORS.surfaceContainerLowest,
      color: selected ? COLORS.onPrimary : COLORS.onSurface,
      cursor: "pointer",
      transition: "all 0.15s ease",
      boxShadow: selected ? "0 4px 12px rgba(0,96,76,0.25)" : "none",
      transform: "scale(1)",
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
  >
    <MaterialIcon
      name={icon}
      filled={selected}
      style={{
        fontSize: "28px",
        marginBottom: "6px",
        color: selected ? COLORS.onPrimary : COLORS.primary,
      }}
    />
    <span style={{ fontWeight: 700, fontSize: "14px", lineHeight: "20px" }}>{label}</span>
    <span
      style={{
        fontSize: "12px",
        lineHeight: "16px",
        letterSpacing: "0.05em",
        opacity: selected ? 0.8 : undefined,
        color: selected ? undefined : COLORS.onSurfaceVariant,
        fontWeight: 600,
      }}
    >
      {rate}
    </span>
  </button>
);

const FeatureCard = ({ icon, title, description }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "16px",
      padding: "16px",
      background: COLORS.surfaceContainerLowest,
      border: `1px solid ${COLORS.outlineVariant}`,
      borderRadius: "12px",
    }}
  >
    <div
      style={{
        width: "40px",
        height: "40px",
        borderRadius: "8px",
        background: "rgba(0,96,76,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <MaterialIcon name={icon} style={{ color: COLORS.primary }} />
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontWeight: 700, fontSize: "14px", lineHeight: "20px", color: COLORS.onSurface }}>
        {title}
      </span>
      <span style={{ fontSize: "13px", lineHeight: "18px", color: COLORS.onSurfaceVariant, fontWeight: 400 }}>
        {description}
      </span>
    </div>
  </div>
);

export default function DeliveryWelcome() {
  const [selectedVehicle, setSelectedVehicle] = useState("ebike");
  const navigate = useNavigate();

  const vehicles = [
    { id: "bicycle", icon: "pedal_bike", label: "Bicycle", rate: "18-22 PLN/h" },
    { id: "ebike", icon: "electric_bolt", label: "E-bike", rate: "28-35 PLN/h" },
  ];

  const features = [
    {
      icon: "bolt",
      title: "Instant payout available",
      description: "Get your earnings immediately after each delivery.",
    },
    {
      icon: "near_me",
      title: "Smart optimised routes",
      description: "AI-driven navigation to maximize your deliveries per hour.",
    },
    {
      icon: "dashboard",
      title: "Earnings dashboard",
      description: "Real-time tracking of bonuses, tips, and daily goals.",
    },
  ];

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
          background: COLORS.background,
          color: COLORS.onSurface,
          minHeight: "100vh",
          overflowX: "hidden",
          paddingBottom: "96px",
        }}
      >
        {/* Hero Section */}
        <section
          style={{
            position: "relative",
            padding: "32px 16px 48px",
            overflow: "hidden",
          }}
        >
          {/* Background blob */}
          <div
            style={{
              position: "absolute",
              top: "-48px",
              right: "-48px",
              width: "256px",
              height: "256px",
              background: COLORS.primaryFixed,
              opacity: 0.2,
              borderRadius: "9999px",
              filter: "blur(48px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* App Icon */}
            <div
              style={{
                width: "80px",
                height: "80px",
                background: COLORS.primaryContainer,
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "24px",
                boxShadow: "0 8px 24px rgba(0,96,76,0.3)",
              }}
            >
              <MaterialIcon
                name="delivery_dining"
                style={{ color: COLORS.onPrimaryContainer, fontSize: "40px" }}
              />
            </div>

            <h1
              style={{
                fontSize: "28px",
                lineHeight: "36px",
                letterSpacing: "-0.02em",
                fontWeight: 700,
                color: COLORS.primary,
                marginBottom: "8px",
              }}
            >
              DailyMealBox
            </h1>
            <p
              style={{
                fontSize: "18px",
                lineHeight: "24px",
                fontWeight: 600,
                color: COLORS.onSurfaceVariant,
                marginBottom: "4px",
              }}
            >
              Delivery Partner
            </p>
            <div
              style={{
                display: "flex",
                gap: "8px",
                color: COLORS.outline,
                fontSize: "12px",
                lineHeight: "16px",
                letterSpacing: "0.05em",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              <span>Warsaw</span>
              <span>•</span>
              <span>Berlin</span>
              <span>•</span>
              <span>Paris</span>
            </div>
          </div>

          {/* Vehicle Selection */}
          <div
            style={{
              marginTop: "40px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            {vehicles.map((v) => (
              <VehicleCard
                key={v.id}
                icon={v.icon}
                label={v.label}
                rate={v.rate}
                selected={selectedVehicle === v.id}
                onClick={() => setSelectedVehicle(v.id)}
              />
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={() => navigate("/food/delivery/login")}
            style={{
              width: "100%",
              height: "52px",
              background: COLORS.primary,
              color: COLORS.onPrimary,
              fontSize: "16px",
              lineHeight: "24px",
              fontWeight: 500,
              borderRadius: "12px",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,96,76,0.25)",
              transition: "transform 0.15s ease",
              fontFamily: "inherit",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            Join as Delivery Partner
          </button>
          <button
            onClick={() => navigate("/food/delivery/login")}
            style={{
              width: "100%",
              height: "52px",
              background: COLORS.surfaceContainer,
              color: COLORS.primary,
              fontSize: "16px",
              lineHeight: "24px",
              fontWeight: 500,
              borderRadius: "12px",
              border: `1px solid ${COLORS.outlineVariant}`,
              cursor: "pointer",
              transition: "transform 0.15s ease",
              fontFamily: "inherit",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            I already have an account
          </button>
        </section>

        {/* Value Propositions */}
        <section style={{ marginTop: "48px", padding: "0 16px" }}>
          <h2
            style={{
              fontSize: "12px",
              lineHeight: "16px",
              letterSpacing: "0.05em",
              fontWeight: 600,
              color: COLORS.outline,
              textTransform: "uppercase",
              marginBottom: "16px",
              paddingLeft: "4px",
            }}
          >
            Why drive with us?
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {features.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </section>

        {/* Bottom placeholder image area */}
        {/* <section style={{ marginTop: "48px", padding: "0 16px 48px" }}>
          <div
            style={{
              width: "100%",
              height: "192px",
              borderRadius: "16px",
              border: `1px solid ${COLORS.outlineVariant}`,
              background: `linear-gradient(135deg, ${COLORS.primaryFixed}40, ${COLORS.surfaceContainerHigh})`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcon
              name="delivery_dining"
              style={{ fontSize: "64px", color: COLORS.primary, opacity: 0.15 }}
            />
          </div>
        </section> */}
      </div>
    </>
  );
}
