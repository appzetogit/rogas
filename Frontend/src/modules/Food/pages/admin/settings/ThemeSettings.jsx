import { useState, useEffect } from "react";
import { Info, Upload, Save, Loader2, MonitorSmartphone, Truck, Store, Palette, Check, AlertTriangle, Search, Activity, ShoppingBag, CreditCard, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { adminClient } from "@food/api/axios";

const apps = [
  { id: 'user_app', label: 'User App', icon: MonitorSmartphone },
  { id: 'delivery_app', label: 'Delivery App', icon: Truck },
  { id: 'restaurant_app', label: 'Restaurant App', icon: Store },
  { id: 'admin_app', label: 'Admin Panel', icon: Info }
];

const predefinedThemes = [
  {
    name: 'Green Theme',
    primaryColor: '#10b981',
    secondaryColor: '#047857',
    backgroundColor: '#f0fdf4',
    textColor: '#064e3b'
  },
  {
    name: 'Blue Theme',
    primaryColor: '#3b82f6',
    secondaryColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
    textColor: '#1e3a8a'
  },
  {
    name: 'Red Theme',
    primaryColor: '#ef4444',
    secondaryColor: '#b91c1c',
    backgroundColor: '#fef2f2',
    textColor: '#7f1d1d'
  },
  {
    name: 'Purple Theme',
    primaryColor: '#8b5cf6',
    secondaryColor: '#6d28d9',
    backgroundColor: '#f5f3ff',
    textColor: '#4c1d95'
  },
  {
    name: 'Orange Theme',
    primaryColor: '#f97316',
    secondaryColor: '#c2410c',
    backgroundColor: '#fff7ed',
    textColor: '#7c2d12'
  },
  {
    name: 'Dark Theme',
    primaryColor: '#3b82f6',
    secondaryColor: '#1d4ed8',
    backgroundColor: '#0f172a',
    textColor: '#f8fafc'
  },
  {
    name: 'Light Theme',
    primaryColor: '#2563eb',
    secondaryColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    textColor: '#0f172a'
  }
];

export default function ThemeSettings() {
  const [selectedApp, setSelectedApp] = useState('user_app');
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'predefined'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [configs, setConfigs] = useState({
    user_app: { primaryColor: '#e11d48', secondaryColor: '#be123c', logoUrl: '', fontFamily: "'Poppins', sans-serif", backgroundColor: '#ffffff', textColor: '#0f172a' },
    delivery_app: { primaryColor: '#0ea5e9', secondaryColor: '#0284c7', logoUrl: '', fontFamily: "'Poppins', sans-serif", backgroundColor: '#ffffff', textColor: '#0f172a' },
    restaurant_app: { primaryColor: '#B80B3D', secondaryColor: '#66001D', logoUrl: '', fontFamily: "'Poppins', sans-serif", backgroundColor: '#ffffff', textColor: '#0f172a' },
    admin_app: { primaryColor: '#1F7A63', secondaryColor: '#165A49', logoUrl: '', fontFamily: "'Poppins', sans-serif", backgroundColor: '#F5F5F0', textColor: '#2B2B2B' },
  });

  const fontOptions = [
    { label: 'Poppins', value: "'Poppins', sans-serif" },
    { label: 'Outfit', value: "'Outfit', sans-serif" },
    { label: 'Inter', value: "'Inter', sans-serif" },
    { label: 'Roboto', value: "'Roboto', sans-serif" },
    { label: 'Nunito Sans', value: "'Nunito Sans', sans-serif" },
    { label: 'Sora', value: "'Sora', sans-serif" },
    { label: 'Merriweather', value: "'Merriweather', serif" }
  ];

  useEffect(() => {
    fetchConfigs();
  }, []);

  // Whenever selectedApp changes, default back to 'manual' tab if it's not admin
  useEffect(() => {
    if (selectedApp !== 'admin_app') {
      setActiveTab('manual');
    }
  }, [selectedApp]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await adminClient.get('/app-config');
      if (response.data?.success && response.data?.data) {
        const fetchedData = response.data.data;
        const newConfigs = { ...configs };
        fetchedData.forEach(item => {
          if (newConfigs[item.appName]) {
            newConfigs[item.appName] = { ...newConfigs[item.appName], ...item };
          }
        });
        setConfigs(newConfigs);
      }
    } catch (error) {
      toast.error("Failed to load configurations");
    } finally {
      setLoading(false);
    }
  };

  const handleColorChange = (type, value) => {
    setConfigs(prev => ({
      ...prev,
      [selectedApp]: {
        ...prev[selectedApp],
        [type]: value
      }
    }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'app-logos');

    const loadingToast = toast.loading('Uploading logo...');
    try {
      const response = await adminClient.post('/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data?.success) {
        handleColorChange('logoUrl', response.data.data.url);
        toast.success('Logo uploaded successfully', { id: loadingToast });
      }
    } catch (error) {
      toast.error('Failed to upload logo', { id: loadingToast });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentConfig = configs[selectedApp];
      await adminClient.put(`/app-config/${selectedApp}`, {
        primaryColor: currentConfig.primaryColor,
        secondaryColor: currentConfig.secondaryColor,
        logoUrl: currentConfig.logoUrl,
        fontFamily: currentConfig.fontFamily,
        backgroundColor: currentConfig.backgroundColor,
        textColor: currentConfig.textColor
      });
      toast.success(`${apps.find(a => a.id === selectedApp).label} configuration saved!`);
      
      // Update theme instantly
      import('../../../utils/themeSettings.js')
        .then(({ applyDynamicTheme }) => applyDynamicTheme(true))
        .catch(() => {});
        
    } catch (error) {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const currentConfig = configs[selectedApp];

  // Helper variables for preview colors calculations
  const previewBg = currentConfig.backgroundColor || '#f8fafc';
  const cleanHex = previewBg.replace('#', '');
  let r = 248, g = 250, b = 252;
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else if (cleanHex.length === 3) {
    r = parseInt(cleanHex.substring(0, 1).repeat(2), 16);
    g = parseInt(cleanHex.substring(1, 2).repeat(2), 16);
    b = parseInt(cleanHex.substring(2, 3).repeat(2), 16);
  }
  const isPrevDark = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) < 0.5;

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            App Customization
            <Palette className="w-6 h-6 text-slate-400" />
          </h1>
          <p className="text-slate-500 mt-2">Manage themes and logos for your different applications.</p>
        </div>

        {/* Application selector buttons */}
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          {apps.map(app => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => setSelectedApp(app.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shrink-0 ${
                  selectedApp === app.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                {app.label}
              </button>
            );
          })}
        </div>

        {/* Main Settings Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">
              {apps.find(a => a.id === selectedApp).label} Settings
            </h2>

            {/* TAB SELECTION FOR ADMIN PANEL ONLY */}
            {selectedApp === 'admin_app' && (
              <div className="flex gap-2 border-b border-slate-200 mb-8 pb-px">
                <button
                  onClick={() => setActiveTab('manual')}
                  className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === 'manual'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MonitorSmartphone className="w-4 h-4" />
                  Manual Theme
                </button>
                <button
                  onClick={() => setActiveTab('predefined')}
                  className={`px-6 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === 'predefined'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Palette className="w-4 h-4" />
                  Color Themes
                </button>
              </div>
            )}

            {/* TAB CONTENTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              
              {/* Left Column(s) depending on selected Tab */}
              <div className="lg:col-span-2">
                
                {activeTab === 'manual' ? (
                  /* MANUAL COLOR CONFIGURATION */
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-slate-700 mb-4">Manual Color Settings</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      
                      {/* Primary Color */}
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Primary Color</label>
                        <div className="flex items-center gap-4">
                          <input
                            type="color"
                            value={currentConfig.primaryColor}
                            onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                            className="w-12 h-12 rounded cursor-pointer border border-slate-300 p-1 bg-white"
                          />
                          <input
                            type="text"
                            value={currentConfig.primaryColor}
                            onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-slate-700 font-mono"
                          />
                        </div>
                      </div>

                      {/* Secondary Color */}
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Secondary Color</label>
                        <div className="flex items-center gap-4">
                          <input
                            type="color"
                            value={currentConfig.secondaryColor}
                            onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                            className="w-12 h-12 rounded cursor-pointer border border-slate-300 p-1 bg-white"
                          />
                          <input
                            type="text"
                            value={currentConfig.secondaryColor}
                            onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-slate-700 font-mono"
                          />
                        </div>
                      </div>

                      {/* Background Color */}
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Background Color</label>
                        <div className="flex items-center gap-4">
                          <input
                            type="color"
                            value={currentConfig.backgroundColor || '#f8fafc'}
                            onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
                            className="w-12 h-12 rounded cursor-pointer border border-slate-300 p-1 bg-white"
                          />
                          <input
                            type="text"
                            value={currentConfig.backgroundColor || '#f8fafc'}
                            onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-slate-700 font-mono"
                          />
                        </div>
                      </div>

                      {/* Text Color */}
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Text Color</label>
                        <div className="flex items-center gap-4">
                          <input
                            type="color"
                            value={currentConfig.textColor || '#0f172a'}
                            onChange={(e) => handleColorChange('textColor', e.target.value)}
                            className="w-12 h-12 rounded cursor-pointer border border-slate-300 p-1 bg-white"
                          />
                          <input
                            type="text"
                            value={currentConfig.textColor || '#0f172a'}
                            onChange={(e) => handleColorChange('textColor', e.target.value)}
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-slate-700 font-mono"
                          />
                        </div>
                      </div>

                    </div>

                    {/* Typography dropdown */}
                    <div className="pt-2">
                      <label className="block text-sm font-medium text-slate-600 mb-2">Typography (Font Family)</label>
                      <select
                        value={currentConfig.fontFamily || "'Poppins', sans-serif"}
                        onChange={(e) => handleColorChange('fontFamily', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 bg-white"
                        style={{ fontFamily: currentConfig.fontFamily || "'Poppins', sans-serif" }}
                      >
                        {fontOptions.map((font) => (
                          <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </div>

                  </div>
                ) : (
                  /* PREDEFINED PALETTE SELECTIONS */
                  <div>
                    <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
                      Predefined Theme Library
                      <Palette className="w-5 h-5 text-blue-600" />
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {predefinedThemes.map((theme) => {
                        const isSelected =
                          currentConfig.primaryColor.toLowerCase() === theme.primaryColor.toLowerCase() &&
                          currentConfig.secondaryColor.toLowerCase() === theme.secondaryColor.toLowerCase() &&
                          (currentConfig.backgroundColor || '#f8fafc').toLowerCase() === theme.backgroundColor.toLowerCase() &&
                          (currentConfig.textColor || '#0f172a').toLowerCase() === theme.textColor.toLowerCase();

                        return (
                          <div
                            key={theme.name}
                            onClick={() => {
                              setConfigs((prev) => ({
                                ...prev,
                                admin_app: {
                                  ...prev.admin_app,
                                  primaryColor: theme.primaryColor,
                                  secondaryColor: theme.secondaryColor,
                                  backgroundColor: theme.backgroundColor,
                                  textColor: theme.textColor,
                                },
                              }));
                            }}
                            className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                              isSelected
                                ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50/10'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-3">
                              <span className="font-bold text-sm text-slate-800">{theme.name}</span>
                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>

                            {/* Circular Preview Cards */}
                            <div 
                              className="rounded-lg p-3 border border-slate-100 mb-3 flex flex-col gap-1.5 shadow-xs"
                              style={{ backgroundColor: theme.backgroundColor }}
                            >
                              <div className="h-1.5 w-12 rounded" style={{ backgroundColor: theme.primaryColor }}></div>
                              <div className="h-1 w-full rounded" style={{ backgroundColor: theme.textColor, opacity: 0.3 }}></div>
                              <div className="h-1 w-2/3 rounded" style={{ backgroundColor: theme.textColor, opacity: 0.2 }}></div>
                              <div className="flex gap-1 mt-1">
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white leading-none" style={{ backgroundColor: theme.primaryColor }}>
                                  Primary
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-white leading-none" style={{ backgroundColor: theme.secondaryColor }}>
                                  Secondary
                                </span>
                              </div>
                            </div>

                            {/* Hex breakdown lists */}
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-500">
                              <div className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: theme.primaryColor }} />
                                <span className="truncate">Pri: <strong className="font-mono text-slate-700">{theme.primaryColor}</strong></span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: theme.secondaryColor }} />
                                <span className="truncate">Sec: <strong className="font-mono text-slate-700">{theme.secondaryColor}</strong></span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: theme.backgroundColor }} />
                                <span className="truncate">Bg: <strong className="font-mono text-slate-700">{theme.backgroundColor}</strong></span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: theme.textColor }} />
                                <span className="truncate">Txt: <strong className="font-mono text-slate-700">{theme.textColor}</strong></span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Logo Upload Column */}
              <div className="space-y-6 lg:border-l lg:pl-8 border-slate-100">
                <h3 className="text-lg font-semibold text-slate-700">App Logo</h3>
                
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors relative">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {currentConfig.logoUrl ? (
                    <div className="flex flex-col items-center">
                      <img src={currentConfig.logoUrl} alt="App Logo" className="h-24 object-contain mb-4" />
                      <p className="text-sm text-slate-500">Click to change logo</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                        <Upload className="w-8 h-8" />
                      </div>
                      <p className="font-medium text-slate-700">Drop your logo here, or click to browse</p>
                      <p className="text-sm text-slate-500 mt-1">PNG, JPG or SVG (max 2MB)</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* HIGH FIDELITY LIVE PREVIEW CONTAINER */}
            <div className="mt-12 pt-8 border-t border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">Dynamic Live Preview</h3>
                <span className="text-xs text-slate-400 font-mono">Updates in real-time</span>
              </div>
              
              {/* Dynamic preview canvas */}
              <div 
                className="rounded-2xl border border-slate-300 overflow-hidden shadow-md flex flex-col text-slate-700"
                style={{ 
                  '--prev-primary': currentConfig.primaryColor,
                  '--prev-secondary': currentConfig.secondaryColor,
                  '--prev-background': previewBg,
                  '--prev-text': currentConfig.textColor || '#0f172a',
                  '--prev-card-bg': isPrevDark ? '#1e293b' : '#ffffff',
                  '--prev-card-border': isPrevDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0',
                  '--prev-card-text-muted': isPrevDark ? '#94a3b8' : '#64748b',
                  '--prev-text-primary': isPrevDark ? '#f8fafc' : (currentConfig.textColor || '#0f172a'),
                  '--prev-input-bg': isPrevDark ? '#1e293b' : '#ffffff',
                  '--prev-input-border': isPrevDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1',
                  '--prev-primary-light': isPrevDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                  fontFamily: currentConfig.fontFamily || "'Poppins', sans-serif" 
                }}
              >
                {/* PREVIEW CONTAINER BODY */}
                <div className="flex h-[420px] md:h-[460px] overflow-hidden">
                  
                  {/* SIDEBAR PREVIEW */}
                  <div 
                    className="w-[160px] md:w-[200px] flex flex-col border-r p-3 shrink-0 text-white select-none transition-all duration-300"
                    style={{ backgroundColor: 'var(--prev-primary)', borderColor: 'var(--prev-card-border)' }}
                  >
                    {/* Header bar */}
                    <div 
                      className="p-2.5 rounded-lg mb-4 flex items-center justify-between"
                      style={{ backgroundColor: 'var(--prev-secondary)' }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {currentConfig.logoUrl ? (
                          <img src={currentConfig.logoUrl} alt="Logo" className="w-5 h-5 object-contain bg-white/20 p-0.5 rounded" />
                        ) : (
                          <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[9px] font-bold">R</span>
                        )}
                        <span className="text-[10px] md:text-xs font-extrabold truncate">Admin Panel</span>
                      </div>
                    </div>

                    {/* Search menu */}
                    <div className="relative mb-3 flex items-center bg-white/10 rounded px-2 py-1.5">
                      <Search className="w-3.5 h-3.5 text-white/50 shrink-0" />
                      <span className="text-[10px] ml-1.5 text-white/40 truncate">Search Menu...</span>
                    </div>

                    {/* Menu items list */}
                    <div className="space-y-1 flex-1 overflow-y-auto">
                      <div className="px-2 py-1.5 rounded text-[10px] md:text-xs font-bold bg-white/10 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Dashboard
                      </div>
                      <div className="px-2 py-1.5 rounded text-[10px] md:text-xs font-bold text-white/80 hover:bg-white/5 flex items-center gap-1.5">
                        Orders
                      </div>
                      <div className="px-2 py-1.5 rounded text-[10px] md:text-xs font-bold text-white/80 hover:bg-white/5 flex items-center gap-1.5">
                        Restaurants
                      </div>
                      <div className="px-2 py-1.5 rounded text-[10px] md:text-xs font-bold text-white/80 hover:bg-white/5 flex items-center gap-1.5">
                        Customers
                      </div>
                    </div>
                  </div>

                  {/* CONTENT AREA PREVIEW */}
                  <div 
                    className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
                    style={{ backgroundColor: 'var(--prev-background)' }}
                  >
                    
                    {/* HEADER / NAVBAR PREVIEW */}
                    <div 
                      className="h-12 border-b px-4 flex items-center justify-between bg-white transition-all duration-300 select-none shrink-0"
                      style={{ backgroundColor: 'var(--prev-card-bg)', borderColor: 'var(--prev-card-border)' }}
                    >
                      <div className="text-[11px] md:text-xs text-slate-400 font-medium">Pages / Dashboard</div>
                      <div className="flex items-center gap-3">
                        <div className="relative flex items-center">
                          <span className="w-2.5 h-2.5 rounded-full absolute -top-1 -right-1 flex items-center justify-center text-[7px] text-white font-bold" style={{ backgroundColor: 'var(--prev-primary)' }}>3</span>
                          <span className="text-[11px]" style={{ color: 'var(--prev-card-text-muted)' }}>🔔</span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] font-bold">A</div>
                      </div>
                    </div>

                    {/* MAIN SCROLLER PREVIEW */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      
                      {/* DASHBOARD CARDS PREVIEW */}
                      <div className="grid grid-cols-2 gap-3">
                        <div 
                          className="p-3 border rounded-xl shadow-xs transition-all duration-300"
                          style={{ backgroundColor: 'var(--prev-card-bg)', borderColor: 'var(--prev-card-border)' }}
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--prev-card-text-muted)' }}>Gross Revenue</span>
                            <span className="text-xs">💰</span>
                          </div>
                          <p className="text-base font-bold mt-1" style={{ color: 'var(--prev-text-primary)' }}>₹45,280</p>
                          <span className="text-[9px] text-emerald-500 font-semibold">↑ 12% vs last month</span>
                        </div>
                        
                        <div 
                          className="p-3 border rounded-xl shadow-xs transition-all duration-300"
                          style={{ backgroundColor: 'var(--prev-card-bg)', borderColor: 'var(--prev-card-border)' }}
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--prev-card-text-muted)' }}>Total Orders</span>
                            <span className="text-xs">📦</span>
                          </div>
                          <p className="text-base font-bold mt-1" style={{ color: 'var(--prev-text-primary)' }}>1,480</p>
                          <span className="text-[9px] text-emerald-500 font-semibold">↑ 8% vs yesterday</span>
                        </div>
                      </div>

                      {/* ALERT PREVIEW */}
                      <div 
                        className="p-3 border rounded-xl flex items-start gap-2.5 text-[10px] font-medium"
                        style={{ backgroundColor: 'var(--prev-primary-light)', borderColor: 'var(--prev-primary)', color: 'var(--prev-text-primary)' }}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--prev-primary)' }} />
                        <div>
                          <span className="font-bold">System Operations Alert:</span> New joining request from zone New Delhi requires validation.
                        </div>
                      </div>

                      {/* TABLE AND FORM PREVIEW */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* TABLE PREVIEW */}
                        <div 
                          className="border rounded-xl p-3 shadow-xs"
                          style={{ backgroundColor: 'var(--prev-card-bg)', borderColor: 'var(--prev-card-border)' }}
                        >
                          <h4 className="text-[11px] font-bold mb-2 uppercase" style={{ color: 'var(--prev-card-text-muted)' }}>Recent Deliveries</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[10px]">
                              <thead>
                                <tr className="border-b" style={{ borderColor: 'var(--prev-card-border)' }}>
                                  <th className="pb-1 text-slate-400 font-medium">Order ID</th>
                                  <th className="pb-1 text-slate-400 font-medium">Status</th>
                                  <th className="pb-1 text-right text-slate-400 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b" style={{ borderColor: 'var(--prev-card-border)' }}>
                                  <td className="py-1.5 text-slate-700" style={{ color: 'var(--prev-text-primary)' }}>#1204</td>
                                  <td className="py-1.5">
                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] bg-emerald-100 text-emerald-800 font-bold">Success</span>
                                  </td>
                                  <td className="py-1.5 text-right font-semibold" style={{ color: 'var(--prev-text-primary)' }}>₹450</td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 text-slate-700" style={{ color: 'var(--prev-text-primary)' }}>#1203</td>
                                  <td className="py-1.5">
                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] bg-amber-100 text-amber-800 font-bold">Pending</span>
                                  </td>
                                  <td className="py-1.5 text-right font-semibold" style={{ color: 'var(--prev-text-primary)' }}>₹780</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* FORM & BUTTON PREVIEW */}
                        <div 
                          className="border rounded-xl p-3 shadow-xs space-y-2.5"
                          style={{ backgroundColor: 'var(--prev-card-bg)', borderColor: 'var(--prev-card-border)' }}
                        >
                          <h4 className="text-[11px] font-bold uppercase" style={{ color: 'var(--prev-card-text-muted)' }}>Quick Settings Form</h4>
                          
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold" style={{ color: 'var(--prev-card-text-muted)' }}>Restaurant Name</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Royal Curry" 
                              className="w-full px-2 py-1 text-[10px] rounded border"
                              style={{ backgroundColor: 'var(--prev-input-bg)', borderColor: 'var(--prev-input-border)', color: 'var(--prev-text-primary)' }}
                              readOnly
                            />
                          </div>

                          <div className="flex gap-2 pt-1">
                            {/* Primary Button */}
                            <button 
                              className="flex-1 py-1 px-3 text-[10px] font-bold rounded text-white text-center hover:opacity-90 select-none shadow-xs"
                              style={{ backgroundColor: 'var(--prev-primary)' }}
                            >
                              Submit
                            </button>
                            
                            {/* Secondary Button */}
                            <button 
                              className="py-1 px-3 text-[10px] font-bold rounded text-slate-600 border text-center select-none"
                              style={{ backgroundColor: 'transparent', borderColor: 'var(--prev-card-border)', color: 'var(--prev-card-text-muted)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>

          {/* Action Bar */}
          <div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-sm disabled:opacity-70"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
