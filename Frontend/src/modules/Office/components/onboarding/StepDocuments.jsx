import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CloudUpload, Paperclip, Check, Loader2, Trash2, ShieldCheck, Sparkles } from 'lucide-react';

const DOCUMENT_LIST = [
  {
    key: 'nipCertificate',
    title: 'NIP Certificate',
    description: 'Provide the Tax Identification Number certificate issued by the tax office.',
    defaultName: 'nip_certificate.pdf',
  },
  {
    key: 'regonCertificate',
    title: 'REGON Certificate',
    description: 'Business identification certificate from the National Business Registry.',
    defaultName: 'regon_certificate.pdf',
  },
  {
    key: 'vatRegistration',
    title: 'VAT Registration',
    description: 'Valid confirmation of VAT status (EU-VAT if applicable).',
    defaultName: 'vat_registration_status.pdf',
  },
  {
    key: 'addressProof',
    title: 'Address Proof',
    description: 'Utility bill, bank statement, or lease agreement for office location.',
    defaultName: 'utility_bill_office.pdf',
  },
  {
    key: 'idProof',
    title: 'ID Proof of Signatory',
    description: 'National ID or Passport copy of the authorized signing officer.',
    defaultName: 'id_passport_copy.pdf',
  },
  {
    key: 'authLetter',
    title: 'Authorization Letter',
    description: 'Official letter authorizing the representative to manage the account.',
    defaultName: 'representative_auth_letter.pdf',
  },
];

export default function StepDocuments({ onNext, onBack, data, updateData }) {
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const docsState = data.documents || {};

  const handleUploadClick = (docKey, defaultName) => {
    if (uploadingDoc) return; // Prevent double uploading

    setUploadingDoc(docKey);
    setUploadProgress(0);

    // Simulate progress increments
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 20;
      });
    }, 150);

    setTimeout(() => {
      clearInterval(interval);
      
      const updatedDocs = {
        ...docsState,
        [docKey]: {
          name: defaultName,
          size: (1.2 + Math.random() * 2).toFixed(1) + ' MB',
          status: 'completed',
        },
      };
      
      updateData({ documents: updatedDocs });
      setUploadingDoc(null);
    }, 1200);
  };

  const handleDelete = (docKey) => {
    const updatedDocs = { ...docsState };
    delete updatedDocs[docKey];
    updateData({ documents: updatedDocs });
  };

  const handleAutoFill = () => {
    const filledDocs = {};
    DOCUMENT_LIST.forEach((doc) => {
      filledDocs[doc.key] = {
        name: doc.defaultName,
        size: (1.0 + Math.random() * 2).toFixed(1) + ' MB',
        status: 'completed',
      };
    });
    updateData({ documents: filledDocs });
  };

  const uploadedCount = Object.keys(docsState).length;
  const isAllUploaded = uploadedCount === DOCUMENT_LIST.length;

  const handleNext = () => {
    if (!isAllUploaded) {
      if (confirm('For the full verification onboarding experience, we recommend uploading all files. Would you like to auto-fill them now and proceed?')) {
        handleAutoFill();
        setTimeout(() => {
          onNext('step3_final');
        }, 300);
      }
      return;
    }
    onNext('step3_final');
  };

  return (
    <div className="w-full max-w-4xl flex flex-col gap-6" id="onboarding_step2_container">
      {/* Top Header */}
      <header className="w-full h-14 flex items-center justify-between bg-white border border-gray-100 rounded-xl px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[#287965]">DailyMealBox</span>
          <div className="h-5 w-[1px] bg-gray-200" />
          <span className="text-gray-500 font-medium text-xs md:text-sm">Vendor Verification</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">
          <span>Step 2 of 3</span>
        </div>
      </header>

      {/* Title Area */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1C1E] tracking-tight">Documents & Certificates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload the official documents to verify your business status.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Auto Fill Trigger */}
          <button
            type="button"
            onClick={handleAutoFill}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#287965]/20 text-xs font-bold text-[#287965] hover:bg-[#287965]/5 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Fill All Files</span>
          </button>
          
          <div className="flex flex-col items-end text-right">
            <span className="text-xs font-semibold text-gray-400 uppercase">Progress</span>
            <span className="text-sm font-bold text-[#287965]">
              {Math.round((uploadedCount / DOCUMENT_LIST.length) * 100)}% Complete
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden shadow-inner">
        <div 
          className="h-full bg-[#287965] transition-all duration-500 ease-out" 
          style={{ width: `${(uploadedCount / DOCUMENT_LIST.length) * 100}%` }}
        />
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-4">
        {DOCUMENT_LIST.map((doc) => {
          const docState = docsState[doc.key];
          const isUploading = uploadingDoc === doc.key;
          const isCompleted = docState?.status === 'completed';

          return (
            <div 
              key={doc.key} 
              className={`bg-white rounded-xl p-5 border shadow-sm transition-all flex flex-col h-full group ${
                isCompleted 
                  ? 'border-[#287965]/20 bg-[#287965]/5' 
                  : isUploading 
                  ? 'border-[#287965]/40 bg-gray-50' 
                  : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  isCompleted ? 'bg-[#287965]/10 text-[#287965]' : 'bg-gray-100 text-gray-500'
                }`}>
                  <CloudUpload className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-[#1A1C1E] tracking-tight">{doc.title}</h3>
              </div>

              <p className="text-xs text-gray-500 mb-6 flex-grow leading-relaxed">
                {doc.description}
              </p>

              {isCompleted ? (
                <div className="space-y-3">
                  <div className="p-2 bg-white rounded-lg border border-[#287965]/20 flex items-center justify-between text-xs text-[#1A1C1E] shadow-sm">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <Paperclip className="w-3.5 h-3.5 text-[#287965] shrink-0" />
                      <span className="truncate font-medium">{docState.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono shrink-0 font-semibold ml-2">
                      {docState.size}
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="flex-grow py-2 px-3 bg-[#287965]/10 text-[#287965] font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-sm">
                      <Check className="w-3.5 h-3.5" />
                      <span>Ready</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.key)}
                      className="p-2 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Upload"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : isUploading ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold text-[#287965]">
                    <span className="flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#287965] h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUploadClick(doc.key, doc.defaultName)}
                  disabled={!!uploadingDoc}
                  className="w-full py-2.5 px-4 rounded-lg border-2 border-[#287965] text-[#287965] hover:bg-[#287965]/5 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Upload File</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="w-full flex items-center justify-between bg-white rounded-xl p-5 border border-gray-100 shadow-md">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-bold text-xs hover:bg-gray-50 transition-all cursor-pointer focus:outline-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="hidden md:flex flex-col items-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Documents Status</span>
          <span className="text-xs font-bold text-[#287965]">
            {uploadedCount} of {DOCUMENT_LIST.length} Files Selected
          </span>
        </div>

        <button
          type="button"
          onClick={handleNext}
          className={`flex items-center gap-1.5 px-8 py-2.5 rounded-lg font-bold text-xs text-white transition-all shadow-md cursor-pointer ${
            isAllUploaded 
              ? 'bg-[#287965] hover:bg-[#1f6050] active:scale-[0.98]' 
              : 'bg-[#287965]/70 hover:bg-[#287965] cursor-pointer'
          }`}
          id="step2_next_btn"
        >
          <span>Next Step</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
