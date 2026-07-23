import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import OfficeLayout from './components/OfficeLayout';
import LoginPage from './pages/LoginPage';
import OtpVerifyPage from './pages/OtpVerifyPage';
import OnboardingPage from './pages/OnboardingPage';
import UnderReviewPage from './pages/UnderReviewPage';
import PublicDocumentPage from './pages/PublicDocumentPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsAndConditionsPage from './pages/TermsAndConditionsPage';

const OfficeRoutes = () => {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-otp" element={<OtpVerifyPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/under-review" element={<UnderReviewPage />} />
            <Route path="/dashboard" element={<OfficeLayout />} />
            <Route path="/VendorsAssign" element={<OfficeLayout />} />
            <Route path="/AssignedMealPlans" element={<OfficeLayout />} />
            <Route path="/PaymentHistory" element={<OfficeLayout />} />
            <Route path="/public-privacy" element={<PublicDocumentPage><PrivacyPolicyPage /></PublicDocumentPage>} />
            <Route path="/public-terms" element={<PublicDocumentPage><TermsAndConditionsPage /></PublicDocumentPage>} />
            <Route path="/PrivacyPolicy" element={<OfficeLayout />} />
            <Route path="/TermsAndConditions" element={<OfficeLayout />} />
            <Route path="/CompanyDetails" element={<OfficeLayout />} />
            <Route path="/" element={<Navigate to="/office/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/office/login" replace />} />
        </Routes>
    );
};

export default OfficeRoutes;
