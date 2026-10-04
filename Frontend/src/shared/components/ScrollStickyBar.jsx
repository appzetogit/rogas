import { useEffect, useState } from "react";

/**
 * Compact top bar that slides in once the page has scrolled past a large hero header, so the app always has a header
 * on screen. (md:left-64 leaves room for the side navigation used on desktop.)
 */
export default function ScrollStickyBar({ title, right = null, threshold = 120, className = "bg-primary text-white" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed top-0 left-0 right-0 md:left-64 z-40 h-12 px-4 flex items-center justify-between shadow-md transition-transform duration-200 ${className} ${visible ? "translate-y-0" : "-translate-y-full"}`}
    >
      <span className="font-extrabold text-[15px] truncate">{title}</span>
      {right}
    </div>
  );
}
