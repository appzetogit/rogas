// Routing file
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))
const CustomerApp = lazy(() => import('../modules/CustomerApp/routes'))
const VendorApp = lazy(() => import('../modules/Vendor/routes'))
import ProtectedRoute from '@food/components/ProtectedRoute'

const PageLoader = () => <AppShellSkeleton />

/**
 * FoodAppWrapper — Quick-spicy App. को /food prefix के साथ render करता है.
 * 
 * Quick-spicy की App.jsx में routes /restaurant, /usermain, /admin, /delivery
 * जैसे hain (bina /food prefix ke). Yahan hum useLocation se /food ke baad wala
 * path nikalne ke baad FoodApp render karte hain. FoodApp internally BrowserRouter
 * nahi use karta (sirf Routes use karta hai), isliye ye directly kaam karta hai.
 */
const FoodAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const CustomerAppLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
    <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
  </div>
);

const CustomerAppWrapper = () => {
  return (
    <Suspense fallback={<CustomerAppLoader />}>
      <CustomerApp />
    </Suspense>
  )
}

const VendorAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <VendorApp />
    </Suspense>
  )
}

const RedirectToFood = () => {
  const location = useLocation();
  // We safely replace the exact current pathname with a /food prefixed pathname
  // This effectively catches programmatic navigation to absolute paths like '/restaurant/login'
  // and turns them into '/food/restaurant/login'
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />;
};

const MasterLandingPage = lazy(() => import('./MasterLandingPage'))
const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
      {/* Auth Module */}
      <Route path="/delivery/auth/*" element={<AuthApp />} />
      <Route path="/restaurant/auth/*" element={<AuthApp />} />

      {/* Customer Module */}
      <Route path="/user/*" element={<CustomerAppWrapper />} />

      {/* Vendor Module */}
      <Route path="/vendor/*" element={<VendorAppWrapper />} />

      {/* Food Module - Handle both /food and root / for the user app */}
      <Route path="/food/*" element={<FoodAppWrapper />} />

      {/* Global Admin Portal - AdminRouter handles its own protection for sub-routes */}
      <Route path="/admin/*" element={<AdminRouter />} />

      {/* Handle root and other paths via FoodAppWrapper */}
      <Route path="/" element={
        <Suspense fallback={<PageLoader />}>
          <MasterLandingPage />
        </Suspense>
      } />
      <Route path="/*" element={<FoodAppWrapper />} />
    </Routes>
  )
}

export default AppRoutes
