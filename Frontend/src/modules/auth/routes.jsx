import { Routes, Route, Navigate } from "react-router-dom"
import { Suspense, lazy } from "react"
import Loader from "@food/components/Loader"

const Login = lazy(() => import("./pages/Login"))
const Portal = lazy(() => import("./pages/Portal"))
const Support = lazy(() => import("./pages/PublicSupport"))

export default function AuthRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="support" element={<Support />} />
        <Route path="portal" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/user/auth/login" replace />} />
      </Routes>
    </Suspense>
  )
}
