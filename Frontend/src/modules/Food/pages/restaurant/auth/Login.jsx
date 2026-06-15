import { useEffect, useRef, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, Utensils, Star, Heart, ArrowRight, Loader2, Store, ShieldQuestion, Globe } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import logoNew from "@/assets/logo.png"
import { SUPPORTED_COUNTRIES } from "@/config/countries"
import CountrySelector from "@/shared/components/CountrySelector"
import { useTranslation } from "@/contexts/LanguageContext"

export default function RestaurantLogin() {
  const navigate = useNavigate()
  const { t, changeLanguage } = useTranslation()
  const phoneInputRef = useRef(null)
  const matchCountryFromPhone = (phone) => {
    if (!phone) return SUPPORTED_COUNTRIES[0];
    const cleanDigits = phone.replace(/\D/g, "");
    const sorted = [...SUPPORTED_COUNTRIES].sort(
      (a, b) => b.code.replace(/\D/g, "").length - a.code.replace(/\D/g, "").length
    );
    for (const c of sorted) {
      const codeDigits = c.code.replace(/\D/g, "");
      if (cleanDigits.startsWith(codeDigits)) {
        return c;
      }
    }
    if (cleanDigits.length === 10) return SUPPORTED_COUNTRIES.find(c => c.code === "+91") || SUPPORTED_COUNTRIES[0];
    return SUPPORTED_COUNTRIES[0];
  };

  const [selectedCountry, setSelectedCountry] = useState(() => {
    const draft = sessionStorage.getItem("restaurantLoginPhone") || "";
    return matchCountryFromPhone(draft);
  });

  const [phone, setPhone] = useState(() => {
    const draft = sessionStorage.getItem("restaurantLoginPhone") || "";
    const country = matchCountryFromPhone(draft);
    const prefix = country.code;
    if (draft.startsWith(prefix)) {
      return draft.slice(prefix.length).replace(/\D/g, "").slice(0, country.phoneLength);
    }
    return draft.replace(/\D/g, "").slice(0, country.phoneLength);
  });

  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  const normalizedPhone = () => {
    const cleanDigits = phone.replace(/\D/g, "");
    return cleanDigits.length === selectedCountry.phoneLength ? `${selectedCountry.code}${cleanDigits}` : "";
  }

  const handlePhoneChange = (val, country) => {
    const cleanDigits = val.replace(/\D/g, "").slice(0, country.phoneLength);
    setPhone(cleanDigits);
    sessionStorage.setItem("restaurantLoginPhone", country.code + cleanDigits);
  };

  const handleCountryChange = (country) => {
    setSelectedCountry(country);
    const slicedDigits = phone.slice(0, country.phoneLength);
    setPhone(slicedDigits);
    sessionStorage.setItem("restaurantLoginPhone", country.code + slicedDigits);
  };

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault()
    const fullPhone = normalizedPhone()
    if (!fullPhone) {
      toast.error(`Please enter a valid ${selectedCountry.phoneLength}-digit mobile number`)
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    try {
      await restaurantAPI.sendOTP(fullPhone, "login")
      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))
      sessionStorage.setItem("restaurantLoginPhone", fullPhone)
      toast.success("Verification code sent!")
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      const msg = apiErr?.response?.data?.message || apiErr?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const primaryColor = "#7e3866"

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col relative overflow-hidden font-['Poppins']">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent pointer-events-none" />
      <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <select
          value={localStorage.getItem("app_lang") || "en"}
          onChange={(e) => changeLanguage(e.target.value)}
          className="bg-transparent border border-gray-300 dark:border-gray-700 text-gray-500 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none cursor-pointer"
        >
          <option value="en">English</option>
          <option value="pl">Polski</option>
          <option value="hi">हिन्दी</option>
        </select>

        <Link to="/restaurant/auth/support">
          <Button variant="ghost" className="text-gray-500 hover:text-primary font-semibold flex items-center gap-2">
            <ShieldQuestion className="w-5 h-5" />
            {t("help", "Support")}
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative w-32 h-32 md:w-36 md:h-36 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden border-4 border-white mx-auto mb-4 bg-white"
              style={{ borderRadius: '50%', WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
            >
              <img
                src={logoNew}
                alt="Rogas Logo"
                className="w-full h-full object-cover scale-[1.15]"
                style={{ borderRadius: '50%' }}
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-gray-400 dark:text-gray-500 font-bold text-xs uppercase tracking-[0.3em]"
            >
              RESTAURANT PARTNER
            </motion.p>
          </div>

          {/* Login Card */}
          <div className="bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-2xl rounded-[3rem] p-8 sm:p-12 shadow-[0_40px_80px_-20px_rgba(126,56,102,0.2)] dark:shadow-none border border-white/20 dark:border-gray-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2 font-['Outfit'] tracking-tight">
                Partner Login
              </h2>
              <div className="h-1 w-10 bg-primary rounded-full mb-3 hidden sm:block" />
              <p className="text-base text-gray-500 dark:text-gray-400 font-medium">
                {t("login_phone_subtitle", "Enter your registered mobile number to manage your restaurant")}
              </p>
            </div>

            <form onSubmit={handleSendOTP} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em] ml-1">{t("phone_label", "Mobile Number")}</label>
                <div className="flex gap-2">
                  <CountrySelector
                    selectedCountry={selectedCountry}
                    onSelect={handleCountryChange}
                    className="shrink-0"
                    buttonClassName="flex items-center justify-between gap-1 px-4 h-14 border-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 rounded-2xl text-gray-900 dark:text-white font-bold text-sm min-w-[100px]"
                  />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    required
                    autoFocus
                    value={phone}
                    onChange={(e) => {
                      handlePhoneChange(e.target.value, selectedCountry);
                    }}
                    maxLength={selectedCountry.phoneLength}
                    className="block flex-1 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white border-2 border-transparent focus:border-primary/50 rounded-2xl outline-none transition-all placeholder:text-gray-300 font-bold text-lg shadow-sm"
                    placeholder={selectedCountry.placeholder}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || phone.length !== selectedCountry.phoneLength}
                className="w-full py-4.5 bg-primary hover:bg-[#6a2f56] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl font-bold text-lg shadow-xl shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group overflow-hidden relative"
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <span>{t("send_otp", "Get Started")}</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
                <motion.div
                  className="absolute inset-0 bg-white/20 translate-x-[-100%]"
                  whileHover={{ translateX: "100%" }}
                  transition={{ duration: 0.6 }}
                />
              </button>
            </form>
          </div>

          <div className="mt-8 text-center">
            <p className="text-[11px] text-gray-400 font-medium leading-relaxed max-w-[320px] mx-auto">
              By continuing, you agree to Rogas's <br />
              <Link to="/food/restaurant/profile/terms" className="text-gray-900 dark:text-white font-bold hover:text-primary transition-colors">Terms of Service</Link> & <Link to="/food/restaurant/profile/privacy" className="text-gray-900 dark:text-white font-bold hover:text-primary transition-colors">Privacy Policy</Link>
            </p>
          </div>

          <div className="mt-12 flex justify-center items-center gap-6 opacity-30 grayscale hover:opacity-60 transition-opacity">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Business Verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Partner Success</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
