import { Loader2 } from "lucide-react"

/**
 * Neutral full-screen loader used as the Suspense / auth fallback for the admin, office, delivery and vendor panels.
 * (It used to render the customer app's restaurant-grid skeleton, which showed the wrong app while loading.)
 */
export default function Loader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen w-full items-center justify-center bg-[#F5F5F0]"
    >
      <Loader2 className="h-9 w-9 animate-spin text-[#1F7A63]" />
    </div>
  )
}
