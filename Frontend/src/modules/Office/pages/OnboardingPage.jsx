import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StepCompanyProfile from '../components/onboarding/StepCompanyProfile';
import StepDocuments from '../components/onboarding/StepDocuments';
import StepContactDetails from '../components/onboarding/StepContactDetails';

const INITIAL_ONBOARDING_DATA = {
  email: 'j.doe@example.com', // Auto-fill standard mock email from mockup
  companyName: '',
  address: '',
  nip: '',
  regon: '',
  documents: {},
  contactName: '',
  designation: '',
  contactEmail: '',
  phone: '',
  bankName: '',
  accountName: '',
  iban: '',
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState('step1_profile');
  const [data, setData] = useState(INITIAL_ONBOARDING_DATA);

  const updateData = (fields) => {
    setData((prev) => ({ ...prev, ...fields }));
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'step1_profile':
        return (
          <StepCompanyProfile
            onNext={(step) => setCurrentStep(step)}
            data={data}
            updateData={updateData}
          />
        );
      case 'step2_docs':
        return (
          <StepDocuments
            onNext={(step) => setCurrentStep(step)}
            onBack={() => setCurrentStep('step1_profile')}
            data={data}
            updateData={updateData}
          />
        );
      case 'step3_final':
        return (
          <StepContactDetails
            onNext={(step) => {
              if (step === 'dashboard') {
                navigate('/office/dashboard');
              } else {
                setCurrentStep(step);
              }
            }}
            onBack={() => setCurrentStep('step2_docs')}
            data={data}
            updateData={updateData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-x-hidden bg-[#F8F9F8]">
      {/* Tonal framing lines for Onboarding canvas pages */}
      <div className="fixed right-0 top-0 bottom-0 w-1 bg-[#287965]/10 pointer-events-none z-50" />
      <div className="fixed left-0 top-0 bottom-0 w-1 bg-[#287965]/10 pointer-events-none z-50" />

      {/* Main Form/Container Render */}
      <div className="w-full flex justify-center py-4 relative z-10">
        {renderCurrentStep()}
      </div>
    </div>
  );
}
