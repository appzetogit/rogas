import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, RefreshCw } from 'lucide-react';
import { useTranslation } from "react-i18next";

export default function TermsAndConditionsPage() {
  const { t } = useTranslation("office");
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        setLoading(true);
        const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        // Fetching from Terms & Conditions section of office manager
        const response = await axios.get(`${baseURL}/food/pages/terms_office`);
        if (response.data?.success && response.data?.data) {
          setContent(response.data.data.content || '<p>Terms and Conditions content is not available yet.</p>');
        }
      } catch (error) {
        console.error('Error fetching terms and conditions:', error);
        setContent('<p>Failed to load terms and conditions.</p>');
      } finally {
        setLoading(false);
      }
    };
    fetchPolicy();
  }, []);

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-brand-primary tracking-tight">{t("Terms and Conditions")}</h1>
            <p className="text-sm text-brand-muted mt-1">{t("Review the rules and guidelines for using our platform.")}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-brand-divider overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-primary/50" />
            <p className="text-sm font-medium text-brand-muted">{t("Loading content...")}</p>
          </div>
        ) : (
          <div 
            className="prose prose-brand max-w-none text-sm text-brand-text leading-relaxed prose-headings:text-brand-primary prose-headings:font-bold prose-a:text-brand-primary"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </div>
  );
}
