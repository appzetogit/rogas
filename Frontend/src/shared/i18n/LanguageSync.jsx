import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { syncLanguages, syncAccountPreference, detectPanel, getLanguageList } from "./index";

/** Mount once inside the router: loads languages at start and reconciles the account preference after sign-in. */
export default function LanguageSync() {
  const location = useLocation();

  useEffect(() => {
    syncLanguages();

    // If the first download failed (backend restarting, offline), try again when the tab is used again.
    const retry = () => {
      if (document.visibilityState === "hidden") return;
      if (!getLanguageList().languages.length) syncLanguages();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, []);

  useEffect(() => {
    const panel = detectPanel(location.pathname);
    if (panel) syncAccountPreference(panel);
  }, [location.pathname]);

  return null;
}
