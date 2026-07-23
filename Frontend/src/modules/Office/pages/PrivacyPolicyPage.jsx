import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, RefreshCw } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        setLoading(true);
        const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        // Note: Fetching from Privacy Policy section of office manager
        const response = await axios.get(`${baseURL}/food/pages/privacy_office`);
        if (response.data?.success && response.data?.data) {
          setContent(response.data.data.content || '<p>Privacy policy content is not available yet.</p>');
        }
      } catch (error) {
        console.error('Error fetching privacy policy:', error);
        setContent('<p>Failed to load privacy policy.</p>');
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
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-brand-primary tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-brand-muted mt-1">Review our data practices and your rights.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-brand-divider overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-primary/50" />
            <p className="text-sm font-medium text-brand-muted">Loading content...</p>
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
