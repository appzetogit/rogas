import { useEffect } from "react";

let locks = 0;
let previous = null;

/** Locks the page behind an open modal / bottom sheet (reference-counted, so stacked sheets work). */
export default function useScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const body = document.body;
    if (locks === 0) {
      previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = "hidden";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0 && previous) {
        body.style.overflow = previous.overflow;
        body.style.paddingRight = previous.paddingRight;
        previous = null;
      }
    };
  }, [active]);
}
