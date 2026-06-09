import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { deliveryAPI } from "@food/api";
import { setAuthData as storeAuthData } from "@food/utils/auth";

const COLORS = {
  primary: "#1F7A63",
  primaryContainer: "#1F7A63",
  primaryFixedDim: "#82d6bb",
  secondaryFixedDim: "#c6c7c2",
  onPrimary: "#ffffff",
  surface: "#F5F5F0",
  surfaceContainer: "#ebefeb",
  surfaceContainerLowest: "#ffffff",
  onSurface: "#2B2B2B",
  onSurfaceVariant: "#5d5f5b",
  outline: "#6e7a74",
  outlineVariant: "#bec9c3",
  secondary: "#5d5f5b",
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

export default function DeliveryOTP() {
  const navigate = useNavigate();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [authData, setAuthData] = useState(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [verifiedOtp, setVerifiedOtp] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [isRejected, setIsRejected] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deviceToken, setDeviceToken] = useState(null);
  const [activePlatform, setActivePlatform] = useState("web");
  const [focusedIndex, setFocusedIndex] = useState(null);
  const inputRefs = useRef([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("deliveryAuthData");
    if (stored) {
      const data = JSON.parse(stored);
      setAuthData(data);
    } else {
      const token = localStorage.getItem("delivery_accessToken");
      const authenticated = localStorage.getItem("delivery_authenticated") === "true";
      if (token && authenticated) {
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp > now) {
              navigate("/food/delivery", { replace: true });
              return;
            }
          }
        } catch (e) {
          // Ignore token parsing issues
        }
      }
      navigate("/food/delivery/login", { replace: true });
      return;
    }

    setResendTimer(60);
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  useEffect(() => {
    if (inputRefs.current[0] && otp.every((digit) => digit === "") && !showNameInput && !pendingMessage) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [otp, showNameInput, pendingMessage]);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (!showNameInput && newOtp.every((digit) => digit !== "") && newOtp.length === 6) {
      handleVerify(newOtp.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp];
        newOtp[index] = "";
        setOtp(newOtp);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newOtp = [...otp];
        newOtp[index - 1] = "";
        setOtp(newOtp);
      }
    }
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 6).split("");
        const newOtp = [...otp];
        digits.forEach((digit, i) => {
          if (i < 6) {
            newOtp[i] = digit;
          }
        });
        setOtp(newOtp);
        if (digits.length === 6) {
          handleVerify(newOtp.join(""));
        } else {
          inputRefs.current[digits.length]?.focus();
        }
      });
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("");
    const newOtp = [...otp];
    digits.forEach((digit, i) => {
      if (i < 6) {
        newOtp[i] = digit;
      }
    });
    setOtp(newOtp);
    if (!showNameInput && digits.length === 6) {
      handleVerify(newOtp.join(""));
      return;
    }
    inputRefs.current[digits.length]?.focus();
  };

  const handleVerify = async (otpValue = null) => {
    if (showNameInput) return;

    const code = otpValue || otp.join("");
    if (code.length !== 6) return;

    setIsLoading(true);
    setError("");

    try {
      const phone = authData?.phone;
      const purpose = authData?.purpose || "login";
      const providedName = authData?.isSignUp ? authData?.name || null : null;
      if (!phone) {
        setError("Phone number not found. Please try again.");
        setIsLoading(false);
        return;
      }

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
      } catch (e) {
        // Suppress FCM token errors
      }

      setDeviceToken(fcmToken);
      setActivePlatform(platform);

      const response = await deliveryAPI.verifyOTP(phone, code, purpose, providedName, fcmToken, platform);
      const data = response?.data?.data || response?.data || {};

      if (data.pendingApproval === true) {
        sessionStorage.removeItem("deliveryAuthData");
        setIsLoading(false);
        setError("");
        setPendingMessage(data.message || "Your account is pending admin verification. You will be notified once approved.");
        setIsRejected(data.isRejected || false);
        setRejectionReason(data.rejectionReason || "");
        return;
      }

      const needsRegistration = data.needsRegistration === true;

      if (needsRegistration) {
        sessionStorage.removeItem("deliveryAuthData");
        sessionStorage.setItem("deliveryNeedsRegistration", "true");
        const digits = String(phone || "").replace(/\D/g, "");
        const details = {
          name: "",
          phone: digits.slice(-10),
          countryCode: "+91",
        };
        sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details));
        setIsLoading(false);
        navigate("/food/delivery/signup/details", { replace: true });
        return;
      }

      const accessToken = data.accessToken;
      const refreshToken = data.refreshToken || null;
      const user = data.user;

      if (!accessToken || !user) {
        throw new Error("Invalid response from server");
      }

      sessionStorage.removeItem("deliveryAuthData");

      try {
        storeAuthData("delivery", accessToken, user, refreshToken);
      } catch (storageError) {
        setError("Failed to save authentication. Please try again or clear your browser storage.");
        setIsLoading(false);
        return;
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"));
      setSuccess(true);
      setIsLoading(false);

      let retryCount = 0;
      const maxRetries = 10;
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken");
        const storedAuth = localStorage.getItem("delivery_authenticated");

        if (storedToken && storedAuth === "true") {
          navigate("/food/delivery", { replace: true });
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(verifyAndNavigate, 100);
        } else {
          setError("Failed to save authentication. Please try again.");
          setIsLoading(false);
        }
      };
      setTimeout(verifyAndNavigate, 200);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to verify OTP. Please try again.";
      setError(message);
      setIsLoading(false);
    }
  };

  const handleSubmitName = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }

    if (!verifiedOtp) {
      setError("OTP verification step missing. Please request a new OTP.");
      return;
    }

    setIsLoading(true);
    setError("");
    setNameError("");

    try {
      const phone = authData?.phone;
      const purpose = authData?.purpose || "login";
      if (!phone) {
        setError("Phone number not found. Please try again.");
        return;
      }

      const response = await deliveryAPI.verifyOTP(phone, verifiedOtp, purpose, trimmedName, deviceToken, activePlatform);
      const data = response?.data?.data || response?.data || {};

      const accessToken = data.accessToken;
      const refreshToken = data.refreshToken || null;
      const user = data.user;

      if (!accessToken || !user) {
        throw new Error("Invalid response from server");
      }

      sessionStorage.removeItem("deliveryAuthData");

      try {
        storeAuthData("delivery", accessToken, user, refreshToken);
      } catch (storageError) {
        setError("Failed to save authentication. Please try again or clear your browser storage.");
        setIsLoading(false);
        return;
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"));
      setSuccess(true);
      setIsLoading(false);

      let retryCount = 0;
      const maxRetries = 10;
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken");
        const storedAuth = localStorage.getItem("delivery_authenticated");

        if (storedToken && storedAuth === "true") {
          navigate("/food/delivery", { replace: true });
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(verifyAndNavigate, 100);
        } else {
          setError("Failed to save authentication. Please try again.");
          setIsLoading(false);
        }
      };
      setTimeout(verifyAndNavigate, 200);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to complete registration. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;

    setIsLoading(true);
    setError("");

    try {
      const phone = authData?.phone;
      const purpose = authData?.purpose || "login";
      if (!phone) {
        setError("Phone number not found. Please go back and try again.");
        return;
      }

      await deliveryAPI.sendOTP(phone, purpose);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }

    setResendTimer(60);
    setOtp(["", "", "", "", "", ""]);
    setShowNameInput(false);
    setName("");
    setNameError("");
    setVerifiedOtp("");
  };

  const getPhoneNumber = () => {
    if (!authData) return "";
    const phone = authData.phone || "";
    const cleaned = phone.replace(/\s/g, "");
    if (cleaned.startsWith("+91") && cleaned.length > 3) {
      return cleaned.slice(0, 3) + "-" + cleaned.slice(3);
    }
    return phone;
  };

  if (!authData) {
    return null;
  }

  const isComplete = otp.every((d) => d !== "");
  const timerLabel = resendTimer > 0 ? `(${resendTimer}s)` : "";

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
          color: COLORS.onSurface,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <header
          style={{
            width: "100%",
            background: COLORS.surface,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            height: "56px",
            borderBottom: `1px solid ${COLORS.outlineVariant}`,
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={() => navigate("/food/delivery/login")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              transition: "transform 0.15s",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.9)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
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
            Verify Phone
          </h1>
        </header>

        {/* Main Content */}
        <main
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 16px 0",
            zIndex: 10,
          }}
        >
          {/* Card Wrapper for visually grouping elements nicely */}
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
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            {/* Show pending approval page/state if message exists */}
            {pendingMessage ? (
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: 700, marginBottom: "16px" }}>
                  {isRejected ? "Application Status" : "Pending Verification"}
                </h2>
                <div
                  style={{
                    backgroundColor: isRejected ? "#FCE8E6" : "#FEF3D6",
                    border: `1px solid ${isRejected ? "#F5C2C1" : "#FADF9E"}`,
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "24px",
                    color: isRejected ? "#C5221F" : "#B06000",
                    fontSize: "14px",
                    lineHeight: "20px",
                    fontWeight: 500,
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, textTransform: "uppercase", fontSize: "12px", marginBottom: "8px" }}>
                    {isRejected ? "Application Rejected" : "Pending Verification"}
                  </p>
                  <p style={{ margin: 0 }}>{pendingMessage}</p>
                  {isRejected && rejectionReason && (
                    <p style={{ marginTop: "12px", fontStyle: "italic", fontSize: "13px" }}>
                      Reason: "{rejectionReason}"
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {isRejected && (
                    <button
                      onClick={() => {
                        const phone = authData?.phone;
                        const digits = String(phone || "").replace(/\D/g, "");
                        sessionStorage.setItem("deliveryNeedsRegistration", "true");
                        const details = {
                          name: "",
                          phone: digits.slice(-10),
                          countryCode: "+91",
                        };
                        sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details));
                        navigate("/food/delivery/signup/details", { replace: true });
                      }}
                      style={{
                        width: "100%",
                        height: "48px",
                        background: "#C5221F",
                        color: "#ffffff",
                        borderRadius: "12px",
                        border: "none",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Re-apply Now
                    </button>
                  )}
                  <button
                    onClick={() => navigate("/food/delivery/login", { replace: true })}
                    style={{
                      width: "100%",
                      height: "48px",
                      background: COLORS.surfaceContainer,
                      color: COLORS.onSurface,
                      borderRadius: "12px",
                      border: "none",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Back to login
                  </button>
                </div>
              </div>
            ) : showNameInput ? (
              /* Name Form Step */
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div style={{ textAlign: "center" }}>
                  <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: 700, marginBottom: "8px" }}>
                    Almost there!
                  </h2>
                  <p style={{ fontSize: "14px", lineHeight: "20px", color: COLORS.onSurfaceVariant, margin: 0 }}>
                    Please enter your full name to complete registration.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="fullname"
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
                    Full Name
                  </label>
                  <input
                    id="fullname"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError("");
                    }}
                    placeholder="Enter your name"
                    style={{
                      width: "100%",
                      height: "48px",
                      padding: "0 16px",
                      boxSizing: "border-box",
                      background: "#ffffff",
                      border: `1px solid ${nameError ? "#C5221F" : COLORS.outlineVariant}`,
                      borderRadius: "12px",
                      fontSize: "16px",
                      color: COLORS.onSurface,
                      fontFamily: "inherit",
                    }}
                  />
                  {nameError && (
                    <p style={{ color: "#C5221F", fontSize: "12px", marginTop: "4px", margin: 0 }}>{nameError}</p>
                  )}
                </div>

                {error && (
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      background: "#FCE8E6",
                      color: "#C5221F",
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmitName}
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    height: "52px",
                    background: COLORS.primaryContainer,
                    color: "#ffffff",
                    fontSize: "16px",
                    lineHeight: "24px",
                    fontWeight: 500,
                    borderRadius: "12px",
                    border: "none",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                    transition: "all 0.2s",
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  {isLoading ? "Continuing..." : "Continue"}
                </button>
              </div>
            ) : (
              /* OTP Form Step (Standard) */
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Title */}
                <div style={{ textAlign: "center" }}>
                  <h2 style={{ fontSize: "22px", lineHeight: "28px", fontWeight: 700, marginBottom: "8px", margin: 0 }}>
                    Security Verification
                  </h2>
                  <p style={{ fontSize: "14px", lineHeight: "20px", fontWeight: 400, color: COLORS.onSurfaceVariant, margin: 0 }}>
                    We've sent a 6-digit code to{" "}
                    <strong style={{ color: COLORS.onSurface }}>{getPhoneNumber()}</strong>
                  </p>
                </div>

                {/* OTP Inputs */}
                <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (inputRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      onFocus={() => setFocusedIndex(i)}
                      onBlur={() => setFocusedIndex(null)}
                      disabled={isLoading}
                      style={{
                        width: "44px",
                        height: "52px",
                        textAlign: "center",
                        fontSize: "20px",
                        lineHeight: "28px",
                        fontWeight: 700,
                        background: "#ffffff",
                        border: `1px solid ${focusedIndex === i ? COLORS.primary : COLORS.outlineVariant}`,
                        borderRadius: "10px",
                        outline: focusedIndex === i ? `1px solid ${COLORS.primary}` : "none",
                        transition: "border 0.15s, outline 0.15s",
                        fontFamily: "inherit",
                        color: COLORS.onSurface,
                        caretColor: COLORS.primary,
                      }}
                    />
                  ))}
                </div>

                {error && (
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      background: "#FCE8E6",
                      color: "#C5221F",
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Resend */}
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "13px", lineHeight: "18px", color: COLORS.onSurfaceVariant, marginBottom: "4px", margin: 0 }}>
                    Didn't receive the code?
                  </p>
                  <button
                    onClick={handleResend}
                    disabled={resendTimer > 0 || isLoading}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: (resendTimer > 0 || isLoading) ? "not-allowed" : "pointer",
                      fontSize: "12px",
                      lineHeight: "16px",
                      letterSpacing: "0.05em",
                      fontWeight: 600,
                      color: (resendTimer > 0 || isLoading) ? COLORS.secondary : COLORS.primary,
                      opacity: (resendTimer > 0 || isLoading) ? 0.5 : 1,
                      fontFamily: "inherit",
                      transition: "opacity 0.2s, color 0.2s",
                      padding: "8px 16px",
                      borderRadius: "9999px",
                    }}
                  >
                    Resend Code {timerLabel}
                  </button>
                </div>

                {/* CTA */}
                <div>
                  <button
                    onClick={() => handleVerify()}
                    disabled={!isComplete || isLoading}
                    style={{
                      width: "100%",
                      height: "52px",
                      background: isComplete ? COLORS.primaryContainer : COLORS.surfaceContainer,
                      color: isComplete ? "#ffffff" : COLORS.onSurfaceVariant,
                      fontSize: "16px",
                      lineHeight: "24px",
                      fontWeight: 500,
                      borderRadius: "12px",
                      border: "none",
                      cursor: (isComplete && !isLoading) ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: isComplete ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                      transition: "all 0.2s",
                      fontFamily: "inherit",
                    }}
                    onMouseDown={(e) => isComplete && !isLoading && (e.currentTarget.style.transform = "scale(0.98)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <span>{isLoading ? "Verifying..." : "Verify & Continue"}</span>
                    <MaterialIcon
                      name="arrow_forward"
                      filled
                      style={{ color: isComplete ? "#ffffff" : COLORS.onSurfaceVariant }}
                    />
                  </button>
                  <p
                    style={{
                      marginTop: "16px",
                      textAlign: "center",
                      color: COLORS.onSurfaceVariant,
                      fontSize: "10px",
                      lineHeight: "14px",
                      letterSpacing: "0.02em",
                      fontWeight: 700,
                      padding: "0 24px",
                      margin: "16px 0 0",
                    }}
                  >
                    By continuing, you agree to our security protocols and delivery partner terms.
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Decorative background blobs */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "50%",
            zIndex: -1,
            overflow: "hidden",
            pointerEvents: "none",
            opacity: 0.2,
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: "-80px",
              left: "-80px",
              width: "384px",
              height: "384px",
              borderRadius: "9999px",
              background: COLORS.primaryFixedDim,
              filter: "blur(48px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: "-80px",
              width: "256px",
              height: "256px",
              borderRadius: "9999px",
              background: COLORS.secondaryFixedDim,
              filter: "blur(32px)",
            }}
          />
        </div>
      </div>
    </>
  );
}
