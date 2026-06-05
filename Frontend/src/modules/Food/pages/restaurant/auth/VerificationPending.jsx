import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, Clock3, ShieldCheck } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { restaurantAPI } from "@food/api"
import {
  clearRestaurantPendingPhone,
  getModuleToken,
  getRestaurantPendingPhone,
} from "@food/utils/auth"

export default function VerificationPending() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const isRejected = location.state?.isRejected || false
  const rejectionReason = location.state?.rejectionReason || ""
  const [checkingStatus, setCheckingStatus] = useState(true)

  const pendingPhone = useMemo(() => {
    return (
      location.state?.phone ||
      getRestaurantPendingPhone() ||
      ""
    )
  }, [location.state?.phone])

  useEffect(() => {
    let cancelled = false

    const checkApprovalStatus = async () => {
      // If we already know it's rejected from the login/otp flow state, don't poll yet
      if (isRejected && !checkingStatus) return

      const token = getModuleToken("restaurant")
      // Since rejected/pending users might not have tokens yet (returned early in auth service),
      // we might rely on the state passed from OTP.
      if (!token) {
        if (!cancelled) setCheckingStatus(false)
        return
      }

      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          response?.data?.data?.user ||
          response?.data?.user

        if (cancelled) return

        if (String(restaurant?.status || "").toLowerCase() === "approved") {
          clearRestaurantPendingPhone()
          navigate("/food/restaurant", { replace: true })
          return
        }

        if (String(restaurant?.status || "").toLowerCase() === "rejected") {
          // If it was rejected while polling, update local state if needed
          // but for now we rely on the initial state from OTP
        }
      } catch (_) {
        // Keep the pending screen visible if the status check fails.
      } finally {
        if (!cancelled) setCheckingStatus(false)
      }
    }

    checkApprovalStatus()

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkApprovalStatus()
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus)
    document.addEventListener("visibilitychange", handleVisibilityOrFocus)

    return () => {
      cancelled = true
      window.removeEventListener("focus", handleVisibilityOrFocus)
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
    }
  }, [navigate, isRejected])

  return (
    <div className="min-h-screen bg-[#f8fafc] px-6 py-10 font-['Poppins']">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col justify-center">
        <div className="rounded-[3rem] border border-slate-200 bg-white p-10 shadow-[0_40px_100px_rgba(15,23,42,0.1)]">
          <div className="mb-8 flex items-center justify-center">
            {isRejected ? (
              <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-red-50 text-red-500 shadow-lg shadow-red-100">
                <AlertCircle className="h-10 w-10" />
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-amber-50 text-amber-500 shadow-lg shadow-amber-100">
                <Clock3 className="h-10 w-10 animate-pulse" />
              </div>
            )}
          </div>

          <div className="mb-8 text-center">
            <p className={`mb-3 text-xs font-black uppercase tracking-[0.3em] ${isRejected ? 'text-red-600' : 'text-amber-600'}`}>
              {isRejected ? 'Registration Rejected' : 'Verification Pending'}
            </p>
            <h1 className="text-3xl font-black text-slate-950 font-['Outfit'] tracking-tight">
              {isRejected ? 'Action Required' : 'Under Review'}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-500 font-medium">
              {isRejected 
                ? "Your restaurant registration was not approved. Please review the reason below and try again."
                : `${companyName} received your onboarding details successfully. Our team will verify your restaurant soon.`
              }
            </p>
            {!isRejected && checkingStatus ? (
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Checking approval status...
              </p>
            ) : null}
          </div>

          {isRejected && rejectionReason && (
            <div className="mb-8 rounded-[2rem] bg-red-50/50 border border-red-100 p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-2">Rejection Reason</p>
              <p className="text-sm font-bold text-red-900 leading-relaxed italic">
                "{rejectionReason}"
              </p>
            </div>
          )}

          {!isRejected && (
            <div className="mb-8 rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-sm text-slate-600">
                  <p className="font-bold text-slate-900">What's next?</p>
                  <p className="mt-1 opacity-80">We'll notify you via SMS/Email once verified.</p>
                  {pendingPhone ? (
                    <p className="mt-3 text-xs font-medium text-slate-400">
                      ID: <span className="text-slate-600">{pendingPhone}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {isRejected ? (
              <Button
                className="h-14 w-full rounded-2xl bg-red-600 text-white font-bold text-base shadow-xl shadow-red-200 hover:bg-red-700 transition-all active:scale-[0.98]"
                onClick={() => {
                  navigate("/food/restaurant/onboarding", { replace: true })
                }}
              >
                Retry Registration
              </Button>
            ) : (
              <Button
                className="h-14 w-full rounded-2xl bg-primary text-white font-bold text-base shadow-xl shadow-primary/20 hover:bg-[#6a2f56] transition-all active:scale-[0.98]"
                onClick={() => {
                  clearRestaurantPendingPhone()
                  navigate("/food/restaurant/login", { replace: true })
                }}
              >
                Back to Login
              </Button>
            )}
            
            {isRejected && (
              <button
                className="w-full py-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => {
                  clearRestaurantPendingPhone()
                  navigate("/food/restaurant/login", { replace: true })
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
