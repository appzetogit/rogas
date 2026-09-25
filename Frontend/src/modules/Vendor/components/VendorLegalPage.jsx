import { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { publicAPI } from "../../../services/api/index";
import { useTranslation } from "react-i18next";

export function VendorLegalPage({ pageType }) {
  const { t } = useTranslation("vendor");
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.backTo;
  
  const handleBack = () => {
    if (backTo) {
      navigate(backTo, { replace: true });
    } else {
      navigate("/vendor/welcome", { replace: true });
    }
  };

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError("");
      try {
        let res;
        // Adjust endpoint based on API logic. Assuming publicAPI has getTerms & getPrivacy methods.
        // Vendor might have specific terms, but we fallback to general terms.
        if (pageType === "terms") {
          res = await publicAPI.getTerms("terms");
          setTitle(res.data?.data?.title || t("Terms and Conditions"));
        } else {
          res = await publicAPI.getPrivacy("privacy");
          setTitle(res.data?.data?.title || t("Privacy Policy"));
        }
        setContent(res.data?.data?.content || "Content not available.");
      } catch (err) {
        console.error("Failed to load legal page:", err);
        setError(t("Failed to load content. Please try again later."));
        setTitle(pageType === "terms" ? t("Terms and Conditions") : t("Privacy Policy"));
      } finally {
        setLoading(false);
      }
    };
    
    fetchContent();
  }, [pageType]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F0] pt-0 md:pt-6 pb-6">
      <header className="fixed top-0 left-0 right-0 w-full max-w-xl mx-auto z-40 bg-primary text-on-primary flex justify-between items-center px-4 h-14 shadow-sm md:rounded-t-xl">
        <button
          onClick={handleBack}
          className="cursor-pointer active:scale-95 transition-transform p-2 rounded-full flex items-center justify-center hover:opacity-90"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-[16px] font-semibold text-center truncate max-w-[200px]">
          {title}
        </h1>
        <div className="w-10" />
      </header>

      <main className="flex-grow pt-16 px-4 pb-12 w-full max-w-xl mx-auto bg-white overflow-x-hidden md:rounded-b-xl md:shadow-md">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-primary">
            <Loader2 className="animate-spin w-8 h-8" />
            <span className="text-sm font-bold">{t("Loading...")}</span>
          </div>
        ) : error ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 text-center">
            <p className="text-red-500 font-semibold text-sm">{error}</p>
          </div>
        ) : (
          <div 
            className="bg-white p-4 rounded-xl shadow-sm border border-outline-variant/30 prose prose-sm max-w-none text-on-surface prose-headings:text-primary prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: content }} 
          />
        )}
      </main>
    </div>
  );
}
