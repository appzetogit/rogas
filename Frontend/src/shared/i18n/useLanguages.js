import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getLanguageList, subscribe, syncLanguages, setLanguage, FALLBACK_LANGUAGE } from "./index";

/** Enabled languages from the admin panel plus the active one and a setter. */
export default function useLanguages() {
  const { i18n } = useTranslation();
  const [list, setList] = useState(getLanguageList());
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setList(getLanguageList());
    // Opening a picker before the list ever downloaded: fetch it now instead of staying English-only.
    if (!getLanguageList().languages.length) syncLanguages();
    return subscribe(() => setList({ ...getLanguageList() }));
  }, []);

  const change = useCallback(async (code) => {
    setSwitching(true);
    try {
      await setLanguage(code);
    } finally {
      setSwitching(false);
    }
  }, []);

  // English always exists even before the list has been downloaded.
  const languages = list.languages.length
    ? list.languages
    : [{ code: FALLBACK_LANGUAGE, name: "English", nativeName: "English", flag: "🇬🇧" }];

  return {
    languages,
    current: i18n.language || FALLBACK_LANGUAGE,
    defaultLanguage: list.defaultLanguage,
    switching,
    setLanguage: change,
    refresh: syncLanguages,
  };
}
