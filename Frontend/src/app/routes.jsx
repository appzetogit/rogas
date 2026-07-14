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
const OfficeApp = lazy(() => import('../modules/Office/routes'))
import ProtectedRoute from '@food/components/ProtectedRoute'
import { applyDynamicTheme } from '../modules/Food/utils/themeSettings'

const PageLoader = () => <AppShellSkeleton />

/**
 * FoodAppWrapper — Renders the FoodApp component with the /food prefix.
 * 
 * In FoodApp's App.jsx, routes are defined as /restaurant, /usermain, /admin, /delivery
 * (without the /food prefix). Here, we extract the path following /food from useLocation 
 * and then render FoodApp. Since FoodApp does not use BrowserRouter internally 
 * (it only uses Routes), this works directly.
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

const OfficeAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <OfficeApp />
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
    applyDynamicTheme();
  }, [location.pathname]);

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
      <Route path="/restaurant/auth/*" element={<AuthApp />} />

      {/* Customer Module */}
      <Route path="/user/*" element={<CustomerAppWrapper />} />

      {/* Vendor Module */}
      <Route path="/vendor/*" element={<VendorAppWrapper />} />

      {/* Office Module */}
      <Route path="/office/*" element={<OfficeAppWrapper />} />

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
