import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { openCamera } from "@food/utils/imageUploadUtils";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

const COLORS = {
  primary: "#1F7A63",
  primaryContainer: "#1F7A63",
  primaryFixed: "#82d6bb",
  onPrimary: "#ffffff",
  surface: "#F5F5F0",
  surfaceContainer: "#ebefeb",
  surfaceContainerHigh: "#e5e9e5",
  surfaceContainerLowest: "#ffffff",
  onSurface: "#2B2B2B",
  onSurfaceVariant: "#5d5f5b",
  outline: "#6e7a74",
  outlineVariant: "#bec9c3",
  secondary: "#5d5f5b",
  tertiary: "#854036",
  tertiaryFixed: "#ffdad5",
};

const MaterialIcon = ({ name, filled = false, style = {}, className = "" }) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      display: "inline-block",
      verticalAlign: "middle",
      ...style,
    }}
  >
    {name}
  </span>
);

const VEHICLES = [
  { id: "bicycle", icon: "pedal_bike", label: "Bicycle", rate: "18-22 PLN/h" },
  { id: "ebike",   icon: "electric_bolt", label: "E-bike",  rate: "20-25 PLN/h" },
  { id: "scooter", icon: "moped",       label: "Scooter", rate: "26-32 PLN/h" },
  { id: "car",     icon: "directions_car", label: "Car",  rate: "22-28 PLN/h" },
];

const DOCUMENTS_LIST = [
  { id: "profilePhoto", icon: "account_circle", label: "Profile Photo" },
  { id: "drivingLicensePhoto", icon: "badge", label: "Driving Licence (Front)" },
  { id: "drivingLicenseBackPhoto", icon: "badge", label: "Driving Licence (Back)" },
  { id: "nationalIdUrl", icon: "contact_mail", label: "National ID / Passport" },
  { id: "vehicleRegistrationUrl", icon: "description", label: "Vehicle Registration" },
  { id: "vehicleInsuranceUrl", icon: "verified_user", label: "Vehicle Insurance" },
];

const createEmptyUploadedDocs = () => ({
  profilePhoto: null,
  drivingLicensePhoto: null,
  drivingLicenseBackPhoto: null,
  nationalIdUrl: null,
  vehicleRegistrationUrl: null,
  vehicleInsuranceUrl: null,
});

// IndexedDB helpers for persistent file storage
const DELIVERY_FILES_DB = "DeliverySignupFiles";
const FILES_STORE = "files";

const openDeliveryFilesDB = () => {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DELIVERY_FILES_DB, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
};

const saveFileToDB = async (key, file) => {
  if (!file) return;
  try {
    const db = await openDeliveryFilesDB();
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.objectStore(FILES_STORE).put(file, key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Ignore IndexedDB failures
  }
};

const getFileFromDB = async (key) => {
  try {
    const db = await openDeliveryFilesDB();
    const tx = db.transaction(FILES_STORE, "readonly");
    const request = tx.objectStore(FILES_STORE).get(key);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
};

const deleteFileFromDB = async (key) => {
  try {
    const db = await openDeliveryFilesDB();
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.objectStore(FILES_STORE).delete(key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Ignore
  }
};

const clearAllFilesFromDB = async () => {
  try {
    const db = await openDeliveryFilesDB();
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.objectStore(FILES_STORE).clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Ignore
  }
};

const sanitizeUploadedDocValue = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    return value.startsWith("blob:") ? null : value;
  }
  if (typeof value === "object") {
    const url = typeof value.url === "string" ? value.url : "";
    if (url.startsWith("blob:")) return null;
    return value;
  }
  return null;
};

const sanitizeUploadedDocs = (docs) => ({
  profilePhoto: sanitizeUploadedDocValue(docs?.profilePhoto),
  drivingLicensePhoto: sanitizeUploadedDocValue(docs?.drivingLicensePhoto),
  drivingLicenseBackPhoto: sanitizeUploadedDocValue(docs?.drivingLicenseBackPhoto),
  nationalIdUrl: sanitizeUploadedDocValue(docs?.nationalIdUrl),
  vehicleRegistrationUrl: sanitizeUploadedDocValue(docs?.vehicleRegistrationUrl),
  vehicleInsuranceUrl: sanitizeUploadedDocValue(docs?.vehicleInsuranceUrl),
});

const getFriendlyRegistrationError = (error) => {
  const rawMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "";

  if (/E11000 duplicate key error/i.test(rawMessage)) {
    if (/vehicleNumber/i.test(rawMessage)) {
      return "This vehicle number is already registered.";
    }
    if (/drivingLicense/i.test(rawMessage)) {
      return "This driving license number is already registered.";
    }
    return "This account detail is already registered. Please check your information.";
  }
  return rawMessage || "Failed to register. Please try again.";
};

function VehicleCard({ vehicle, selected, onSelect }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      onClick={() => onSelect(vehicle.id)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        background: selected ? COLORS.primary : COLORS.surfaceContainerLowest,
        border: selected ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.outlineVariant}`,
        borderRadius: "12px",
        padding: "16px",
        cursor: "pointer",
        transition: "all 0.15s",
        transform: pressed ? "scale(0.95)" : "scale(1)",
        position: "relative",
        color: selected ? "#fff" : COLORS.onSurface,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <MaterialIcon
          name={vehicle.icon}
          filled={selected}
          style={{ color: selected ? "#fff" : COLORS.outline, fontSize: "24px" }}
        />
        {selected && (
          <MaterialIcon
            name="check_circle"
            filled
            style={{ color: COLORS.primaryFixed, fontSize: "20px" }}
          />
        )}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: "16px", lineHeight: "24px", margin: 0 }}>{vehicle.label}</p>
        <p style={{
          fontSize: "12px", lineHeight: "16px", letterSpacing: "0.05em", fontWeight: 600, margin: 0,
          color: selected ? COLORS.primaryFixed : COLORS.onSurfaceVariant,
          opacity: selected ? 0.9 : 1,
        }}>
          {vehicle.rate}
        </p>
      </div>
    </div>
  );
}

function DocumentCard({ doc, uploaded, previewSrc, onUploadClick, onRemove }) {
  const iconBg = uploaded
    ? `rgba(158,243,215,0.2)`
    : `rgba(255,218,213,0.4)`;
  const iconColor = uploaded ? COLORS.primary : COLORS.tertiary;

  return (
    <div style={{
      background: COLORS.surfaceContainerLowest,
      border: `1px solid ${COLORS.outlineVariant}`,
      borderRadius: "12px",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "40px", height: "40px", borderRadius: "8px",
            background: iconBg,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <MaterialIcon name={doc.icon} style={{ color: iconColor }} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: "14px", lineHeight: "20px", margin: 0, color: COLORS.onSurface }}>
              {doc.label}
            </p>
            {uploaded ? (
              <p style={{ fontSize: "12px", lineHeight: "16px", fontWeight: 600, color: COLORS.primary, margin: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                Uploaded <MaterialIcon name="check" style={{ fontSize: "14px", color: COLORS.primary }} />
              </p>
            ) : (
              <p style={{ fontSize: "12px", lineHeight: "16px", fontWeight: 600, color: COLORS.tertiary, margin: 0 }}>
                Not uploaded
              </p>
            )}
          </div>
        </div>
        {!uploaded ? (
          <button
            type="button"
            onClick={onUploadClick}
            style={{
              background: "#EFA134",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "12px",
              lineHeight: "16px",
              letterSpacing: "0.05em",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "filter 0.15s",
            }}
          >
            Upload
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            <MaterialIcon name="delete" style={{ color: COLORS.tertiary, fontSize: "20px" }} />
          </button>
        )}
      </div>

      {uploaded && previewSrc && (
        <div style={{ width: "100%", height: "144px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${COLORS.outlineVariant}` }}>
          <img src={previewSrc} alt={doc.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
    </div>
  );
}

export default function SignupStep2() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();

  const fileInputRefs = useRef({
    profilePhoto: null,
    drivingLicensePhoto: null,
    drivingLicenseBackPhoto: null,
    nationalIdUrl: null,
    vehicleRegistrationUrl: null,
    vehicleInsuranceUrl: null,
  });

  const [selectedVehicle, setSelectedVehicle] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDetails");
    if (saved) {
      try {
        const details = JSON.parse(saved);
        if (details.vehicleType) return details.vehicleType;
      } catch (e) {}
    }
    return "ebike";
  });

  const [documents, setDocuments] = useState({
    profilePhoto: null,
    drivingLicensePhoto: null,
    drivingLicenseBackPhoto: null,
    nationalIdUrl: null,
    vehicleRegistrationUrl: null,
    vehicleInsuranceUrl: null,
  });

  const [uploadedDocs, setUploadedDocs] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDocs");
    if (saved) {
      try {
        return sanitizeUploadedDocs(JSON.parse(saved));
      } catch (e) {}
    }
    return createEmptyUploadedDocs();
  });

  const [activePicker, setActivePicker] = useState(null); // { id, label }
  const [submitState, setSubmitState] = useState("idle"); // idle | loading | done

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const loadFiles = async () => {
      const [prof, dlFront, dlBack, nationalId, registration, insurance] = await Promise.all([
        getFileFromDB("profilePhoto"),
        getFileFromDB("drivingLicensePhoto"),
        getFileFromDB("drivingLicenseBackPhoto"),
        getFileFromDB("nationalIdUrl"),
        getFileFromDB("vehicleRegistrationUrl"),
        getFileFromDB("vehicleInsuranceUrl"),
      ]);

      setDocuments((prev) => ({
        ...prev,
        ...(prof && { profilePhoto: prof }),
        ...(dlFront && { drivingLicensePhoto: dlFront }),
        ...(dlBack && { drivingLicenseBackPhoto: dlBack }),
        ...(nationalId && { nationalIdUrl: nationalId }),
        ...(registration && { vehicleRegistrationUrl: registration }),
        ...(insurance && { vehicleInsuranceUrl: insurance }),
      }));
    };
    loadFiles();
  }, []);

  useEffect(() => {
    sessionStorage.setItem("deliverySignupDocs", JSON.stringify(uploadedDocs));
  }, [uploadedDocs]);

  // Sync selected vehicle type back to details
  const handleSelectVehicle = (vehicleId) => {
    setSelectedVehicle(vehicleId);
    const saved = sessionStorage.getItem("deliverySignupDetails");
    if (saved) {
      try {
        const details = JSON.parse(saved);
        details.vehicleType = vehicleId;
        sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details));
      } catch (e) {}
    }
  };

  const getPreviewSrc = (docType) => {
    const uploaded = uploadedDocs[docType];
    if (typeof uploaded === "string") return uploaded;
    if (uploaded?.url) return uploaded.url;

    const localFile = documents[docType];
    if (localFile instanceof File || localFile instanceof Blob) {
      if (!localFile._previewUrl) {
        localFile._previewUrl = URL.createObjectURL(localFile);
      }
      return localFile._previewUrl;
    }
    return null;
  };

  const handleFileSelect = async (docType, file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setDocuments((prev) => ({ ...prev, [docType]: file }));
    setUploadedDocs((prev) => ({ ...prev, [docType]: { file: true } }));
    await saveFileToDB(docType, file);
    toast.success("Document uploaded successfully");
  };

  const handleTakeCameraPhoto = (docType) => {
    openCamera({
      onSelectFile: (file) => handleFileSelect(docType, file),
      fileNamePrefix: `signup-${docType}`,
    });
  };

  const handlePickFromGallery = (docType) => {
    fileInputRefs.current[docType]?.click();
  };

  const handleRemove = async (docType) => {
    setDocuments((prev) => ({ ...prev, [docType]: null }));
    setUploadedDocs((prev) => ({ ...prev, [docType]: null }));
    await deleteFileFromDB(docType);
  };

  const handleSubmit = async () => {
    if (submitState !== "idle") return;

    // Validate documents
    const requiredIds = ["profilePhoto", "drivingLicensePhoto", "drivingLicenseBackPhoto", "nationalIdUrl", "vehicleRegistrationUrl", "vehicleInsuranceUrl"];
    const missing = requiredIds.filter((id) => !documents[id]);
    if (missing.length > 0) {
      toast.error("Please upload all required documents");
      return;
    }

    const raw = sessionStorage.getItem("deliverySignupDetails");
    if (!raw) {
      toast.error("Session expired. Please start from Create Account.");
      navigate("/food/delivery/signup", { replace: true });
      return;
    }

    let details;
    try {
      details = JSON.parse(raw);
    } catch {
      toast.error("Invalid session. Please start from Create Account.");
      navigate("/food/delivery/signup", { replace: true });
      return;
    }

    setSubmitState("loading");

    const formData = new FormData();
    formData.append("name", details.name || "");
    formData.append("phone", String(details.phone || "").replace(/\D/g, "").slice(0, 15));
    if (details.email) formData.append("email", String(details.email).trim());
    if (details.ref) formData.append("ref", String(details.ref).trim());
    if (details.countryCode) formData.append("countryCode", details.countryCode);
    if (details.address) formData.append("address", details.address);
    if (details.city) formData.append("city", details.city);
    if (details.state) formData.append("state", details.state);
    
    // Explicitly send the selected vehicle type
    formData.append("vehicleType", selectedVehicle);
    if (details.vehicleName) formData.append("vehicleName", details.vehicleName);
    if (details.vehicleNumber) formData.append("vehicleNumber", details.vehicleNumber);
    if (details.drivingLicenseNumber) {
      formData.append("drivingLicenseNumber", details.drivingLicenseNumber);
      formData.append("documents[drivingLicense][number]", details.drivingLicenseNumber);
    }

    // Append file buffers
    formData.append("profilePhoto", documents.profilePhoto);
    formData.append("drivingLicensePhoto", documents.drivingLicensePhoto);
    formData.append("drivingLicenseBackPhoto", documents.drivingLicenseBackPhoto);
    formData.append("nationalIdUrl", documents.nationalIdUrl);
    formData.append("vehicleRegistrationUrl", documents.vehicleRegistrationUrl);
    formData.append("vehicleInsuranceUrl", documents.vehicleInsuranceUrl);

    let fcmToken = null;
    let platform = "web";
    try {
      if (typeof window !== "undefined") {
        if (window.flutter_inappwebview) {
          platform = "mobile";
          const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
          for (const handlerName of handlerNames) {
            try {
              const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "delivery" });
              if (t && typeof t === "string" && t.length > 20) {
                fcmToken = t.trim();
                break;
              }
            } catch (e) {}
          }
        } else {
          fcmToken = localStorage.getItem("fcm_web_registered_token_delivery") || null;
        }
      }
    } catch (e) {}

    if (fcmToken) {
      formData.append("fcmToken", fcmToken);
      formData.append("platform", platform);
    }

    const isCompleteProfile = sessionStorage.getItem("deliveryNeedsRegistration") === "true";

    try {
      const response = isCompleteProfile
        ? await deliveryAPI.register(formData)
        : await deliveryAPI.completeProfile(formData);

      if (response?.data?.success) {
        setSubmitState("done");
        sessionStorage.removeItem("deliverySignupDetails");
        sessionStorage.removeItem("deliverySignupDocs");
        await clearAllFilesFromDB();
        if (isCompleteProfile) {
          sessionStorage.removeItem("deliveryNeedsRegistration");
          toast.success("Registration successful. Please login with OTP.");
          setTimeout(() => navigate("/food/delivery/login", { replace: true }), 1500);
        } else {
          toast.success("Profile submitted. Waiting for admin approval.");
          setTimeout(() => navigate("/food/delivery", { replace: true }), 1500);
        }
      } else {
        setSubmitState("idle");
      }
    } catch (error) {
      setSubmitState("idle");
      const message = getFriendlyRegistrationError(error);
      toast.error(message);
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        background: COLORS.surface,
        minHeight: "100vh",
        paddingBottom: "112px",
        color: COLORS.onSurface,
        position: "relative",
      }}>
        {/* Header */}
        <header style={{
          position: "sticky", top: 0, zIndex: 40,
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.outlineVariant}`,
          padding: "0 16px", height: "56px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button onClick={goBack} style={{
              background: "none", border: "none", cursor: "pointer", padding: "4px",
              display: "flex", alignItems: "center",
            }}>
              <MaterialIcon name="arrow_back" style={{ color: COLORS.primary }} />
            </button>
            <h1 style={{ fontSize: "20px", lineHeight: "26px", fontWeight: 700, color: COLORS.primary, margin: 0 }}>
              Register as Driver
            </h1>
          </div>
          <div style={{
            width: "32px", height: "32px", borderRadius: "9999px",
            background: COLORS.surfaceContainerHigh,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MaterialIcon name="help_outline" style={{ color: COLORS.outline }} />
          </div>
        </header>

        <main style={{ padding: "24px 16px", maxWidth: "448px", margin: "0 auto" }}>
          {/* Step Progress */}
          <section style={{ marginBottom: "32px" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "18px", lineHeight: "24px", fontWeight: 600, margin: 0 }}>
                3-step registration
              </h2>
              <p style={{ fontSize: "13px", lineHeight: "18px", color: COLORS.onSurfaceVariant, marginTop: "4px", marginBottom: 0 }}>
                Step 2: Vehicle &amp; Documents
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
              {[1, 2, 3].map((step, i) => (
                <div key={step} style={{ display: "flex", alignItems: "center", flexGrow: i < 2 ? 1 : 0 }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "9999px",
                    background: step <= 2 ? COLORS.primary : COLORS.surfaceContainer,
                    color: step <= 2 ? "#fff" : COLORS.secondary,
                    border: step > 2 ? `1px solid ${COLORS.outlineVariant}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: "16px", flexShrink: 0, zIndex: 1,
                    boxShadow: step === 2 ? `0 0 0 6px rgba(158,243,215,0.3)` : "none",
                  }}>
                    {step}
                  </div>
                  {i < 2 && (
                    <div style={{
                      height: "2px", flexGrow: 1, margin: "0 8px",
                      background: step === 1 ? COLORS.primary : COLORS.outlineVariant,
                    }} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Vehicle Type */}
          <section style={{ marginBottom: "32px" }}>
            <h3 style={{
              fontSize: "12px", lineHeight: "16px", letterSpacing: "0.05em", fontWeight: 600,
              color: COLORS.outline, textTransform: "uppercase", marginBottom: "12px",
            }}>
              Vehicle Type
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {VEHICLES.map((v) => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  selected={selectedVehicle === v.id}
                  onSelect={handleSelectVehicle}
                />
              ))}
            </div>
          </section>

          {/* Documents */}
          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h3 style={{
              fontSize: "12px", lineHeight: "16px", letterSpacing: "0.05em", fontWeight: 600,
              color: COLORS.outline, textTransform: "uppercase", marginBottom: "4px",
            }}>
              Required Documents
            </h3>
            {DOCUMENTS_LIST.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                uploaded={!!uploadedDocs[doc.id]}
                previewSrc={getPreviewSrc(doc.id)}
                onUploadClick={() => setActivePicker(doc)}
                onRemove={() => handleRemove(doc.id)}
              />
            ))}
          </section>
        </main>

        {/* Hidden File Input Elements */}
        {DOCUMENTS_LIST.map((doc) => (
          <input
            key={doc.id}
            ref={(node) => {
              fileInputRefs.current[doc.id] = node;
            }}
            type="file"
            style={{ display: "none" }}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) {
                handleFileSelect(doc.id, selectedFile);
              }
            }}
          />
        ))}

        {/* Upload Overlay Sheet */}
        {activePicker && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "end", justifyContent: "center", zIndex: 100
          }}>
            <div style={{
              background: "#fff", width: "100%", maxWidth: "448px",
              borderRadius: "24px 24px 0 0", padding: "24px", boxSizing: "border-box"
            }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700 }}>
                Upload {activePicker.label}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <button
                  onClick={() => {
                    handleTakeCameraPhoto(activePicker.id);
                    setActivePicker(null);
                  }}
                  style={{
                    height: "48px", borderRadius: "12px", background: COLORS.onSurface,
                    color: "#fff", border: "none", fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    fontFamily: "inherit"
                  }}
                >
                  <MaterialIcon name="photo_camera" style={{ color: "#fff" }} />
                  <span>Camera</span>
                </button>
                <button
                  onClick={() => {
                    handlePickFromGallery(activePicker.id);
                    setActivePicker(null);
                  }}
                  style={{
                    height: "48px", borderRadius: "12px", background: COLORS.primary,
                    color: "#fff", border: "none", fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    fontFamily: "inherit"
                  }}
                >
                  <MaterialIcon name="image" style={{ color: "#fff" }} />
                  <span>Gallery</span>
                </button>
              </div>
              <button
                onClick={() => setActivePicker(null)}
                style={{
                  width: "100%", height: "48px", borderRadius: "12px", background: COLORS.surfaceContainer,
                  color: COLORS.onSurface, border: "none", fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sticky CTA */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, width: "100%",
          padding: "16px",
          background: "rgba(245,245,240,0.9)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${COLORS.outlineVariant}`,
          zIndex: 35,
          boxSizing: "border-box",
        }}>
          <button
            onClick={handleSubmit}
            disabled={submitState !== "idle"}
            style={{
              width: "100%", height: "52px",
              background: submitState === "done" ? COLORS.outline : COLORS.primary,
              color: "#fff",
              fontWeight: 700, fontSize: "16px",
              borderRadius: "12px", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              cursor: submitState === "idle" ? "pointer" : "not-allowed",
              opacity: submitState === "loading" ? 0.8 : 1,
              fontFamily: "inherit",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "all 0.2s",
            }}
          >
            {submitState === "idle" && (
              <><span>Submit for Review</span><MaterialIcon name="send" style={{ color: "#fff" }} /></>
            )}
            {submitState === "loading" && (
              <><MaterialIcon name="progress_activity" style={{ color: "#fff", animation: "spin 1s linear infinite" }} /><span>Processing...</span></>
            )}
            {submitState === "done" && (
              <><span>Submitted for Review</span><MaterialIcon name="check" style={{ color: "#fff" }} /></>
            )}
          </button>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}
