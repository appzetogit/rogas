import { useState, useEffect } from "react";
import { Award, Briefcase, FileText, Globe, BellRing, HelpCircle, LogOut, ChevronRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { deliveryAPI } from "@food/api";

const ProfileView = ({
  stats,
  onViewShifts,
  onLogout
}) => {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await deliveryAPI.getProfile();
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };
    fetchProfile();
  }, []);

  const name = profile?.name || "Jan Wisniewski";
  const city = profile?.location?.city || "Warsaw, Poland";
  const vehicleName = profile?.vehicle?.brand || "E-bike";
  const vehicleType = profile?.vehicle?.type || "bike";
  const rating = profile?.metrics?.rating || 4.90;
  const ratingCount = profile?.metrics?.ratingCount || 1240;
  const profileImage = profile?.profileImage?.url || profile?.documents?.photo || "https://lh3.googleusercontent.com/aida-public/AB6AXuDEjl512Xg8gioOiKCrNkzoFsPJOBpZ_FWH1I9NLqdANkO68ioiYVbGJP0lCuEzhuJUEOH6hHaQOjc6fe9vJQ7lK3v7iR_GQv857dAWMuxS2tvAnVJK-naM5eaoWYwQcIZevQpLdYOxa0llm9zUIwUztXYbbVNoYaAJTfyk4qT0ZqGXdcFJ7JJP2-YMHekgSppjlvckmf_yIcx_Ut04Rqcuhy38-DLDk3fY2C_8AdsnIKo1wOFHFhmGrrgs8RSyMn1OhVRSMMoac1Mm";
  const bankAcc = profile?.documents?.bankDetails?.accountNumber?.slice(-4) || "4291";

  return <div className="space-y-4 pb-12 animate-fadeIn text-gray-800">
      {
    /* Driver Identity Card */
  }
      <section className="bg-white rounded-2xl p-4 border border-[#e0e3e0] shadow-xs">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-[#bec9c3]">
              <img
    alt={`${name} Profile`}
    className="w-full h-full object-cover"
    src={profileImage}
    referrerPolicy="no-referrer"
  />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-[#00604c] text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full border-2 border-white shadow-sm">
              Active
            </div>
          </div>
          
          <div className="flex-1 space-y-1">
            <h2 className="text-lg font-extrabold text-gray-900">{name}</h2>
            <p className="text-xs text-[#5d5f5b] flex items-center gap-1">
              <span className="capitalize">{vehicleType === "bike" ? "🚲" : vehicleType === "car" ? "🚗" : "🛵"} {vehicleName}</span>
              <span className="text-gray-300">•</span>
              <span>{city}</span>
            </p>
            
            <div className="flex items-center gap-1.5 pt-1">
              <Award className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs font-bold text-gray-900">{Number(rating).toFixed(2)} Rating</span>
              <span className="text-[10px] text-gray-400 font-medium">({ratingCount} deliveries)</span>
            </div>
          </div>
        </div>
      </section>

      {
    /* Shifts Quick Entry Card */
  }
      <div
    onClick={onViewShifts}
    className="bg-[#00604c]/5 border border-[#00604c]/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#00604c]/10 active:scale-[0.99] transition-all shadow-xs"
  >
        <div className="flex items-center gap-3">
          <span className="text-xl">📅</span>
          <div>
            <h4 className="font-bold text-sm text-[#00604c]">Quick Shifts Tracker</h4>
            <p className="text-[11px] text-[#3e4945] font-medium">Log hours, adjust timetables or cancel sprints.</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#00604c]" />
      </div>

      {
    /* Vehicle & Docs Status */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">VEHICLE &amp; DOCUMENTS</h3>
        <div className="bg-white rounded-2xl border border-[#bec9c3] overflow-hidden divide-y divide-[#bec9c3]/30 shadow-xs">
          
          {
    /* License */
  }
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">Driving License</p>
                <p className="text-[11px] text-[#5d5f5b]">Expires in 12 days</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-orange-100 text-orange-800 px-2.5 py-0.5 rounded-lg">
                Expiring
              </span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {
    /* National ID */
  }
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-[#00604c]">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">National ID</p>
                <p className="text-[11px] text-[#5d5f5b]">Verified on 12.01.2024</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-[#9ef3d7] text-[#005140] px-2.5 py-0.5 rounded-lg-sm">
                Valid
              </span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {
    /* Registration */
  }
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">Vehicle Registration</p>
                <p className="text-[11px] text-red-600 font-semibold">Expired 2 days ago</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                Action Required
              </span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

        </div>
      </section>

      {
    /* Fleet Partner Card */
  }
      <section className="bg-[#00604c] text-white rounded-2xl p-4 relative overflow-hidden border border-[#016b55] shadow-md-sm">
        <div className="absolute -top-4 -right-4 p-4 opacity-10">
          <Briefcase className="w-24 h-24 stroke-[1.5]" />
        </div>
        <div className="relative z-10 space-y-3">
          <div>
            <h3 className="text-[10px] uppercase font-bold tracking-widest opacity-80">FLEET PARTNER</h3>
            <p className="font-extrabold text-[#9ef3d7] text-base leading-snug">Velo Courier Services Sp. z o.o.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <a
    href="tel:+48500200300"
    className="bg-white text-[#00604c] text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform"
  >
              📞 Contact Manager
            </a>
            <button className="bg-[#1f7a63] text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 hover:bg-[#005140] active:scale-95 transition-transform">
              📄 Agreement
            </button>
          </div>
        </div>
      </section>

      {
    /* Earnings Settings Settings */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">BANKING DETAILS</h3>
        <div className="bg-white rounded-2xl border border-[#bec9c3] overflow-hidden divide-y divide-[#bec9c3]/30 shadow-xs">
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <span className="text-sm">🗓️</span>
              <div>
                <p className="text-xs font-bold text-gray-900">Payout Schedule</p>
                <p className="text-[11px] text-[#5d5f5b]">Weekly (Tuesday morning)</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <span className="text-sm">🏦</span>
              <div>
                <p className="text-xs font-bold text-gray-900">Bank Account</p>
                <p className="text-[11px] text-[#5d5f5b]">Bank •••• {bankAcc}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>
        </div>
      </section>

      {
    /* General Settings */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">SETTINGS</h3>
        <div className="bg-white rounded-2xl border border-[#bec9c3] overflow-hidden divide-y divide-[#bec9c3]/30 shadow-xs">
          
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <Globe className="w-4.5 h-4.5 text-[#5d5f5b]" />
              <p className="text-xs font-bold text-gray-900">Language</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#5d5f5b]">English (UK)</span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <BellRing className="w-4.5 h-4.5 text-[#5d5f5b]" />
              <p className="text-xs font-bold text-gray-900">Notifications</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-4.5 h-4.5 text-[#5d5f5b]" />
              <p className="text-xs font-bold text-gray-900">Help &amp; Support</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

        </div>
      </section>

      {
    /* Log out submit */
  }
      <button
    onClick={onLogout}
    className="w-full py-3.5 text-[#ba1a1a] font-bold border border-red-200 bg-red-50/50 rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm shadow-xs"
  >
        <LogOut className="w-4 h-4" />
        Log Out
      </button>
    </div>;
};
export {
  ProfileView
};
