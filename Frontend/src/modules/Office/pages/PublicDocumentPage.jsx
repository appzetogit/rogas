import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PublicDocumentPage({ children }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F8F9F8] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/office/login')}
            className="flex items-center gap-2 text-[#4A4C56] hover:text-[#287965] font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Login
          </button>
        </div>
        <div className="font-bold text-xl text-[#287965] tracking-tight">
          DailyMealBox
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-8 mt-4">
        {children}
      </main>
    </div>
  );
}
