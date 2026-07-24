import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { Home, ClipboardList, Calendar, ShoppingBag, User } from "lucide-react";

import { WelcomeScreen, GoalsScreen, DietPrefsScreen, LocationScreen, ManualLocationScreen } from "./components/OnboardingScreens";
import { AuthPhoneScreen, OtpVerificationScreen, UserDetailsScreen } from "./components/AuthScreens";
import { HomeScreen } from "./components/HomeScreen";
import { PlansScreen } from "./components/PlansScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { OrdersScreen, clearOrdersCache } from "./components/OrdersScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { WalletScreen } from "./components/WalletScreen";
import { CheckoutScreen } from "./components/CheckoutScreen";
import { PantryCheckoutScreen } from "./components/PantryCheckoutScreen";
import { SubscriptionDetailsScreen } from "./components/SubscriptionDetailsScreen";
import { InvoiceSettingsScreen } from "./components/InvoiceSettingsScreen";
import { TrackerScreen } from "./components/TrackerScreen";
import { SupportScreen } from "./components/SupportScreen";
import { DietAndAllergensScreen } from "./components/DietAndAllergensScreen";
import { PantryCartProvider } from "./components/PantryCartContext";
import { authAPI, userAPI, dmbCustomerAPI } from "@food/api";

export default function CustomerAppMain() {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── Auth State ─────────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState("login");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [signupName, setSignupName] = useState("");
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("user_user");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const isLoggedIn = Boolean(currentUser && localStorage.getItem("user_accessToken"));

  // ─── Socket.IO State ─────────────────────────────────────────────────────────
  const [socket, setSocket] = useState(null);

  // Connect socket when user logs in; join subscription rooms
  useEffect(() => {
    if (!isLoggedIn) return;
    const backendUrl = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";
    const sock = io(backendUrl, {
      auth: { token: localStorage.getItem("user_accessToken") },
      transports: ["websocket", "polling"]
    });

    sock.on("connect", () => {
      // Join subscription rooms so we receive order status updates
      import("@food/api").then(({ dmbCustomerAPI }) => {
        dmbCustomerAPI.getMySubscriptions("active").then(res => {
          const subs = res.data?.subscriptions || [];
          subs.forEach(sub => {
            sock.emit("join_room", `sub_${sub._id}`);
          });
        }).catch(() => { });
      });
    });

    setSocket(sock);
    return () => { sock.disconnect(); };
  }, [isLoggedIn]);

  // Auth init on mount — rehydrate from token
  useEffect(() => {
    const token = localStorage.getItem("user_accessToken");
    if (token && !currentUser) {
      authAPI.getCurrentUser()
        .then((res) => {
          const u = res?.data?.data?.user || res?.data?.user || res?.data;
          if (u) {
            setCurrentUser(u);
            localStorage.setItem("user_user", JSON.stringify(u));
          }
        })
        .catch(() => {
          localStorage.removeItem("user_accessToken");
          localStorage.removeItem("user_refreshToken");
          localStorage.removeItem("user_user");
          setCurrentUser(null);
        });
    }
  }, []);

  // Prevent access to authenticated routes until the user logs in again
  useEffect(() => {
    const publicPaths = [
      "/user/welcome",
      "/user/auth/login",
      "/user/auth/signup",
      "/user/otp"
    ];
    const token = localStorage.getItem("user_accessToken");
    if (!token && !publicPaths.includes(location.pathname)) {
      navigate("/user/welcome", { replace: true });
    }
  }, [location.pathname, navigate, currentUser]);

  const handleLoginSuccess = ({ accessToken, refreshToken, user }) => {
    localStorage.setItem("user_accessToken", accessToken);
    if (refreshToken) localStorage.setItem("user_refreshToken", refreshToken);
    localStorage.setItem("user_user", JSON.stringify(user));
    setCurrentUser(user);
    fetchDietaryPreferences();
  };

  const fetchDietaryPreferences = async () => {
    try {
      const res = await userAPI.getDietaryPreferences();
      if (res.data?.success) {
        setDietaryPrefs(res.data.data.preferences);
      }
    } catch (err) {
      console.error("Failed to fetch dietary preferences:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDietaryPreferences();
      setInvoicePrefs({
        receiptType: currentUser.invoiceType === 'b2b_vat' ? 'vat' : 'simple',
        companyName: currentUser.companyName || "",
        nipVat: currentUser.companyNip || "",
        companyAddress: currentUser.companyAddress || "",
        billingEmail: currentUser.billingEmail || "",
      });
    }
  }, [currentUser]);

  const handleLogout = () => {
    const rt = localStorage.getItem("user_refreshToken");
    authAPI.logout(rt).catch(() => { });

    // Clear tokens and credentials
    localStorage.removeItem("user_accessToken");
    localStorage.removeItem("user_refreshToken");
    localStorage.removeItem("user_user");

    // Clear session storage
    try {
      sessionStorage.clear();
    } catch (err) {
      console.error("Failed to clear sessionStorage:", err);
    }

    // Clear cookies
    try {
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (err) {
      console.error("Failed to clear cookies:", err);
    }

    // Reset React state
    setCurrentUser(null);
    setTrackedOrder(null);
    setSelectedPlanDetails(null);
    setSignupName("");
    setPhoneNumber("");

    // Clear in-memory caches
    clearOrdersCache();

    navigate("/user/welcome");
    showToast("👋 Logged out successfully");
  };

  const handleUpdateProfile = async (body) => {
    const res = await userAPI.updateProfile(body);
    const updatedUser = res.data?.data?.user || res.data?.user || res.data;
    if (updatedUser) {
      setCurrentUser(updatedUser);
      localStorage.setItem("user_user", JSON.stringify(updatedUser));
    }
    return updatedUser;
  };

  const handleUpdateProfileState = (user) => {
    setCurrentUser(user);
    localStorage.setItem("user_user", JSON.stringify(user));
  };

  // ─── App State ───────────────────────────────────────────────────────────────
  const [points, setPoints] = useState(120);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState(null);

  // Holds the full checkout data from PlansScreen (vendorId, mealPlanId, slot, days, address, pricing)
  const [selectedPlanDetails, setSelectedPlanDetails] = useState(null);

  const [tomorrowMeal, setTomorrowMeal] = useState({
    day: "Mon",
    dayNum: 12,
    name: "Ghar ka Khana",
    status: "Scheduled",
  });

  const [dietaryPrefs, setDietaryPrefs] = useState({
    dietType: "Vegetarian",
    allergies: [],
    weeklyBudget: 1500,
  });

  const [invoicePrefs, setInvoicePrefs] = useState({
    receiptType: "simple",
    companyName: "",
    nipVat: "",
    companyAddress: "",
    billingEmail: "",
  });

  const showToast = (message) => {
    toast.success(message, {
      style: { background: "#00604c", color: "#fff", border: "none" },
      position: "top-center",
    });
  };

  // ─── Routing Handlers ────────────────────────────────────────────────────────
  const handleOnboardingNext = (stepPath) => navigate("/user/" + stepPath);

  const handleDietPrefsSaveFromOnboarding = async (prefs) => {
    try {
      const res = await userAPI.updateDietaryPreferences(prefs);
      if (res.data?.success) {
        setDietaryPrefs(res.data.data.preferences);
      } else {
        setDietaryPrefs(prefs);
      }
    } catch (err) {
      console.error("Failed to save dietary preferences:", err);
      setDietaryPrefs(prefs); // fallback to state
    }
    setOnboardingCompleted(true);
    navigate("/user/home");
    showToast("✅ Preferences saved successfully!");
  };

  const handleDietAndAllergensSave = async (prefs) => {
    try {
      const res = await userAPI.updateDietaryPreferences(prefs);
      if (res.data?.success) {
        setDietaryPrefs(res.data.data.preferences);
      } else {
        setDietaryPrefs(prefs);
      }
    } catch (err) {
      console.error("Failed to save dietary preferences:", err);
      setDietaryPrefs(prefs); // fallback to state
    }
    navigate("/user/profile");
    showToast("✅ Diet & Allergens saved successfully!");
  };

  const handleLocationComplete = () => {
    navigate("/user/goals");
    showToast("📍 Location verified!");
  };

  // Called from PlansScreen when user selects plan + slot + address
  const handlePlanSelectionFlow = (checkoutData) => {
    setSelectedPlanDetails(checkoutData);
    navigate("/user/checkout");
    showToast(`🛒 Opening checkout for ${checkoutData.vendorName || "vendor"}...`);
  };

  const handleInvoiceSettingsSave = async (settings) => {
    try {
      const payload = {
        invoiceType: settings.receiptType === 'vat' ? 'b2b_vat' : 'receipt',
        companyName: settings.companyName,
        companyNip: settings.nipVat,
        companyAddress: settings.companyAddress,
        billingEmail: settings.billingEmail,
      };
      
      const res = await userAPI.updateProfile(payload);
      if (res.data?.success) {
        setInvoicePrefs(settings);
        const u = res.data.data?.user || res.data.user || res.data;
        if (u) {
          setCurrentUser(u);
          localStorage.setItem("user_user", JSON.stringify(u));
        }
        navigate("/user/profile");
        showToast("🧾 Invoice settings updated.");
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || "Failed to save invoice settings";
      toast.error(errMsg, { position: "top-center" });
    }
  };

  const handleConfirmSubscription = () => {
    setPoints((p) => p + 50);
    setTomorrowMeal((prev) => ({
      ...prev,
      name: selectedPlanDetails?.mealPlanName || prev.name,
      status: "Confirmed",
    }));
    navigate("/user/home");
    showToast("🎉 Subscription confirmed! Your first meal box is on its way.");
  };

  // ─── Bottom Nav Visibility ───────────────────────────────────────────────────
  const currentPath = location.pathname;
  const showNav = ["/user/home", "/user/plans", "/user/calendar", "/user/orders", "/user/profile"].includes(currentPath);

  return (
    <PantryCartProvider>
      <div className="relative max-w-[420px] mx-auto min-h-screen bg-slate-50 shadow-2xl border-x border-[#bec9c3]/30 overflow-x-hidden flex flex-col font-sans transition-all duration-300">
        {/* Screen Routes */}
        <div className="flex-1 w-full relative">
          <Routes>
            <Route path="welcome" element={
            <WelcomeScreen
              onSignup={() => navigate("/user/auth/signup")}
              onLogin={() => navigate("/user/auth/login")}
            />
          } />

          {/* ── Auth: Login ── */}
          <Route path="auth/login" element={
            <AuthPhoneScreen
              isLogin={true}
              onToggleMode={() => navigate("/user/auth/signup")}
              onSendOtp={async (phone) => {
                try {
                  const fullPhone = phone.startsWith("+") ? phone : "+91" + phone;
                  await authAPI.sendOTP(fullPhone);
                  setAuthMode("login");
                  setPhoneNumber(fullPhone);
                  navigate("/user/otp");
                  showToast("📱 OTP sent to " + fullPhone);
                } catch (err) {
                  showToast((err?.response?.data?.message || err.message || "Failed to send OTP"));
                }
              }}
              onBack={() => navigate("/user/welcome")}
            />
          } />

          {/* ── Auth: Signup ── */}
          <Route path="auth/signup" element={
            <AuthPhoneScreen
              isLogin={false}
              onToggleMode={() => navigate("/user/auth/login")}
              onSendOtp={async (phone) => {
                try {
                  const fullPhone = phone.startsWith("+") ? phone : "+91" + phone;
                  // Pre-validate phone existence
                  const checkRes = await authAPI.checkPhoneRegistered(fullPhone, "USER");
                  if (checkRes.data?.exists || checkRes.exists) {
                    showToast("This phone number is already registered. Please log in using your existing account.");
                    navigate("/user/auth/login");
                    return;
                  }
                  await authAPI.sendOTP(fullPhone);
                  setAuthMode("signup");
                  setPhoneNumber(fullPhone);
                  setSignupName("");
                  navigate("/user/otp");
                  showToast("📱 OTP sent to " + fullPhone);
                } catch (err) {
                  showToast((err?.response?.data?.message || err.message || "Failed to send OTP"));
                }
              }}
              onBack={() => navigate("/user/welcome")}
            />
          } />

          {/* ── OTP Verify ── */}
          <Route path="otp" element={
            <OtpVerificationScreen
              phone={phoneNumber}
              onVerify={async (code) => {
                try {
                  const nameToPass = signupName || "";
                  const res = await authAPI.verifyOTP(
                    phoneNumber,
                    code,
                    undefined,
                    nameToPass,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    null,
                    "web"
                  );
                  const data = res?.data?.data || res?.data;
                  const { accessToken, refreshToken, user, isNewUser } = data;
                  handleLoginSuccess({ accessToken, refreshToken, user });

                  if (authMode === "signup" || isNewUser) {
                    navigate("/user/about-you");
                    showToast(`👋 Welcome! Tell us about yourself.`);
                  } else {
                    navigate("/user/home");
                    showToast(`✅ Welcome back, ${user?.name || ""}!`);
                  }
                } catch (err) {
                  showToast((err?.response?.data?.message || err.message || "OTP verification failed"));
                }
              }}
              onResend={async () => {
                try {
                  await authAPI.sendOTP(phoneNumber);
                  showToast("OTP resent!");
                } catch (err) {
                  showToast(" Failed to resend OTP");
                }
              }}
              onBack={() => navigate(authMode === "login" ? "/user/auth/login" : "/user/auth/signup")}
            />
          } />

          {/* ── About You (new user name) ── */}
          <Route path="about-you" element={
            <UserDetailsScreen
              onContinue={async (details) => {
                try {
                  const fullName = `${details.firstName} ${details.lastName}`.trim();
                  await userAPI.updateProfile({ name: fullName, email: details.email });

                  // Also update our currentUser state in frontend so it reflects in UI
                  setCurrentUser((prev) => {
                    const nextUser = { ...prev, name: fullName, email: details.email };
                    localStorage.setItem("user_user", JSON.stringify(nextUser));
                    return nextUser;
                  });

                  navigate("/user/location");
                  showToast(` Welcome, ${details.firstName}!`);
                } catch (err) {
                  showToast((err?.response?.data?.message || err.message || "Failed to update profile details"));
                }
              }}
              onBack={() => navigate("/user/otp")}
            />
          } />

          <Route path="goals" element={
            <GoalsScreen
              onBack={() => navigate("/user/location")}
              onNext={() => handleOnboardingNext("diet-prefs")}
            />
          } />

          <Route path="diet-prefs" element={
            <DietPrefsScreen
              onBack={() => navigate("/user/goals")}
              initialPrefs={dietaryPrefs}
              onNext={handleDietPrefsSaveFromOnboarding}
            />
          } />

          <Route path="location" element={
            <LocationScreen
              onBack={() => navigate("/user/auth/login")}
              onAllowLocation={handleLocationComplete}
              onChooseManually={() => navigate("/user/manual-location")}
            />
          } />

          <Route path="manual-location" element={
            <ManualLocationScreen
              onBack={() => navigate("/user/location")}
              onConfirm={(address) => {
                navigate("/user/goals");
                showToast(`📍 Location set to ${address}`);
              }}
            />
          } />

          {/* ── Protected Main Screens ── */}
          <Route path="home" element={
            <HomeScreen
              onGoToPlans={() => navigate("/user/plans")}
              onGoToCalendar={() => navigate("/user/calendar")}
              onGoToOrders={() => navigate("/user/orders")}
              onGoToProfile={() => navigate("/user/profile")}
              onShowNotificationToast={showToast}
              tomorrowMeal={tomorrowMeal}
              setTomorrowMeal={setTomorrowMeal}
              points={points}
              currentUser={currentUser}
              onLogout={handleLogout}
              socket={socket}
            />
          } />

          <Route path="plans" element={
            <PlansScreen
              onGoBack={() => navigate("/user/home")}
              onSelectPlan={handlePlanSelectionFlow}
              onGoToProfile={() => navigate("/user/profile")}
              dietaryPrefs={dietaryPrefs}
            />
          } />

          <Route path="calendar" element={
            <CalendarScreen
              onGoBack={() => navigate("/user/home")}
              onGoToProfile={() => navigate("/user/profile")}
              onShowToast={showToast}
              onGoToPlans={() => navigate("/user/plans")}
              socket={socket}
            />
          } />

          <Route path="orders" element={
            <OrdersScreen
              onGoBack={() => navigate("/user/home")}
              onTrackLive={(order) => {
                setTrackedOrder(order);
                navigate("/user/tracker");
              }}
              onRaiseComplaint={(order) => {
                navigate(`/user/support?orderId=${order._id || order.orderId}&type=order`);
              }}
              onGoToProfile={() => navigate("/user/profile")}
              onShowNotificationToast={showToast}
              tomorrowMeal={tomorrowMeal}
              socket={socket}
            />
          } />

          <Route path="profile" element={
            <ProfileScreen
              onGoBack={() => navigate("/user/home")}
              onGoToDietAndAllergens={() => navigate("/user/diet-allergens")}
              onGoToInvoiceSettings={() => navigate("/user/invoice-settings", { state: { from: 'profile' } })}
              onGoToCheckout={() => navigate("/user/checkout")}
              onGoToSubscription={() => navigate("/user/subscription")}
              onGoToWallet={() => navigate("/user/wallet")}
              onGoToSupport={() => navigate("/user/support")}
              onShowNotificationToast={showToast}
              dietaryPrefs={dietaryPrefs}
              invoicePrefs={invoicePrefs}
              points={points}
              currentUser={currentUser}
              onLogout={handleLogout}
              onUpdateProfile={handleUpdateProfile}
              onUpdateProfileState={handleUpdateProfileState}
            />
          } />

          <Route path="diet-allergens" element={
            <DietAndAllergensScreen
              onBack={() => navigate("/user/profile")}
              initialPrefs={dietaryPrefs}
              onSave={handleDietAndAllergensSave}
            />
          } />

          <Route path="wallet" element={
            <WalletScreen
              onBack={() => navigate("/user/profile")}
              currentUser={currentUser}
            />
          } />

          <Route path="subscription" element={
            <SubscriptionDetailsScreen
              onGoBack={() => navigate("/user/profile")}
              onGoToPlans={() => navigate("/user/plans")}
              onShowNotificationToast={showToast}
            />
          } />

          <Route path="checkout" element={
            <CheckoutScreen
              onGoBack={() => navigate("/user/plans")}
              onGoToInvoiceSettings={() => navigate("/user/invoice-settings", { state: { from: 'checkout' } })}
              onShowNotificationToast={showToast}
              invoicePrefs={invoicePrefs}
              setInvoicePrefs={setInvoicePrefs}
              onConfirmSubscription={handleConfirmSubscription}
              selectedPlanDetails={selectedPlanDetails}
            />
          } />
          
          <Route path="pantry-checkout" element={
            <PantryCheckoutScreen />
          } />

          <Route path="invoice-settings" element={
            <InvoiceSettingsScreen
              onGoBack={() => navigate(location.state?.from === 'checkout' ? "/user/checkout" : "/user/profile")}
              initialSettings={invoicePrefs}
              onSave={handleInvoiceSettingsSave}
              currentUser={currentUser}
              selectedPlanDetails={selectedPlanDetails}
            />
          } />

          <Route path="tracker" element={
            <TrackerScreen
              tomorrowMeal={tomorrowMeal}
              trackedOrder={trackedOrder}
              onGoBack={() => navigate("/user/orders")}
              onShowNotificationToast={showToast}
              socket={socket}
            />
          } />

          <Route path="support" element={
            <SupportScreen
              onGoBack={() => navigate(-1)}
              onShowNotificationToast={showToast}
            />
          } />

          <Route path="*" element={<Navigate to={isLoggedIn ? "home" : "welcome"} replace />} />
        </Routes>
      </div>

      {/* Bottom Navigation */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 max-w-[420px] w-full z-40 bg-white border-t border-[#bec9c3]/30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] px-4 pt-2.5 pb-5 flex justify-around items-center h-20">
          {[
            { path: "/user/home", icon: Home, label: "Home" },
            { path: "/user/plans", icon: ClipboardList, label: "Plans" },
            { path: "/user/calendar", icon: Calendar, label: "Calendar" },
            { path: "/user/orders", icon: ShoppingBag, label: "Orders" },
            { path: "/user/profile", icon: User, label: "Profile" },
          ].map(({ path, icon: IconComp, label }) => {
            const active = currentPath === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center justify-center transition-all duration-200 ${active ? "text-primary scale-105" : "text-on-surface-variant hover:text-primary"}`}
              >
                <IconComp className={`w-[22px] h-[22px] ${active ? 'fill-current' : ''}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider mt-1">{label}</span>
                {active && <div className="w-1 h-1 bg-primary rounded-full mt-0.5 animate-pulse" />}
              </button>
            );
          })}
        </nav>
      )}
    </div>
    </PantryCartProvider>
  );
}

