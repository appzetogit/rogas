import React from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from "react-i18next";

export default function UnderReviewPage() {
    const { t } = useTranslation("office");
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F8F9F8', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflow: 'auto' }}>
            <div style={{ width: '100%', maxWidth: '480px', backgroundColor: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', margin: '20px' }}>
                
                {/* Icon Background */}
                <div style={{ width: '80px', height: '80px', backgroundColor: '#FEF9C3', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                    <Clock style={{ fontSize: '40px', color: '#EAB308' }} />
                </div>

                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1A1C1E', marginBottom: '12px' }}>
                    {t("Application Under Review")}
                </h1>
                
                <p style={{ color: '#6C7278', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
                    {t("Thank you for applying to DailyMealBox. Your company profile is currently being reviewed by our administration team. We will notify you once it has been approved.")}
                </p>

                <button 
                    onClick={() => {
                        localStorage.removeItem('office_token');
                        window.location.href = '/office/login';
                    }}
                    style={{ width: '100%', padding: '14px 24px', backgroundColor: '#287965', color: '#fff', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', border: 'none' }}
                >
                    {t("Back to Login")}
                </button>
            </div>
        </div>
    );
}
