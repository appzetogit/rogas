import { useState, useEffect } from "react";
import { Info, Upload, Save, Loader2, MonitorSmartphone, Truck, Store } from "lucide-react";
import { toast } from "sonner";
import { adminClient } from "@food/api/axios";

const apps = [
  { id: 'user_app', label: 'User App', icon: MonitorSmartphone },
  { id: 'delivery_app', label: 'Delivery App', icon: Truck },
  { id: 'restaurant_app', label: 'Restaurant App', icon: Store },
  { id: 'admin_app', label: 'Admin Panel', icon: Info }
];

export default function ThemeSettings() {
  const [selectedApp, setSelectedApp] = useState('user_app');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [configs, setConfigs] = useState({
    user_app: { primaryColor: '#e11d48', secondaryColor: '#be123c', logoUrl: '', fontFamily: "'Poppins', sans-serif" },
    delivery_app: { primaryColor: '#0ea5e9', secondaryColor: '#0284c7', logoUrl: '', fontFamily: "'Poppins', sans-serif" },
    restaurant_app: { primaryColor: '#B80B3D', secondaryColor: '#66001D', logoUrl: '', fontFamily: "'Poppins', sans-serif" },
    admin_app: { primaryColor: '#2563eb', secondaryColor: '#1d4ed8', logoUrl: '', fontFamily: "'Poppins', sans-serif" },
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
        fontFamily: currentConfig.fontFamily
      });
      toast.success(`${apps.find(a => a.id === selectedApp).label} configuration saved!`);
      
      // Update theme instantly (so the admin panel shows the updated colors if they are editing the active app)
      import('../../../utils/themeSettings.js')
        .then(({ applyDynamicTheme }) => applyDynamicTheme())
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

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            App Customization
            <Info className="w-6 h-6 text-slate-400" />
          </h1>
          <p className="text-slate-500 mt-2">Manage themes and logos for your different applications.</p>
        </div>

        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          {apps.map(app => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => setSelectedApp(app.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
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

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">
              {apps.find(a => a.id === selectedApp).label} Settings
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Theme Colors */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-700">Theme Colors</h3>
                
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Primary Color</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={currentConfig.primaryColor}
                      onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                      className="w-14 h-14 rounded cursor-pointer border-0 p-0"
                    />
                    <input
                      type="text"
                      value={currentConfig.primaryColor}
                      onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Secondary Color</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={currentConfig.secondaryColor}
                      onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                      className="w-14 h-14 rounded cursor-pointer border-0 p-0"
                    />
                    <input
                      type="text"
                      value={currentConfig.secondaryColor}
                      onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Typography (Font Family)</label>
                  <select
                    value={currentConfig.fontFamily || "'Poppins', sans-serif"}
                    onChange={(e) => handleColorChange('fontFamily', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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

              {/* Logo Upload */}
              <div className="space-y-6">
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

            <div className="mt-12 pt-8 border-t border-slate-100">
              <h3 className="text-lg font-semibold text-slate-700 mb-6">Live Preview</h3>
              <div 
                className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
                style={{ backgroundColor: currentConfig.primaryColor, fontFamily: currentConfig.fontFamily || "'Poppins', sans-serif" }}
              >
                <div className="p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {currentConfig.logoUrl ? (
                      <img src={currentConfig.logoUrl} alt="Logo" className="h-10 bg-white/20 p-1 rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-white/20 rounded flex items-center justify-center">Logo</div>
                    )}
                    <span className="font-semibold text-lg">{apps.find(a => a.id === selectedApp).label}</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/20"></div>
                </div>
                <div className="bg-white p-6 min-h-[150px] rounded-t-2xl mt-4 mx-2 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
                  <div className="h-4 w-1/3 rounded mb-4" style={{ backgroundColor: currentConfig.secondaryColor }}></div>
                  <div className="h-4 w-2/3 bg-slate-100 rounded mb-2"></div>
                  <div className="h-4 w-1/2 bg-slate-100 rounded"></div>
                  
                  <div className="mt-6 mb-2">
                    <h4 className="text-lg font-bold text-slate-800">Typography Preview</h4>
                    <p className="text-sm text-slate-500">The quick brown fox jumps over the lazy dog.</p>
                  </div>
                  
                  <button 
                    className="mt-4 px-6 py-2 rounded-lg text-white font-medium w-full"
                    style={{ backgroundColor: currentConfig.primaryColor }}
                  >
                    Action Button
                  </button>
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
