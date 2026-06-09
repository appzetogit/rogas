import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import { EMAIL_REGEX } from "@/shared/utils/emailValidation";
import { deliveryAPI } from "@/services/api";

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

export default function SignupStep1() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const [focusedField, setFocusedField] = useState(null);

  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDetails");
    const base = {
      name: "",
      phone: "",
      countryCode: "+91",
      ref: "",
      email: "",
      address: "",
      city: "",
      state: "",
      vehicleType: "bike",
      vehicleName: "",
      vehicleNumber: "",
      drivingLicenseNumber: "",
      zoneId: "",
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Omit legacy fields if present
        delete parsed.aadharNumber;
        delete parsed.panNumber;
        return { ...base, ...parsed };
      } catch (e) {
        // Ignore
      }
    }
    return base;
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zones, setZones] = useState([]);
  const [isLoadingZones, setIsLoadingZones] = useState(true);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const res = await deliveryAPI.getPublicZones();
        if (res.data?.success) {
          setZones(res.data.data.zones || []);
        }
      } catch (error) {
        console.error("Failed to load zones", error);
      } finally {
        setIsLoadingZones(false);
      }
    };
    fetchZones();
  }, []);

  const sanitizeLocationValue = (value) =>
    value.replace(/[^A-Za-z\s.-]/g, "").replace(/\s{2,}/g, " ");

  const sanitizeNameValue = (value) =>
    value.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ");

  const isValidLocationValue = (value) =>
    /^[A-Za-z][A-Za-z\s.-]*[A-Za-z.]$/.test(value.trim());

  const isValidNameValue = (value) =>
    /^[A-Za-z][A-Za-z\s]*[A-Za-z]$/.test(value.trim());

  const isValidEmailValue = (value) => {
    const normalizedValue = value.trim();
    return EMAIL_REGEX.test(normalizedValue);
  };

  const sanitizeEmailValue = (value) =>
    value.replace(/\s/g, "").toLowerCase();

  useEffect(() => {
    sessionStorage.setItem("deliverySignupDetails", JSON.stringify(formData));
  }, [formData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let updatedValue = value;

    if (name === "vehicleNumber" || name === "drivingLicenseNumber") {
      updatedValue = value.toUpperCase();
    }

    if (name === "name") {
      updatedValue = sanitizeNameValue(value);
    }

    if (name === "vehicleNumber") {
      updatedValue = updatedValue.slice(0, 10);
    }

    if (name === "drivingLicenseNumber") {
      updatedValue = updatedValue.replace(/[^A-Z0-9]/g, "").slice(0, 15);
    }

    if (name === "city" || name === "state") {
      updatedValue = sanitizeLocationValue(value);
    }

    if (name === "email") {
      updatedValue = sanitizeEmailValue(value);
      if (updatedValue && !isValidEmailValue(updatedValue)) {
        setErrors((prev) => ({ ...prev, email: "Please enter a valid email address" }));
      } else if (!updatedValue) {
        setErrors((prev) => ({ ...prev, email: "Email is required" }));
      } else {
        setErrors((prev) => ({ ...prev, email: "" }));
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: updatedValue,
    }));

    if (name !== "email" && errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!isValidNameValue(formData.name)) {
      newErrors.name = "Name can contain letters only";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!isValidEmailValue(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required";
    }

    if (!formData.zoneId) {
      newErrors.zoneId = "Please select a zone";
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required";
    } else if (!isValidLocationValue(formData.city)) {
      newErrors.city = "City can contain letters only";
    }

    if (!formData.state.trim()) {
      newErrors.state = "State is required";
    } else if (!isValidLocationValue(formData.state)) {
      newErrors.state = "State can contain letters only";
    }

    if (!formData.vehicleNumber.trim()) {
      newErrors.vehicleNumber = "Vehicle number is required";
    } else if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(formData.vehicleNumber)) {
      newErrors.vehicleNumber = "Invalid format (e.g., MH12AB1234)";
    }

    if (!formData.drivingLicenseNumber.trim()) {
      newErrors.drivingLicenseNumber = "Driving license is required";
    } else if (!/^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/.test(formData.drivingLicenseNumber)) {
      newErrors.drivingLicenseNumber = "Invalid DL format (e.g., MH1220110012345)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      toast.error("Please fill all required fields correctly");
      return;
    }

    setIsSubmitting(true);

    try {
      const details = {
        name: formData.name.trim(),
        phone: String(formData.phone || "").replace(/\D/g, "").slice(0, 15),
        countryCode: formData.countryCode || "+91",
        ref: String(formData.ref || "").trim() || "",
        email: formData.email?.trim() || "",
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        vehicleType: formData.vehicleType || "bike",
        vehicleName: formData.vehicleName?.trim() || "",
        vehicleNumber: formData.vehicleNumber.trim(),
        drivingLicenseNumber: formData.drivingLicenseNumber.trim().toUpperCase(),
        zoneId: formData.zoneId,
      };
      sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details));
      toast.success("Details saved");
      navigate("/food/delivery/signup/documents");
    } catch (error) {
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInputStyle = (name) => ({
    width: "100%",
    height: "48px",
    padding: "0 16px",
    boxSizing: "border-box",
    background: "#ffffff",
    border: `1px solid ${errors[name] ? "#C5221F" : focusedField === name ? COLORS.primary : COLORS.outlineVariant}`,
    borderRadius: "12px",
    fontSize: "16px",
    color: COLORS.onSurface,
    outline: focusedField === name ? `1.5px solid ${COLORS.primary}` : "none",
    transition: "border 0.15s, outline 0.15s",
    fontFamily: "inherit",
  });

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
          <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: "56px" }}>
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
              Complete Profile
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
            padding: "24px 16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              background: COLORS.surfaceContainerLowest,
              border: `1px solid ${COLORS.outlineVariant}`,
              borderRadius: "12px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            {/* Step Progress */}
            <section style={{ marginBottom: "8px" }}>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: 600, margin: 0 }}>
                  3-step registration
                </h2>
                <p style={{ fontSize: "13px", lineHeight: "18px", color: COLORS.onSurfaceVariant, marginTop: "4px", marginBottom: 0 }}>
                  Step 1: Basic Details
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
                {[1, 2, 3].map((step, i) => (
                  <div key={step} style={{ display: "flex", alignItems: "center", flexGrow: i < 2 ? 1 : 0 }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "9999px",
                      background: step <= 1 ? COLORS.primary : COLORS.surfaceContainer,
                      color: step <= 1 ? "#fff" : COLORS.secondary,
                      border: step > 1 ? `1px solid ${COLORS.outlineVariant}` : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: "16px", flexShrink: 0, zIndex: 1,
                      boxShadow: step === 1 ? `0 0 0 6px rgba(158,243,215,0.3)` : "none",
                    }}>
                      {step}
                    </div>
                    {i < 2 && (
                      <div style={{
                        height: "2px", flexGrow: 1, margin: "0 8px",
                        background: step < 1 ? COLORS.primary : COLORS.outlineVariant,
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Title section */}
            <div>
              <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: 700, color: COLORS.onSurface, margin: "0 0 4px" }}>
                Basic Details
              </h2>
              <p style={{ fontSize: "14px", lineHeight: "20px", color: COLORS.onSurfaceVariant, margin: 0 }}>
                Please provide your information to continue
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Name */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Full Name <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                  style={getInputStyle("name")}
                  placeholder="Enter your full name"
                />
                {errors.name && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Email <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  style={getInputStyle("email")}
                  placeholder="Enter your email"
                />
                {errors.email && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.email}</p>}
              </div>

              {/* Address */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Address <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("address")}
                  onBlur={() => setFocusedField(null)}
                  rows={3}
                  style={{
                    ...getInputStyle("address"),
                    height: "auto",
                    padding: "12px 16px",
                  }}
                  placeholder="Enter your address"
                />
                {errors.address && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.address}</p>}
              </div>

              {/* Zone */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Delivery Zone <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <select
                  name="zoneId"
                  value={formData.zoneId}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("zoneId")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    ...getInputStyle("zoneId"),
                    cursor: "pointer",
                  }}
                  disabled={isLoadingZones}
                >
                  <option value="" disabled>
                    {isLoadingZones ? "Loading zones..." : "Select a zone"}
                  </option>
                  {zones.map((zone) => (
                    <option key={zone._id} value={zone._id}>
                      {zone.name || zone.zoneName}
                    </option>
                  ))}
                </select>
                {errors.zoneId && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.zoneId}</p>}
              </div>

              {/* City & State */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                    City <span style={{ color: "#C5221F" }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("city")}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle("city")}
                    placeholder="City"
                  />
                  {errors.city && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.city}</p>}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                    State <span style={{ color: "#C5221F" }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("state")}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle("state")}
                    placeholder="State"
                  />
                  {errors.state && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.state}</p>}
                </div>
              </div>

              {/* Vehicle Type */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Vehicle Type <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <select
                  name="vehicleType"
                  value={formData.vehicleType}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("vehicleType")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    ...getInputStyle("vehicleType"),
                    cursor: "pointer",
                  }}
                >
                  <option value="bike">Bike</option>
                  <option value="scooter">Scooter</option>
                  <option value="bicycle">Bicycle</option>
                  <option value="car">Car</option>
                </select>
              </div>

              {/* Vehicle Name */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Vehicle Name/Model (Optional)
                </label>
                <input
                  type="text"
                  name="vehicleName"
                  value={formData.vehicleName}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("vehicleName")}
                  onBlur={() => setFocusedField(null)}
                  style={getInputStyle("vehicleName")}
                  placeholder="e.g., Honda Activa"
                />
              </div>

              {/* Vehicle Number */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Vehicle Number <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <input
                  type="text"
                  name="vehicleNumber"
                  value={formData.vehicleNumber}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("vehicleNumber")}
                  onBlur={() => setFocusedField(null)}
                  maxLength={10}
                  style={getInputStyle("vehicleNumber")}
                  placeholder="e.g., MH12AB1234"
                />
                {errors.vehicleNumber && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.vehicleNumber}</p>}
              </div>

              {/* Driving License Number */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: COLORS.onSurfaceVariant, marginBottom: "6px" }}>
                  Driving License Number <span style={{ color: "#C5221F" }}>*</span>
                </label>
                <input
                  type="text"
                  name="drivingLicenseNumber"
                  value={formData.drivingLicenseNumber}
                  onChange={handleChange}
                  onFocus={() => setFocusedField("drivingLicenseNumber")}
                  onBlur={() => setFocusedField(null)}
                  maxLength={15}
                  style={getInputStyle("drivingLicenseNumber")}
                  placeholder="e.g., MH1220110012345"
                />
                {errors.drivingLicenseNumber && <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{errors.drivingLicenseNumber}</p>}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !formData.email || !isValidEmailValue(formData.email) || Object.values(errors).some((err) => err !== "")}
                style={{
                  width: "100%",
                  height: "52px",
                  background: COLORS.primaryContainer,
                  color: "#ffffff",
                  fontSize: "16px",
                  fontWeight: 600,
                  borderRadius: "12px",
                  border: "none",
                  cursor: (isSubmitting || !formData.email || !isValidEmailValue(formData.email) || Object.values(errors).some((err) => err !== "")) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: "16px",
                  transition: "opacity 0.2s, transform 0.2s",
                  opacity: (isSubmitting || !formData.email || !isValidEmailValue(formData.email) || Object.values(errors).some((err) => err !== "")) ? 0.6 : 1,
                }}
                onMouseDown={(e) => {
                  if (!isSubmitting && formData.email && isValidEmailValue(formData.email) && !Object.values(errors).some((err) => err !== "")) {
                    e.currentTarget.style.transform = "scale(0.98)";
                  }
                }}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                {isSubmitting ? "Saving..." : "Continue"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </>
  );
}
