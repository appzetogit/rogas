import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { STANDARD_PLANS } from "./types";

import { WelcomeScreen, GoalsScreen, DietPrefsScreen, LocationScreen, ManualLocationScreen } from "./components/OnboardingScreens";
import { AuthPhoneScreen, OtpVerificationScreen, UserDetailsScreen } from "./components/AuthScreens";
import { HomeScreen } from "./components/HomeScreen";
import { PlansScreen } from "./components/PlansScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { OrdersScreen } from "./components/OrdersScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { CheckoutScreen } from "./components/CheckoutScreen";
import { InvoiceSettingsScreen } from "./components/InvoiceSettingsScreen";
import { TrackerScreen } from "./components/TrackerScreen";

export default function CustomerAppMain() {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Core Global States
    const [onboardingCompleted, setOnboardingCompleted] = useState(false);
    const [points, setPoints] = useState(120);

    // Auth State
    const [authMode, setAuthMode] = useState("login");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [selectedPlanDetails, setSelectedPlanDetails] = useState(STANDARD_PLANS[0]);
    
    const [tomorrowMeal, setTomorrowMeal] = useState({
        day: "Mon",
        dayNum: 12,
        name: "Rosol z kluskami",
        status: "Scheduled"
    });
    
    const [dietaryPrefs, setDietaryPrefs] = useState({
        dietType: "Keto",
        allergies: ["Gluten", "Nuts"],
        weeklyBudget: 350
    });
    
    const [invoicePrefs, setInvoicePrefs] = useState({
        receiptType: "simple",
        companyName: "Acme Corp Sp. z o.o.",
        nipVat: "123-456-78-90",
        companyAddress: "ul. Wiejska 10, Warsaw",
        billingEmail: "accounting@acmecorp.pl"
    });
    
    const showToast = (message) => {
        toast.success(message, {
            style: { background: '#00604c', color: '#fff', border: 'none' },
            position: 'top-center',
        });
    };

    // Routing transitions
    const handleOnboardingNext = (stepPath) => {
        navigate("/user/" + stepPath);
    };

    const handleDietPrefsSaveFromOnboarding = (prefs) => {
        setDietaryPrefs(prefs);
        setOnboardingCompleted(true);
        navigate("/user/home");
        toast.success("Onboarding complete! Welcome to DailyMealBox Warsaw.", {
            style: { background: '#00604c', color: '#fff', border: 'none' },
            position: 'top-center',
        });
    };

    const handleLocationComplete = () => {
        navigate("/user/goals");
        toast.success("Location verified!", {
            icon: <span className="material-symbols-outlined text-white">location_on</span>,
            style: { background: '#00604c', color: '#fff', border: 'none' },
            position: 'top-center',
        });
    };

    const handlePlanSelectionFlow = (plan) => {
        setSelectedPlanDetails(plan);
        navigate("/user/checkout");
        showToast(`🛒 Opened Checkout details for ${plan.name}`);
    };

    const handleInvoiceSettingsSave = (settings) => {
        setInvoicePrefs(settings);
        navigate("/user/profile");
        showToast("🧾 Invoice settings updated.");
    };

    const handleConfirmSubscription = () => {
        setPoints((p) => p + 50);
        navigate("/user/home");
        showToast("🎉 Subscription confirmed! Your first meal box will arrive tomorrow at 12:00.");
    };

    // Determine if we should show the bottom nav bar
    // It should only show on specific main pages
    const currentPath = location.pathname;
    const showNav = [
        "/user/home",
        "/user/plans",
        "/user/calendar",
        "/user/orders",
        "/user/profile"
    ].includes(currentPath);

    return (
      <div className="relative max-w-[420px] mx-auto min-h-screen bg-slate-50 shadow-2xl border-x border-[#bec9c3]/30 overflow-x-hidden flex flex-col font-sans transition-all duration-300">
      


      {/* Screen Render Switch using React Router */}
      <div className="flex-1 w-full relative">
        <Routes>
          <Route path="welcome" element={
            <WelcomeScreen 
              onSignup={() => navigate("/user/auth/signup")}
              onLogin={() => navigate("/user/auth/login")}
            />
          } />

          <Route path="auth/login" element={
            <AuthPhoneScreen 
              isLogin={true}
              onToggleMode={() => navigate("/user/auth/signup")}
              onSendOtp={(phone) => {
                setAuthMode("login");
                setPhoneNumber(phone);
                navigate("/user/otp");
              }}
              onBack={() => navigate("/user/welcome")}
            />
          } />

          <Route path="auth/signup" element={
            <AuthPhoneScreen 
              isLogin={false}
              onToggleMode={() => navigate("/user/auth/login")}
              onSendOtp={(phone) => {
                setAuthMode("signup");
                setPhoneNumber(phone);
                navigate("/user/otp");
              }}
              onBack={() => navigate("/user/welcome")}
            />
          } />

          <Route path="otp" element={
            <OtpVerificationScreen 
              phone={phoneNumber}
              onVerify={(code) => {
                if (authMode === "login") {
                  navigate("/user/location");
                  toast.success("Successfully logged in!");
                } else {
                  navigate("/user/about-you");
                  toast.success("Phone verified. Tell us about yourself.");
                }
              }}
              onResend={() => toast.success("OTP resent successfully!")}
              onBack={() => navigate(authMode === "login" ? "/user/auth/login" : "/user/auth/signup")}
            />
          } />

          <Route path="about-you" element={
            <UserDetailsScreen 
              onContinue={(details) => {
                navigate("/user/location");
                toast.success(`Welcome, ${details.firstName}!`);
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
              onBack={() => navigate("/user/auth")} 
              onAllowLocation={handleLocationComplete} 
              onChooseManually={() => {
                navigate("/user/manual-location");
              }}
            />
          } />

          <Route path="manual-location" element={
            <ManualLocationScreen 
              onBack={() => navigate("/user/location")} 
              onConfirm={(address) => {
                navigate("/user/goals");
                toast.success(`Location set to ${address}`, {
                  icon: <span className="material-symbols-outlined text-white">location_on</span>,
                  style: { background: '#00604c', color: '#fff', border: 'none' },
                  position: 'top-center',
                });
              }}
            />
          } />

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
            />
          } />

          <Route path="plans" element={
            <PlansScreen 
              onGoBack={() => navigate("/user/home")} 
              onSelectPlan={handlePlanSelectionFlow} 
              onGoToProfile={() => navigate("/user/profile")}
            />
          } />

          <Route path="calendar" element={
            <CalendarScreen 
              onGoBack={() => navigate("/user/home")} 
              onGoToProfile={() => navigate("/user/profile")} 
              onShowToast={showToast}
            />
          } />

          <Route path="orders" element={
            <OrdersScreen 
              onGoBack={() => navigate("/user/home")} 
              onTrackLive={() => navigate("/user/tracker")} 
              onGoToProfile={() => navigate("/user/profile")} 
              onShowNotificationToast={showToast} 
              tomorrowMeal={tomorrowMeal}
            />
          } />

          <Route path="profile" element={
            <ProfileScreen 
              onGoBack={() => navigate("/user/home")} 
              onGoToOnboarding={() => navigate("/user/diet-prefs")} 
              onGoToInvoiceSettings={() => navigate("/user/invoice-settings")} 
              onGoToCheckout={() => navigate("/user/checkout")} 
              onShowNotificationToast={showToast} 
              dietaryPrefs={dietaryPrefs} 
              invoicePrefs={invoicePrefs} 
              points={points}
            />
          } />

          <Route path="checkout" element={
            <CheckoutScreen 
              onGoBack={() => navigate("/user/plans")} 
              onGoToInvoiceSettings={() => navigate("/user/invoice-settings")} 
              onShowNotificationToast={showToast} 
              invoicePrefs={invoicePrefs} 
              setInvoicePrefs={setInvoicePrefs} 
              onConfirmSubscription={handleConfirmSubscription}
            />
          } />

          <Route path="invoice-settings" element={
            <InvoiceSettingsScreen 
              onGoBack={() => {
                navigate(onboardingCompleted ? "/user/profile" : "/user/checkout");
              }} 
              initialSettings={invoicePrefs} 
              onSave={handleInvoiceSettingsSave}
            />
          } />

          <Route path="tracker" element={
            <TrackerScreen 
              tomorrowMeal={tomorrowMeal} 
              onGoBack={() => navigate("/user/orders")} 
              onShowNotificationToast={showToast}
            />
          } />

          {/* Default fallback */}
          <Route path="*" element={<Navigate to="/user/welcome" replace />} />
        </Routes>
      </div>



      {/* Bottom Global Navigation bar matches specs layouts */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 max-w-[420px] w-full z-40 bg-white border-t border-[#bec9c3]/30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] px-4 pt-2.5 pb-5 flex justify-around items-center h-20 animate-in fade-in duration-300">
          
          {/* Home Tab */}
          <button onClick={() => navigate("/user/home")} className={`flex flex-col items-center justify-center transition-all duration-200 ${currentPath === "/user/home"
                ? "text-primary scale-105"
                : "text-on-surface-variant hover:text-primary hover:scale-[1.02]"}`}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: currentPath === "/user/home" ? "'FILL' 1" : "'FILL' 0" }}>
              home
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Home</span>
            {currentPath === "/user/home" && <div className="w-1 h-1 bg-primary rounded-full mt-0.5 animate-pulse"></div>}
          </button>

          {/* Plans Tab */}
          <button onClick={() => navigate("/user/plans")} className={`flex flex-col items-center justify-center transition-all duration-200 ${currentPath === "/user/plans"
                ? "text-primary scale-105"
                : "text-on-surface-variant hover:text-primary hover:scale-[1.02]"}`}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: currentPath === "/user/plans" ? "'FILL' 1" : "'FILL' 0" }}>
              assignment
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Plans</span>
            {currentPath === "/user/plans" && <div className="w-1 h-1 bg-primary rounded-full mt-0.5 animate-pulse"></div>}
          </button>

          {/* Calendar Tab */}
          <button onClick={() => navigate("/user/calendar")} className={`flex flex-col items-center justify-center transition-all duration-200 ${currentPath === "/user/calendar"
                ? "text-primary scale-105"
                : "text-on-surface-variant hover:text-primary hover:scale-[1.02]"}`}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: currentPath === "/user/calendar" ? "'FILL' 1" : "'FILL' 0" }}>
              calendar_today
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Calendar</span>
            {currentPath === "/user/calendar" && <div className="w-1 h-1 bg-primary rounded-full mt-0.5 animate-pulse"></div>}
          </button>

          {/* Orders Tab */}
          <button onClick={() => navigate("/user/orders")} className={`flex flex-col items-center justify-center transition-all duration-200 ${currentPath === "/user/orders"
                ? "text-primary scale-105"
                : "text-on-surface-variant hover:text-primary hover:scale-[1.02]"}`}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: currentPath === "/user/orders" ? "'FILL' 1" : "'FILL' 0" }}>
              shopping_bag
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Orders</span>
            {currentPath === "/user/orders" && <div className="w-1 h-1 bg-primary rounded-full mt-0.5 animate-pulse"></div>}
          </button>

          {/* Profile Tab */}
          <button onClick={() => navigate("/user/profile")} className={`flex flex-col items-center justify-center transition-all duration-200 ${currentPath === "/user/profile"
                ? "text-primary scale-105"
                : "text-on-surface-variant hover:text-primary hover:scale-[1.02]"}`}>
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: currentPath === "/user/profile" ? "'FILL' 1" : "'FILL' 0" }}>
              person
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Profile</span>
            {currentPath === "/user/profile" && <div className="w-1 h-1 bg-primary rounded-full mt-0.5"/>}
          </button>
        </nav>
      )}
    </div>
  );
}
