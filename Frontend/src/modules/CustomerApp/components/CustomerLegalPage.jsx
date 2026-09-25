import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Heart, Users, ShieldCheck, Truck, Star, CheckCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { publicAPI } from "@food/api";
import { useTranslation } from "react-i18next";

const ICON_MAP = {
  Heart, Users, ShieldCheck, Truck, Star, CheckCircle
};

export function CustomerLegalPage({ pageType }) {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.backTo;
  
  const handleBack = () => {
    if (backTo) {
      navigate(backTo, { replace: true });
    } else {
      navigate("/user/home", { replace: true });
    }
  };

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [aboutData, setAboutData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError("");
      try {
        let res;
        if (pageType === "terms") {
          res = await publicAPI.getTerms("terms");
          setTitle(res.data?.data?.title || t("Terms and Conditions"));
          setContent(res.data?.data?.content || "Content not available.");
        } else if (pageType === "about") {
          res = await publicAPI.getTerms("about");
          setTitle(t("About Us"));
          setAboutData(res.data?.data);
        } else {
          res = await publicAPI.getPrivacy("privacy");
          setTitle(res.data?.data?.title || t("Privacy Policy"));
          setContent(res.data?.data?.content || "Content not available.");
        }
      } catch (err) {
        console.error("Failed to load legal page:", err);
        setError(t("Failed to load content. Please try again later."));
        setTitle(pageType === "terms" ? t("Terms and Conditions") : pageType === "about" ? t("About Us") : t("Privacy Policy"));
      } finally {
        setLoading(false);
      }
    };
    
    fetchContent();
  }, [pageType]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F0]">
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button
          onClick={handleBack}
          className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center truncate">
          {title}
        </h1>
        <div className="w-8" />
      </header>

      <main className="flex-grow pt-20 px-4 sm:px-8 lg:px-10 pb-12 w-full max-w-7xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-primary">
            <Loader2 className="animate-spin w-8 h-8" />
            <span className="text-sm font-bold">{t("Loading...")}</span>
          </div>
        ) : error ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100 text-center">
            <p className="text-red-500 font-semibold text-sm">{error}</p>
          </div>
        ) : pageType === "about" && aboutData ? (
          <div className="flex flex-col gap-5">
            {/* Top Section */}
            <div className="bg-[#fffdf8] rounded-3xl p-8 pt-10 flex flex-col items-center text-center shadow-sm border border-[#bec9c3]/20 relative overflow-hidden">
              <div className="absolute top-0 w-full h-[150px] bg-gradient-to-b from-orange-100/60 to-transparent pointer-events-none" />
              
              <div className="w-[100px] h-[100px] bg-white rounded-full flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.05)] z-10 mb-5 overflow-hidden border border-white p-1">
                {aboutData.logo ? (
                  <img src={aboutData.logo} alt={t("Logo")} className="w-full h-full object-contain rounded-full" />
                ) : (
                  <div className="text-3xl font-extrabold text-primary">{aboutData.appName?.[0] || 'A'}</div>
                )}
              </div>
              
              <h2 className="text-[26px] font-extrabold text-[#1a1c1a] z-10 tracking-tight">{aboutData.appName}</h2>
              <p className="text-[13px] text-[#6e7a74] font-medium mt-1 mb-6 z-10">{t("Version {{version}}", { version: aboutData.version })}</p>
              
              <p className="text-[#3e4945] font-medium text-[15px] leading-relaxed z-10 px-2">
                {aboutData.description}
              </p>
            </div>

            {/* Features */}
            {aboutData.features?.length > 0 && (
              <div className="flex flex-col gap-4">
                {aboutData.features.map((f, idx) => {
                  const IconComponent = ICON_MAP[f.icon] || Heart;
                  return (
                    <div key={idx} className="bg-white rounded-[20px] p-5 shadow-sm flex items-center gap-4 border border-[#bec9c3]/20">
                      <div 
                        className={`w-14 h-14 rounded-[18px] flex items-center justify-center shrink-0 ${f.bgColor?.includes('#') ? '' : (f.bgColor || 'bg-red-50')} ${f.color?.includes('#') ? '' : (f.color || 'text-red-500')}`}
                        style={{ 
                          backgroundColor: f.bgColor?.includes('#') ? f.bgColor : undefined, 
                          color: f.color?.includes('#') ? f.color : undefined 
                        }}
                      >
                        <IconComponent size={26} strokeWidth={2.5} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-[16px] font-extrabold text-[#1a1c1a] mb-1">{f.title}</h3>
                        <p className="text-[13.5px] text-[#5b6661] font-medium leading-relaxed">{f.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div 
            className="bg-white p-5 rounded-2xl shadow-sm border border-[#bec9c3]/20 prose prose-sm max-w-none text-[#3e4945] prose-headings:text-primary prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: content }} 
          />
        )}
      </main>
    </div>
  );
}
