import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@food/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, ArrowUpRight, ShoppingBag, CreditCard, Truck, Receipt, DollarSign, Store, UserCheck, Package, UserCircle, Clock, CheckCircle, Plus, XCircle, ShieldCheck, AlertTriangle } from "lucide-react"
import { adminAPI } from "@food/api"
const debugLog = () => {}
const debugError = () => {}

const INR_SYMBOL = "\u20B9"

function formatCurrency(amount, options = {}) {
  const numericAmount = Number(amount || 0)
  const formattedAmount = numericAmount.toLocaleString("en-IN", options)
  return `${INR_SYMBOL}${formattedAmount}`
}


export default function AdminHome() {
  const navigate = useNavigate()
  const [selectedZone, setSelectedZone] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("overall")
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [zones, setZones] = useState([])
  const [themeUpdated, setThemeUpdated] = useState(0)

  // Listen to dynamic theme loads
  useEffect(() => {
    const handleThemeUpdate = () => {
      setThemeUpdated(prev => prev + 1)
    }
    window.addEventListener("themeLoaded", handleThemeUpdate)
    return () => window.removeEventListener("themeLoaded", handleThemeUpdate)
  }, [])

  // Fetch zone list for filter
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await adminAPI.getZones({ page: 1, limit: 1000 })
        const list = response?.data?.data?.zones || []
        setZones(Array.isArray(list) ? list : [])
      } catch (error) {
        setZones([])
      }
    }
    fetchZones()
  }, [])

  // Fetch dashboard stats from backend when filters change
  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setIsLoading(true)
        const params = {
          period: selectedPeriod,
          ...(selectedZone !== "all" ? { zoneId: selectedZone } : {}),
        }
        const response = await adminAPI.getDashboardStats(params)
        if (response.data?.success && response.data?.data) {
          setDashboardData(response.data.data)
        } else {
          setDashboardData(null)
        }
      } catch (error) {
        setDashboardData(null)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDashboardStats()
  }, [selectedZone, selectedPeriod])

  const getThemeColor = (varName, fallback) => {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback
    } catch (e) {
      return fallback
    }
  }

  const primaryColor = getThemeColor('--ad-primary', '#1F7A63')
  const background = getThemeColor('--ad-background', '#F5F5F0')
  const text = getThemeColor('--ad-text', '#2B2B2B')
  const cardBg = getThemeColor('--ad-card-bg', '#ffffff')
  const cardBorder = getThemeColor('--ad-card-border', '#e2e8f0')
  const textMuted = getThemeColor('--ad-card-text-muted', '#64748b')
  const textPrimary = getThemeColor('--ad-text-primary', '#0f172a')

  return (
    <div 
      className="px-4 pb-10 lg:px-8 pt-6 min-h-screen transition-all duration-300 font-['Outfit',sans-serif]"
      style={{ backgroundColor: background, color: text }}
    >
      {/* Dashboard Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: textMuted }}>Admin Overview</p>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: textPrimary }}>Operations Command</h1>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={selectedZone} onValueChange={setSelectedZone}>
            <SelectTrigger 
              className="min-w-[160px] border shadow-xs text-sm font-semibold rounded-xl"
              style={{ backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }}
            >
              <SelectValue placeholder="All zones" />
            </SelectTrigger>
            <SelectContent 
              className="border shadow-md rounded-xl"
              style={{ backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }}
            >
              <SelectItem value="all">All zones</SelectItem>
              {zones.map((zone) => (
                <SelectItem key={zone._id} value={zone._id}>
                  {zone.zoneName || zone.name || "Unnamed Zone"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger 
              className="min-w-[140px] border shadow-xs text-sm font-semibold rounded-xl"
              style={{ backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }}
            >
              <SelectValue placeholder="Overall" />
            </SelectTrigger>
            <SelectContent 
              className="border shadow-md rounded-xl"
              style={{ backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }}
            >
              <SelectItem value="overall">Overall</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="year">This year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xs bg-black/10"
        >
          <div 
            className="flex items-center gap-3 rounded-full px-5 py-2.5 text-sm border shadow-lg"
            style={{ backgroundColor: cardBg, borderColor: cardBorder, color: textPrimary }}
          >
            <span className="h-3 w-3 rounded-full animate-ping" style={{ backgroundColor: primaryColor }} />
            <span>Updating metrics...</span>
          </div>
        </div>
      )}

      {/* Dashboard Body */}
      <div className="space-y-6">
        
        {/* Top 4 Summary Cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          
          {/* Card 1: Active Subscribers */}
          <div 
            className="p-5 border rounded-2xl shadow-xs transition-all duration-300"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
              <span>Active Subscribers</span>
              <UserCircle className="w-4 h-4" style={{ color: primaryColor }} />
            </div>
            <p className="text-3xl font-extrabold mt-2" style={{ color: textPrimary }}>
              {dashboardData?.activeSubscribers || 0}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-bold text-emerald-600">
                ↑ +12% last month
              </span>
            </div>
          </div>

          {/* Card 2: Active Vendors */}
          <div 
            className="p-5 border rounded-2xl shadow-xs transition-all duration-300"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
              <span>Active Vendors</span>
              <Store className="w-4 h-4" style={{ color: primaryColor }} />
            </div>
            <p className="text-3xl font-extrabold mt-2" style={{ color: textPrimary }}>
              {dashboardData?.restaurants?.total || 0}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-medium" style={{ color: textMuted }}>
                Kitchen Partners: {dashboardData?.activeKitchenPartners || 0}
              </span>
            </div>
          </div>

          {/* Card 3: Active Drivers */}
          <div 
            className="p-5 border rounded-2xl shadow-xs transition-all duration-300"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
              <span>Active Drivers</span>
              <Truck className="w-4 h-4" style={{ color: primaryColor }} />
            </div>
            <p className="text-3xl font-extrabold mt-2" style={{ color: textPrimary }}>
              {dashboardData?.deliveryBoys?.total || 0}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-medium" style={{ color: textMuted }}>
                Online: {dashboardData?.onlineDrivers || 0}
              </span>
            </div>
          </div>

          {/* Card 4: Revenue MTD */}
          <div 
            className="p-5 border rounded-2xl shadow-xs transition-all duration-300"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>
              <span>Revenue MTD</span>
              <DollarSign className="w-4 h-4" style={{ color: primaryColor }} />
            </div>
            <p className="text-3xl font-extrabold mt-2" style={{ color: textPrimary }}>
              {dashboardData?.revenueMtd || 0} <span className="text-base font-semibold">PLN</span>
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-medium" style={{ color: textMuted }}>
                +12% vs last month
              </span>
            </div>
          </div>
          
        </div>

        {/* Two Column Layout (Operations & Chart) */}
        <div className="grid gap-6 md:grid-cols-5">
          
          {/* Today's Operations */}
          <div 
            className="p-6 border rounded-2xl shadow-xs transition-all duration-300 md:col-span-2"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <h3 className="text-xs uppercase tracking-widest font-extrabold mb-6" style={{ color: textMuted }}>
              Today's Operations
            </h3>
            <div className="space-y-4 font-semibold text-sm">
              <div className="flex justify-between items-center py-2.5 border-b" style={{ borderColor: cardBorder }}>
                <span style={{ color: textMuted }}>Orders placed</span>
                <span className="text-base" style={{ color: textPrimary }}>
                  {dashboardData?.todayOperations?.ordersPlaced || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b" style={{ borderColor: cardBorder }}>
                <span style={{ color: textMuted }}>Delivered</span>
                <span className="text-base" style={{ color: textPrimary }}>
                  {dashboardData?.todayOperations?.delivered || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b" style={{ borderColor: cardBorder }}>
                <span style={{ color: textMuted }}>Pending</span>
                <span className="text-base" style={{ color: textPrimary }}>
                  {dashboardData?.todayOperations?.pending || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b" style={{ borderColor: cardBorder }}>
                <span style={{ color: textMuted }}>Failed</span>
                <span className="text-base" style={{ color: textPrimary }}>
                  {dashboardData?.todayOperations?.failed || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b" style={{ borderColor: cardBorder }}>
                <span style={{ color: textMuted }}>Drivers online</span>
                <span className="text-base" style={{ color: textPrimary }}>
                  {dashboardData?.todayOperations?.driversOnline || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2" style={{ borderColor: cardBorder }}>
                <span style={{ color: textMuted }}>Vendors active</span>
                <span className="text-base" style={{ color: textPrimary }}>
                  {dashboardData?.todayOperations?.vendorsActive || 0}
                </span>
              </div>
            </div>
          </div>

          {/* 7-Day Revenue (PLN) */}
          <div 
            className="p-6 border rounded-2xl shadow-xs transition-all duration-300 md:col-span-3 flex flex-col"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs uppercase tracking-widest font-extrabold" style={{ color: textMuted }}>
                7-Day Revenue (PLN)
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: textMuted }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                <span>Gross Revenue</span>
              </div>
            </div>
            <div className="flex-1 h-64 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData?.weeklyRevenue || []} key={themeUpdated}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cardBorder} vertical={false} />
                  <XAxis dataKey="day" stroke={textMuted} fontSize={10} tickLine={false} />
                  <YAxis stroke={textMuted} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12 }}
                    labelStyle={{ color: textPrimary }}
                    itemStyle={{ color: textPrimary }}
                    formatter={(value) => [`${value} PLN`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill={primaryColor} radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Bottom Alerts Card */}
        <div 
          className="p-6 border rounded-2xl shadow-xs transition-all duration-300"
          style={{ backgroundColor: cardBg, borderColor: cardBorder }}
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs uppercase tracking-widest font-extrabold" style={{ color: textMuted }}>
              Alerts & Notifications
            </h3>
            <button className="text-[11px] font-bold hover:underline" style={{ color: primaryColor }}>
              Clear All
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: cardBorder }}>
            {(dashboardData?.structuredAlerts || []).map((alert) => {
              const getIcon = (tag) => {
                switch(tag) {
                  case 'Marketing': return <ShoppingBag className="w-4 h-4 text-blue-500" />;
                  case 'City Mgr': return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
                  case 'Accountant': return <CreditCard className="w-4 h-4 text-amber-500" />;
                  case 'CS': return <AlertTriangle className="w-4 h-4 text-red-500" />;
                  default: return <Activity className="w-4 h-4 text-gray-500" />;
                }
              };
              return (
                <div key={alert.id} className="py-3.5 flex justify-between items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-3">
                    {getIcon(alert.tag)}
                    <span style={{ color: textPrimary }}>{alert.text}</span>
                  </div>
                  <span 
                    className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider shrink-0"
                    style={{ 
                      backgroundColor: alert.tag === 'Marketing' ? 'rgba(59, 130, 246, 0.08)' :
                                       alert.tag === 'City Mgr' ? 'rgba(16, 185, 129, 0.08)' :
                                       alert.tag === 'Accountant' ? 'rgba(245, 158, 11, 0.08)' :
                                       alert.tag === 'CS' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(107, 114, 128, 0.08)',
                      color: alert.tag === 'Marketing' ? '#3b82f6' :
                             alert.tag === 'City Mgr' ? '#10b981' :
                             alert.tag === 'Accountant' ? '#f59e0b' :
                             alert.tag === 'CS' ? '#ef4444' : '#6b7280'
                    }}
                  >
                    {alert.tag.replace(' ', '')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

