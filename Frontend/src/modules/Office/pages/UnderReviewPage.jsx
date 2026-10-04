import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, XCircle } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { getCompanyDetailsApi } from '../services/officeApi';

const POLL_MS = 20000;

export default function UnderReviewPage() {
    const { t } = useTranslation("office");
    const navigate = useNavigate();
    const [rejected, setRejected] = useState(null); // { reason }

    const goToLogin = () => {
        localStorage.removeItem('office_token');
        navigate('/office/login', { replace: true });
    };

    // Asks the server for the admin's decision; approved -> dashboard, rejected -> show the reason.
    const checkStatus = useCallback(async () => {
        if (!localStorage.getItem('office_token')) return;
        try {
            const res = await getCompanyDetailsApi();
            const company = res.data?.data;
            if (company?.status === 'approved') {
                navigate('/office/dashboard', { replace: true });
            } else if (company?.status === 'rejected') {
                setRejected({ reason: company.rejectionReason || '' });
            } else if (company?.status === 'deactivated') {
                goToLogin();
            }
        } catch {
            // Network hiccup or not found yet: keep waiting, the next check will retry.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    useEffect(() => {
        checkStatus();
        const timer = setInterval(checkStatus, POLL_MS);
        const onFocus = () => checkStatus();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [checkStatus]);

    const Icon = rejected ? XCircle : Clock;
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F8F9F8', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflow: 'auto' }}>
            <div style={{ width: '100%', maxWidth: '480px', backgroundColor: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: '20px' }}>

                <div style={{ width: '80px', height: '80px', backgroundColor: rejected ? '#FEE2E2' : '#FEF9C3', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                    <Icon style={{ fontSize: '40px', color: rejected ? '#DC2626' : '#EAB308' }} />
                </div>

                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1A1C1E', marginBottom: '12px' }}>
                    {rejected ? t("Application Not Approved") : t("Application Under Review")}
                </h1>

                <p style={{ color: '#6C7278', fontSize: '15px', lineHeight: '1.6', marginBottom: rejected?.reason ? '12px' : '32px' }}>
                    {rejected
                        ? t("We could not approve your company at this time.")
                        : t("Thank you for applying to DailyMealBox. Your company profile is currently being reviewed by our administration team. We will notify you once it has been approved.")}
                </p>
                {rejected?.reason && (
                    <p style={{ color: '#B91C1C', fontSize: '14px', background: '#FEF2F2', padding: '10px 14px', borderRadius: '10px', marginBottom: '28px', width: '100%' }}>
                        {rejected.reason}
                    </p>
                )}
                {!rejected && (
                    <p style={{ color: '#9CA3AF', fontSize: '12px', marginBottom: '24px' }}>
                        {t("This page updates automatically when your application is approved.")}
                    </p>
                )}

                <button
                    onClick={goToLogin}
                    style={{ width: '100%', padding: '14px 24px', backgroundColor: '#287965', color: '#fff', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', border: 'none' }}
                >
                    {t("Back to Login")}
                </button>
            </div>
        </div>
    );
}
