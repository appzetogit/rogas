import { useEffect, useState } from "react";

const isTextField = (el) => {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const type = (el.getAttribute("type") || "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "file", "range", "color", "image", "reset"].includes(type);
};

/**
 * True while the on-screen keyboard is (most likely) open: a text field has focus, or the visual viewport shrank a lot.
 * Used to hide fixed bottom navigation bars, which would otherwise float above the keyboard and cover the form.
 */
export default function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let focusTimer = null;

    const evaluate = () => {
      const vv = window.visualViewport;
      const shrunk = vv ? vv.height < window.innerHeight * 0.75 : false;
      setOpen(isTextField(document.activeElement) && (shrunk || !vv) || shrunk);
    };
    const onFocusIn = (e) => {
      if (isTextField(e.target)) {
        clearTimeout(focusTimer);
        focusTimer = setTimeout(evaluate, 120);
      }
    };
    const onFocusOut = () => {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(evaluate, 120);
    };

    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", evaluate);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", evaluate);
    };
  }, []);

  return open;
}
