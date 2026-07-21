import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StepCompanyProfile from '../components/onboarding/StepCompanyProfile';
import StepDocuments from '../components/onboarding/StepDocuments';
import StepContactDetails from '../components/onboarding/StepContactDetails';
import { startOnboardingApi, updateOnboardingStepApi, completeOnboardingApi } from '../services/officeApi';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Start onboarding session on mount
    startOnboardingApi({ email: INITIAL_ONBOARDING_DATA.email }).catch(err => console.error(err));
  }, []);

  const updateData = (fields) => {
    setData((prev) => ({ ...prev, ...fields }));
  };

  const handleNextStep = async (nextStep, currentData) => {
    setIsSubmitting(true);
    try {
        await updateOnboardingStepApi(currentStep, currentData);
        if (nextStep === 'dashboard') {
            await completeOnboardingApi();
            navigate('/office/under-review');
        } else {
            setCurrentStep(nextStep);
        }
    } catch (err) {
        alert(err.response?.data?.message || 'Failed to save data. Please try again.');
    } finally {
        setIsSubmitting(false);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'step1_profile':
        return (
          <StepCompanyProfile
            onNext={(step) => handleNextStep(step, data)}
            data={data}
            updateData={updateData}
            isSubmitting={isSubmitting}
          />
        );
      case 'step2_docs':
        return (
          <StepDocuments
            onNext={(step) => handleNextStep(step, data)}
            onBack={() => setCurrentStep('step1_profile')}
            data={data}
            updateData={updateData}
            isSubmitting={isSubmitting}
          />
        );
      case 'step3_final':
        return (
          <StepContactDetails
            onNext={(step) => handleNextStep(step, data)}
            onBack={() => setCurrentStep('step2_docs')}
            data={data}
            updateData={updateData}
            isSubmitting={isSubmitting}
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
