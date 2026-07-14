import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import OfficeLayout from './components/OfficeLayout';
import LoginPage from './pages/LoginPage';
import OtpVerifyPage from './pages/OtpVerifyPage';
import OnboardingPage from './pages/OnboardingPage';

const OfficeRoutes = () => {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-otp" element={<OtpVerifyPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard/*" element={<OfficeLayout />} />
            <Route path="*" element={<Navigate to="/office/login" replace />} />
        </Routes>
    );
};

export default OfficeRoutes;
