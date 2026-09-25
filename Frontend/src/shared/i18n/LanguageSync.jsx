import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { syncLanguages, syncAccountPreference, detectPanel } from "./index";

/** Mount once inside the router: loads languages at start and reconciles the account preference after sign-in. */
export default function LanguageSync() {
  const location = useLocation();

  useEffect(() => {
    syncLanguages();
  }, []);

  useEffect(() => {
    const panel = detectPanel(location.pathname);
    if (panel) syncAccountPreference(panel);
  }, [location.pathname]);

  return null;
}
