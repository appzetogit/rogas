import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { adminAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import { ShieldCheck, UserCog, Star, Heart, ArrowRight, Loader2, Mail, Lock, Eye, EyeOff, ShieldQuestion } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { toast } from "sonner"

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const [logoUrl, setLogoUrl] = useState("")

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/v1/app-config/admin_app")
        const data = await response.json()
        if (data.success && data.data?.logoUrl) {
          setLogoUrl(data.data.logoUrl)
        }
      } catch (error) {
        console.error("Failed to fetch app config", error)
      }
    }
    fetchConfig()
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error("Please fill in all fields")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    try {
      const response = await adminAPI.login(email.trim(), password)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const adminUser = data.user || data.admin
      const refreshToken = data.refreshToken ?? null

      if (!accessToken || !adminUser || !refreshToken) {
        throw new Error("Invalid response from server")
      }

      setAuthData("admin", accessToken, adminUser, refreshToken)
      toast.success("Welcome, Administrator")
      navigate("/admin/food", { replace: true })
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Login failed. Check your credentials."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col relative overflow-hidden font-['Outfit',sans-serif]">
      {/* Dynamic Animated Background */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#1F7A63]/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#1F7A63]/5 rounded-full blur-[120px] pointer-events-none opacity-60" />
      <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] bg-[#1F7A63]/10 rounded-full blur-[100px] pointer-events-none opacity-40 animate-pulse" style={{ animationDuration: '12s' }} />

      {/* Top Bar */}
      <div className="absolute top-6 right-6 z-20">
        <Link to="/user/auth/support">
          <Button variant="ghost" className="text-[#2B2B2B]/60 hover:text-[#1F7A63] font-semibold flex items-center gap-2 rounded-full px-5 py-2 bg-white/40 backdrop-blur-md border border-white/40 transition-all hover:shadow-lg hover:-translate-y-0.5">
            <ShieldQuestion className="w-5 h-5" />
            Support
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[460px]"
        >
          {/* Glassmorphism Card */}
          <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] p-8 sm:p-12 shadow-[0_20px_60px_-15px_rgba(31,122,99,0.1)] border border-white/60 relative overflow-hidden">
            
            {/* Glossy Top Highlight */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            
            {/* Logo integrated into the card */}
            <div className="flex flex-col items-center mb-10">
              <motion.div
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
                className="relative w-24 h-24 md:w-28 md:h-28 rounded-[1.25rem] shadow-sm overflow-hidden border border-gray-100 mb-6 bg-white flex items-center justify-center group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#1F7A63]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Admin Logo"
                    className="w-full h-full object-contain p-3 relative z-10 transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <ShieldCheck className="w-10 h-10 text-[#1F7A63]/40" />
                )}
              </motion.div>
              
              <h2 className="text-3xl font-bold text-[#2B2B2B] tracking-tight mb-2 text-center">
                Welcome Back
              </h2>
              <p className="text-sm text-[#2B2B2B]/60 font-medium text-center">
                Enter your credentials to access the DailyMealBox command center
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-[#2B2B2B]/80 uppercase tracking-widest ml-1">Email Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                      <Mail className="w-5 h-5 text-[#1F7A63]/60 group-focus-within:text-[#1F7A63] transition-colors" />
                    </div>
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3.5 bg-white/60 text-[#2B2B2B] border border-gray-200 focus:border-[#1F7A63] focus:ring-4 focus:ring-[#1F7A63]/10 rounded-xl outline-none transition-all placeholder:text-[#2B2B2B]/30 font-medium shadow-sm backdrop-blur-sm"
                      placeholder="admin@dailymealbox.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[11px] font-bold text-[#2B2B2B]/80 uppercase tracking-widest">Password</label>
                    <Link to="/admin/forgot-password" size="sm" className="text-[11px] font-bold text-[#1F7A63] hover:text-[#165A49] transition-colors">Forgot Password?</Link>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                      <Lock className="w-5 h-5 text-[#1F7A63]/60 group-focus-within:text-[#1F7A63] transition-colors" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-11 pr-12 py-3.5 bg-white/60 text-[#2B2B2B] border border-gray-200 focus:border-[#1F7A63] focus:ring-4 focus:ring-[#1F7A63]/10 rounded-xl outline-none transition-all placeholder:text-[#2B2B2B]/30 font-medium shadow-sm backdrop-blur-sm"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[#2B2B2B]/40 hover:text-[#2B2B2B]/80 hover:bg-gray-100 transition-all"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-2 bg-[#1F7A63] hover:bg-[#165A49] disabled:opacity-70 text-white rounded-xl font-bold text-[15px] shadow-lg shadow-[#1F7A63]/30 transition-all flex items-center justify-center gap-2 group overflow-hidden relative border border-[#1F7A63]/20"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Secure Login</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
                {/* Button Glow Sweep */}
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
              </motion.button>
            </form>
          </div>

          <div className="mt-8 flex justify-center items-center gap-8 opacity-40 hover:opacity-70 transition-opacity">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2B2B2B]/60" />
              <span className="text-[10px] font-bold text-[#2B2B2B]/60 uppercase tracking-widest">End-to-End Encrypted</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}


