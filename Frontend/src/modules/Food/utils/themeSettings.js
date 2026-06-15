import { publicGetOnce } from "@food/api";

let cachedConfigs = null;

const applyLoadedConfigs = (configs, currentAppType) => {
  const root = document.documentElement;
  const apps = ['user_app', 'restaurant_app', 'delivery_app', 'admin_app'];

  apps.forEach(appType => {
    const activeConfig = configs[appType];
    if (!activeConfig) return;

    if (appType === 'user_app') {
      if (activeConfig.primaryColor) {
        root.style.setProperty('--primary', activeConfig.primaryColor);
        root.style.setProperty('--color-primary', activeConfig.primaryColor);
        root.style.setProperty('--color-primary-orange', activeConfig.primaryColor);
      }
      if (activeConfig.secondaryColor) {
        root.style.setProperty('--secondary', activeConfig.secondaryColor);
        root.style.setProperty('--color-secondary', activeConfig.secondaryColor);
      }
      if (activeConfig.logoUrl) {
        localStorage.setItem('user_app_logo', activeConfig.logoUrl);
      }
    } 
    else if (appType === 'restaurant_app') {
      if (activeConfig.primaryColor) {
        root.style.setProperty('--rt-primary', activeConfig.primaryColor);
      }
      if (activeConfig.secondaryColor) {
        root.style.setProperty('--rt-primary-strong', activeConfig.secondaryColor);
      }
      if (activeConfig.logoUrl) {
        localStorage.setItem('restaurant_app_logo', activeConfig.logoUrl);
      }
    }
    else if (appType === 'delivery_app') {
      if (activeConfig.primaryColor) {
        root.style.setProperty('--dv-primary', activeConfig.primaryColor);
      }
      if (activeConfig.secondaryColor) {
        root.style.setProperty('--dv-primary-strong', activeConfig.secondaryColor);
      }
      if (activeConfig.logoUrl) {
        localStorage.setItem('delivery_app_logo', activeConfig.logoUrl);
      }
    }
    else if (appType === 'admin_app') {
      if (activeConfig.primaryColor) {
        root.style.setProperty('--ad-primary', activeConfig.primaryColor);
      }
      if (activeConfig.secondaryColor) {
        root.style.setProperty('--ad-primary-strong', activeConfig.secondaryColor);
      }
      
      const bg = activeConfig.backgroundColor || '#f8fafc';
      const txt = activeConfig.textColor || '#0f172a';
      root.style.setProperty('--ad-background', bg);
      root.style.setProperty('--ad-text', txt);

      // Contrast checker for light vs dark backgrounds
      const cleanHex = bg.replace('#', '');
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
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const isDark = luminance < 0.5;

      if (isDark) {
        root.style.setProperty('--ad-card-bg', '#1e293b'); // slate-800
        root.style.setProperty('--ad-card-border', 'rgba(255, 255, 255, 0.1)');
        root.style.setProperty('--ad-card-text-muted', '#94a3b8'); // slate-400
        root.style.setProperty('--ad-text-primary', '#f8fafc'); // slate-50
        root.style.setProperty('--ad-input-bg', '#1e293b');
        root.style.setProperty('--ad-input-border', 'rgba(255, 255, 255, 0.2)');
        root.style.setProperty('--ad-primary-light', 'rgba(59, 130, 246, 0.15)');
      } else {
        root.style.setProperty('--ad-card-bg', '#ffffff');
        root.style.setProperty('--ad-card-border', '#e2e8f0'); // slate-200
        root.style.setProperty('--ad-card-text-muted', '#64748b'); // slate-500
        root.style.setProperty('--ad-text-primary', txt);
        root.style.setProperty('--ad-input-bg', '#ffffff');
        root.style.setProperty('--ad-input-border', '#cbd5e1'); // slate-300
        root.style.setProperty('--ad-primary-light', 'rgba(37, 99, 235, 0.1)');
      }

      if (activeConfig.logoUrl) {
        localStorage.setItem('admin_app_logo', activeConfig.logoUrl);
      }
    }
    
    // Apply font-family based on the current active app context
    if (activeConfig.fontFamily && appType === currentAppType) {
      root.style.setProperty('--main-font-family', activeConfig.fontFamily);
    }
  });
};

export const applyDynamicTheme = async (forceRefetch = false) => {
  try {
    const path = window.location.pathname;
    let currentAppType = 'user_app';
    if (path.includes('/restaurant')) currentAppType = 'restaurant_app';
    else if (path.includes('/delivery')) currentAppType = 'delivery_app';
    else if (path.includes('/admin')) currentAppType = 'admin_app';

    const root = document.documentElement;

    // Toggle the theme class
    if (currentAppType === 'admin_app') {
      root.classList.add('admin-theme-container');
    } else {
      root.classList.remove('admin-theme-container');
    }

    if (!forceRefetch && cachedConfigs) {
      applyLoadedConfigs(cachedConfigs, currentAppType);
      return;
    }

    const apps = ['user_app', 'restaurant_app', 'delivery_app', 'admin_app'];
    
    // Fetch all configurations simultaneously using the public endpoint
    const promises = apps.map(appType => 
      publicGetOnce(`/app-config/${appType}`, { noCache: true }).catch(() => null)
    );
    
    const results = await Promise.all(promises);
    const fetchedConfigs = {};
    
    results.forEach((response, index) => {
      const activeConfig = response?.data?.data || response?.data;
      if (activeConfig) {
        fetchedConfigs[apps[index]] = activeConfig;
      }
    });

    cachedConfigs = fetchedConfigs;
    applyLoadedConfigs(fetchedConfigs, currentAppType);

    // Dispatch global event once all themes are applied
    window.dispatchEvent(new CustomEvent('themeLoaded', { detail: { updated: true } }));

  } catch (error) {
    console.warn("Failed to load dynamic themes, falling back to default", error);
  }
};
