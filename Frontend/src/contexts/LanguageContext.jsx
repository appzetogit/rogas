import React, { createContext, useState, useContext, useEffect, useCallback } from "react";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("app_lang") || "en");
  const [translations, setTranslations] = useState({});
  const [loading, setLoading] = useState(true);

  const loadTranslations = useCallback(async (targetLang) => {
    try {
      setLoading(true);
      const response = await fetch(`/locales/${targetLang}.json`);
      if (!response.ok) throw new Error("Translation file not found");
      const data = await response.json();
      setTranslations(data);
    } catch (error) {
      console.error(`Error loading translations for ${targetLang}:`, error);
      // Fallback to English if loading fails
      if (targetLang !== "en") {
        loadTranslations("en");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTranslations(lang);
    document.documentElement.setAttribute("lang", lang);
  }, [lang, loadTranslations]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "app_lang" && e.newValue && e.newValue !== lang) {
        setLang(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [lang]);

  const changeLanguage = (newLang) => {
    if (newLang === lang) return;
    localStorage.setItem("app_lang", newLang);
    setLang(newLang);
    window.dispatchEvent(new Event("local_lang_changed"));
  };

  const t = useCallback((key, defaultValue = "") => {
    return translations[key] || defaultValue || key;
  }, [translations]);

  const value = { lang, changeLanguage, t, loading };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: "en",
      changeLanguage: () => {},
      t: (key, def = "") => def || key,
      loading: false
    };
  }
  return context;
};
