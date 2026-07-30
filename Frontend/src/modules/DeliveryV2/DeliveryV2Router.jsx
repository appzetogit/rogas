import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from "@food/components/Loader";

// Auth Pages (Lazy loaded)
const Welcome = lazy(() => import("./pages/auth/Welcome"))
const SignIn = lazy(() => import("./pages/auth/SignIn"))
const OTP = lazy(() => import("./pages/auth/OTP"))
const SignupStep1 = lazy(() => import("./pages/auth/SignupStep1"))
const SignupStep2 = lazy(() => import("./pages/auth/SignupStep2"))
const SupportInfo = lazy(() => import("./pages/auth/SupportInfo"))

// V2 Pages
import NewDeliveryDashboard from './newUI/NewDeliveryDashboard';
import { PayoutV2 } from './pages/pocket/PayoutV2';
import { PocketStatementV2 } from './pages/pocket/PocketStatementV2';
import { DeductionStatementV2 } from './pages/pocket/DeductionStatementV2';
import { LimitSettlementV2 } from './pages/pocket/LimitSettlementV2';
import { PocketBalanceV2 } from './pages/pocket/PocketBalanceV2';
import { CashLimitInfoV2 } from './pages/pocket/CashLimitInfoV2';
import { ProfileBankV2 } from './pages/profile/ProfileBankV2';
import { ProfileDocsV2 } from './pages/profile/ProfileDocsV2';
import { ProfileWithdrawalsV2 } from './pages/profile/ProfileWithdrawalsV2';
import { SupportTicketsV2 } from './pages/help/SupportTicketsV2';
import { CreateSupportTicketV2 } from './pages/help/CreateSupportTicketV2';
import { ViewSupportTicketV2 } from './pages/help/ViewSupportTicketV2';
import ShowIdCardV2 from './pages/help/ShowIdCardV2';
import { PocketDetailsV2 } from './pages/pocket/PocketDetailsV2';
import { ProfileDetailsV2 } from './pages/profile/ProfileDetailsV2';
import TermsAndConditionsV2 from './pages/TermsAndConditionsV2';
import PrivacyPolicyV2 from './pages/PrivacyPolicyV2';
import NotificationsV2 from './pages/NotificationsV2';
import DeliveryServicePage from './pages/DeliveryServicePage';
import DeliveryRidesPage from './pages/DeliveryRidesPage';


const DeliveryV2Router = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Auth routes */}
        <Route path="welcome" element={<Welcome />} />
        <Route path="login" element={<SignIn />} />
        <Route path="otp" element={<OTP />} />
        <Route path="support" element={<SupportInfo />} />
        <Route path="signup" element={<Navigate to="/food/delivery/login" replace />} />
        <Route path="signup/details" element={<SignupStep1 />} />
        <Route path="signup/documents" element={<SignupStep2 />} />
        <Route path="terms" element={<TermsAndConditionsV2 />} />
        <Route path="profile/privacy" element={<PrivacyPolicyV2 />} />
        <Route path="profile/terms" element={<TermsAndConditionsV2 />} />

        {/* Protected Core Routes */}
        <Route path="/" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/routes" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/route" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/earn" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/pocket" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><NewDeliveryDashboard /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsV2 /></ProtectedRoute>} />
        <Route path="/profile/details" element={<ProtectedRoute><ProfileDetailsV2 /></ProtectedRoute>} />
        <Route path="/profile/bank" element={<ProtectedRoute><ProfileBankV2 /></ProtectedRoute>} />
        <Route path="/profile/withdrawals" element={<ProtectedRoute><ProfileWithdrawalsV2 /></ProtectedRoute>} />
        <Route path="/profile/documents" element={<ProtectedRoute><ProfileDocsV2 /></ProtectedRoute>} />
        <Route path="/service" element={<ProtectedRoute><DeliveryServicePage /></ProtectedRoute>} />
        <Route path="/rides" element={<ProtectedRoute><DeliveryRidesPage /></ProtectedRoute>} />
        
        {/* Support Systems */}
        <Route path="/help/tickets" element={<ProtectedRoute><SupportTicketsV2 /></ProtectedRoute>} />
        <Route path="/help/tickets/create" element={<ProtectedRoute><CreateSupportTicketV2 /></ProtectedRoute>} />
        <Route path="/help/tickets/:ticketId" element={<ProtectedRoute><ViewSupportTicketV2 /></ProtectedRoute>} />
        <Route path="/help/id-card" element={<ProtectedRoute><ShowIdCardV2 /></ProtectedRoute>} />
        <Route path="/profile/terms" element={<ProtectedRoute><TermsAndConditionsV2 /></ProtectedRoute>} />
        <Route path="/profile/privacy" element={<ProtectedRoute><PrivacyPolicyV2 /></ProtectedRoute>} />
        
        {/* Financial Deep-Pages */}
        <Route path="/pocket/payout" element={<ProtectedRoute><PayoutV2 /></ProtectedRoute>} />
        <Route path="/pocket/statement" element={<ProtectedRoute><PocketStatementV2 /></ProtectedRoute>} />
        <Route path="/pocket/deductions" element={<ProtectedRoute><DeductionStatementV2 /></ProtectedRoute>} />
        <Route path="/pocket/limit-settlement" element={<ProtectedRoute><LimitSettlementV2 /></ProtectedRoute>} />
        <Route path="/pocket/balance" element={<ProtectedRoute><PocketBalanceV2 /></ProtectedRoute>} />
        <Route path="/pocket/cash-limit" element={<ProtectedRoute><CashLimitInfoV2 /></ProtectedRoute>} />
        <Route path="/pocket/details" element={<ProtectedRoute><PocketDetailsV2 /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/food/delivery" replace />} />
      </Routes>
    </Suspense>
  );
};

export default DeliveryV2Router;
