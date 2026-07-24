import { useState } from "react";
import { Link } from "react-router-dom";
import { IMAGES } from "../types";
import { MapPin, ShoppingBag, Check, ArrowLeft, CheckCircle, Leaf, UtensilsCrossed, Navigation, Search } from 'lucide-react';

export function WelcomeScreen({ onSignup, onLogin }) {
  return (<div className="relative min-h-screen flex flex-col bg-[#F5F5F0]">
    <main className="relative min-h-screen flex flex-col">
      {/* Top Green Section */}
      <section className="h-[52vh] bg-primary relative px-6 pt-28 pb-8 flex flex-col items-center rounded-b-[40px]">
        {/* Headline */}
        <h1 className="text-white text-[32px] font-extrabold text-center leading-tight mb-4 max-w-[280px] tracking-tight">
          Your weekly food, automated.
        </h1>


        {/* Illustration Area */}
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[280px] h-[220px] z-10">
          {localStorage.getItem('user_app_logo') ? (
            <img 
              src={localStorage.getItem('user_app_logo')} 
              alt="App Logo" 
              className="w-full h-full object-contain bg-white p-4 rounded-[32px] shadow-xl rotate-[-2deg] transition-all hover:rotate-0 duration-300" 
            />
          ) : (
            <div className="w-full h-full bg-white shadow-xl rounded-[32px] overflow-hidden rotate-[-2deg] transition-all hover:rotate-0 duration-300 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <ShoppingBag className="text-[80px] text-primary/50" />
            </div>
          )}
        </div>
      </section>

      {/* Bottom Beige Section */}
      <section className="flex-grow pt-24 pb-12 px-6 flex flex-col">
        {/* Features List */}
        <div className="space-y-4 mb-8 flex-grow">
          <div className="flex items-center gap-4 group">
            <div className="w-6 h-6 rounded-lg bg-primary-container flex items-center justify-center transition-transform group-hover:scale-110">
              <Check className="text-white text-[16px] font-bold" />
            </div>
            <span className="text-[14px] text-[#3e4945] font-medium font-sans">From local home cooks near you</span>
          </div>
          <div className="flex items-center gap-4 group">
            <div className="w-6 h-6 rounded-lg bg-primary-container flex items-center justify-center transition-transform group-hover:scale-110">
              <Check className="text-white text-[16px] font-bold" />
            </div>
            <span className="text-[14px] text-[#3e4945] font-medium font-sans">Weekly subscription — order once</span>
          </div>
          <div className="flex items-center gap-4 group">
            <div className="w-6 h-6 rounded-lg bg-primary-container flex items-center justify-center transition-transform group-hover:scale-110">
              <Check className="text-white text-[16px] font-bold" />
            </div>
            <span className="text-[14px] text-[#3e4945] font-medium font-sans">Delivered fresh to your door</span>
          </div>
          <div className="flex items-center gap-4 group">
            <div className="w-6 h-6 rounded-lg bg-primary-container flex items-center justify-center transition-transform group-hover:scale-110">
              <Check className="text-white text-[16px] font-bold" />
            </div>
            <span className="text-[14px] text-[#3e4945] font-medium font-sans">Skip or pause anytime</span>
          </div>
        </div>

        {/* Action Area */}
        <div className="flex flex-col items-center gap-4 mt-auto">
          <button onClick={onLogin} className="w-full bg-primary-container hover:bg-[#1b6b55] text-white font-bold h-14 rounded-2xl active:scale-[0.98] transition-all shadow-md text-base">
            Get Started
          </button>
          
          <div className="flex items-center gap-3 text-[11px] text-[#8e9894] mt-2 mb-2 font-medium">
            <Link to="/user/termsandcondition" className="hover:text-primary hover:underline transition-colors">Terms & Conditions</Link>
            <span>&bull;</span>
            <Link to="/user/privacy" className="hover:text-primary hover:underline transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </section>
    </main>
  </div>);
}

export function GoalsScreen({ onBack, onNext }) {
  const [selectedGoal, setSelectedGoal] = useState("Eat Healthy");
  const goals = [
    { name: "Eat Healthy", label: "Eat Healthy", icon: "🥗", bg: "bg-[#E8F3F0]" },
    { name: "Save Time", label: "Save Time", icon: "⏰", bg: "bg-[#FFF4E5]" },
    { name: "Family Meals", label: "Family Meals", icon: "👨‍👩‍👧", bg: "bg-[#EBF1FF]" },
    { name: "Fitness & Macros", label: "Fitness & Macros", icon: "💪", bg: "bg-[#FCE8E8]" }
  ];
  return (<div className="min-h-screen flex flex-col bg-[#F5F5F0]">
    {/* Top Bar Status bar sim */}


    <header className="flex justify-between items-center w-full px-[20px] h-14 bg-transparent">
      <button onClick={onBack} className="w-10 h-10 flex items-center justify-start text-on-surface active:scale-95 transition-all text-primary">
        <ArrowLeft className="text-[24px]" />
      </button>
      <h1 className="text-lg font-bold text-on-surface">DailyMealBox</h1>
      <div className="w-10"></div>
    </header>

    <main className="flex-1 px-[20px] pb-12">
      {/* Progress Indicator */}
      <div className="mt-2 flex flex-col gap-1">
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div className="h-full bg-primary-container w-[60%] transition-all duration-500 ease-out"></div>
        </div>
        <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">
          Step 3 of 5
        </p>
      </div>

      {/* Headline */}
      <div className="mt-6 mb-6">
        <h2 className="text-[24px] font-extrabold text-on-surface leading-tight mb-2 tracking-tight">
          What brings you here?
        </h2>
        <p className="text-[14px] text-on-surface-variant leading-relaxed">
          We'll personalise your meal recommendations based on your unique lifestyle goals.
        </p>
      </div>

      {/* Bento Goal Selection */}
      <div className="grid grid-cols-2 gap-4">
        {goals.map((g) => (<button key={g.name} onClick={() => setSelectedGoal(g.name)} className={`relative flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm transition-all duration-200 border-2 ${selectedGoal === g.name
          ? "border-primary-container shadow-[0_4px_12px_rgba(31,122,99,0.15)] scale-[1.02]"
          : "border-transparent hover:border-surface-container"}`}>
          <div className={`w-16 h-16 mb-4 rounded-full ${g.bg} flex items-center justify-center text-3xl transition-transform active:scale-95`}>
            {g.icon}
          </div>
          <span className="text-[14px] font-semibold text-on-surface">{g.label}</span>
          {selectedGoal === g.name && (<div className="absolute top-2 right-2">
            <CheckCircle className="text-primary-container font-fill-1 text-[20px]" />
          </div>)}
        </button>))}
      </div>

      {/* Cinematic Imagery */}
      <div className="mt-8 rounded-2xl overflow-hidden h-32 relative shadow-sm bg-gradient-to-tr from-primary/30 to-primary/10">
        <div className="absolute inset-0 flex items-center justify-center">
          <Leaf className="text-[64px] text-primary/30" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
        <div className="absolute bottom-3 left-4 text-white">
          <p className="text-[11px] font-bold tracking-wider uppercase opacity-85">Pro Tip</p>
          <p className="text-sm font-semibold">You can change your goals anytime.</p>
        </div>
      </div>
    </main>

    <footer className="p-[20px] pt-4 bg-[#F5F5F0]">
      <button onClick={onNext} className="w-full bg-primary-container hover:bg-[#1b6b55] transition-all py-4 rounded-xl text-white font-bold text-center active:scale-95 shadow-md">
        Continue
      </button>
    </footer>
  </div>);
}
export function DietPrefsScreen({ onBack, onNext, initialPrefs }) {
  const [dietType, setDietType] = useState(initialPrefs.dietType);
  const [allergies, setAllergies] = useState(initialPrefs.allergies);
  const [budget, setBudget] = useState(initialPrefs.weeklyBudget);
  const dietOptions = [
    "No preference",
    "Vegan",
    "Vegetarian",
    "Keto"
  ];
  const allergyList = [
    "Gluten", "Dairy", "Eggs", "Nuts", "Peanuts", "Soy", "Fish",
    "Shellfish", "Sesame", "Mustard", "Celery", "Lupin", "Molluscs", "Sulphites"
  ];
  const toggleAllergy = (allergy) => {
    if (allergies.includes(allergy)) {
      setAllergies(allergies.filter((a) => a !== allergy));
    }
    else {
      setAllergies([...allergies, allergy]);
    }
  };
  const handleContinue = () => {
    onNext({
      dietType,
      allergies,
      weeklyBudget: budget
    });
  };
  return (<div className="min-h-screen flex flex-col bg-[#F5F5F0] text-[#1b1c1c]">
    {/* simulated status bar */}


    <header className="flex justify-between items-center w-full px-[20px] h-14 mt-1">
      <button onClick={onBack} className="p-2 -ml-2 active:scale-95 transition-all text-[#1b1c1c]">
        <ArrowLeft className="text-[24px]" />
      </button>
      <div className="flex-1 px-4">
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div className="h-full bg-primary-container w-[80%] rounded-full transition-all duration-500"></div>
        </div>
      </div>
      <div className="w-10"></div>
    </header>

    <main className="px-[20px] pb-32">
      {/* Headline */}
      <h1 className="text-[22px] font-extrabold mt-6 text-[#1b1c1c]">Your dietary preferences</h1>
      <p className="text-on-surface-variant text-[14px] mt-1 text-[#3e4945]">
        Personalize your DailyMealBox to match your health goals and taste.
      </p>

      {/* Diet Type section */}
      <section className="mt-8">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#6e7a74] mb-4">Diet type</h2>
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
          {dietOptions.map((opt) => (<button key={opt} onClick={() => setDietType(opt)} className={`flex-none px-6 py-2.5 rounded-full font-semibold text-[14px] transition-all active:scale-95 ${dietType === opt
            ? "bg-primary-container text-white"
            : "border border-[#6e7a74] text-[#1b1c1c] bg-white hover:bg-[#fcf9f8]"}`}>
            {opt}
          </button>))}
        </div>
      </section>

      {/* Allergies multi-select mapping screens layout */}
      <section className="mt-8">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#6e7a74] mb-4">Allergies</h2>
        <div className="flex flex-wrap gap-2">
          {allergyList.map((alg) => {
            const isSelected = allergies.includes(alg);
            return (<button key={alg} onClick={() => toggleAllergy(alg)} className={`px-4 py-2 rounded-full border text-[13px] font-bold transition-all active:scale-95 ${isSelected
              ? "border-brand-red bg-brand-red text-white"
              : "border-brand-red bg-white text-brand-red hover:bg-[#ffdad6]"}`}>
              {alg}
            </button>);
          })}
        </div>
      </section>

      {/* budget slide card details */}
      <section className="mt-8 bg-white p-5 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#6e7a74]">Weekly budget</h2>
          <div className="bg-[#82d6bb]/30 px-3 py-1 rounded-lg text-[#002018] font-bold text-[14px]">
            <span>{budget}</span> PLN
          </div>
        </div>
        <input className="w-full h-1.5 bg-[#e4e2e1] rounded-lg appearance-none cursor-pointer accent-primary-container" type="range" min="100" max="1000" step="50" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        <div className="flex justify-between mt-2 text-[12px] text-[#6e7a74]">
          <span>100 PLN</span>
          <span>1000 PLN</span>
        </div>
      </section>

      {/* visual context display card */}
      <section className="mt-8 relative rounded-2xl overflow-hidden aspect-[16/9] shadow-sm bg-gradient-to-tr from-primary/30 to-primary/10">
        <div className="absolute inset-0 flex items-center justify-center">
          <UtensilsCrossed className="text-[80px] text-primary/30" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-5">
          <p className="text-white font-bold text-base">Personalized Nutrition</p>
          <p className="text-white/80 text-[12px] font-medium font-sans">We exclude ingredients you don't like.</p>
        </div>
      </section>
    </main>

    {/* footer sticky actions */}
    <footer className="fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-md p-5 border-t border-[#bec9c3]/30 z-[100] safe-bottom">
      <button onClick={handleContinue} className="w-full bg-primary-container text-white py-4 rounded-xl font-bold text-center shadow-lg active:scale-95 transition-all">
        Continue
      </button>
    </footer>
  </div>);
}
export function LocationScreen({ onBack, onAllowLocation, onChooseManually }) {
  const [detecting, setDetecting] = useState(false);
  const handleLocation = () => {
    setDetecting(true);
    setTimeout(() => {
      onAllowLocation();
    }, 1500);
  };
  return (<div className="relative w-full h-screen flex flex-col overflow-hidden bg-gradient-to-b from-[#1f7a63] via-[#00604c] to-[#fcf9f8]">
    {/* status bar emulator */}


    {/* Top radar area */}
    <div className="flex-1 relative flex items-center justify-center overflow-hidden">
      {/* Animated rings */}
      <div className="absolute w-48 h-48 border-2 border-emerald-300 opacity-60 rounded-full animate-ping [animation-duration:3s]"></div>
      <div className="absolute w-64 h-64 border-2 border-emerald-400 opacity-40 rounded-full animate-ping [animation-duration:4s]"></div>
      <div className="absolute w-80 h-80 border-2 border-emerald-500 opacity-25 rounded-full animate-ping [animation-duration:5s]"></div>

      {/* background map hint vector trace */}
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-32 h-1 bg-[#9ef3d7] blur-sm"></div>
        <div className="absolute top-1/2 left-1/3 w-1 h-32 bg-[#9ef3d7] blur-sm"></div>
        <div className="absolute bottom-1/4 right-1/4 w-40 h-1 bg-[#9ef3d7] blur-sm"></div>
      </div>

      {/* Big target mark */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105 duration-300">
          <MapPin className="text-primary text-[32px] font-fill-1 font-bold" style={{ fontVariationSettings: "'FILL' 1" }} />
        </div>
      </div>
    </div>

    {/* White Bottom Sheet Modal Layout */}
    <div className="bg-white rounded-t-[32px] px-6 pt-6 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-500 z-20">
      {/* Handle */}
      <div className="flex justify-center mb-6">
        <div className="w-12 h-1.5 bg-[#bec9c3] rounded-full opacity-40"></div>
      </div>

      {/* Modal content */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-1">
          <Navigation className="text-primary-container text-[24px]" />
        </div>

        <div className="space-y-2">
          <h1 className="text-[22px] font-extrabold text-[#1b1c1c] tracking-tight">Allow Location Access</h1>
          <p className="text-[14px] text-[#3e4945] font-medium leading-relaxed max-w-[280px] mx-auto">
            We'll show meal makers near you so you can enjoy fresh, local food delivered today.
          </p>
        </div>

        {/* Detected location label badge */}
        <div className="inline-flex items-center gap-2 bg-[#9ef3d7] px-4 py-2 rounded-full border border-primary/10 shadow-sm animate-pulse-subtle">
          <MapPin className="text-[18px] text-[#002018]" style={{ fontVariationSettings: "'FILL' 1" }} />
          <span className="text-[13px] font-bold text-[#002018]">Mokotów, Warsaw detected</span>
        </div>

        {/* Actions */}
        <div className="w-full pt-4 space-y-3">
          <button onClick={handleLocation} disabled={detecting} className="w-full bg-primary-container hover:bg-[#155a49] text-white py-4 rounded-full font-bold shadow-md active:scale-95 transition-all text-base flex items-center justify-center gap-2">
            {detecting ? (<>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Detecting...</span>
            </>) : ("Use my location")}
          </button>
          <button onClick={onChooseManually} className="w-full text-primary font-bold text-[14px] py-2 hover:opacity-80 transition-opacity">
            Choose manually
          </button>
        </div>
      </div>
    </div>
  </div>);
}

export function ManualLocationScreen({ onBack, onConfirm }) {
  const [address, setAddress] = useState("");

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F0] text-[#1b1c1c]">
      <header className="flex justify-between items-center w-full px-[20px] h-14 mt-1">
        <button onClick={onBack} className="p-2 -ml-2 active:scale-95 transition-all text-[#1b1c1c]">
          <ArrowLeft className="text-[24px]" />
        </button>
        <div className="flex-1 px-4"></div>
        <div className="w-10"></div>
      </header>

      <main className="px-[20px] flex-1">
        <h1 className="text-[24px] font-extrabold mt-6 text-[#1b1c1c]">Enter your address</h1>
        <p className="text-on-surface-variant text-[14px] mt-2 text-[#3e4945]">
          We need your address to find the best meal makers near you.
        </p>

        <div className="mt-8 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6e7a74]" />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Search your street or building..."
            className="w-full bg-white h-14 rounded-2xl pl-12 pr-4 text-[15px] shadow-sm border border-[#bec9c3]/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
      </main>

      <footer className="mt-auto bg-white/80 backdrop-blur-md p-5 border-t border-[#bec9c3]/30 z-[100] safe-bottom">
        <button
          onClick={() => onConfirm(address)}
          disabled={!address.trim()}
          className="w-full bg-primary-container disabled:opacity-50 disabled:active:scale-100 text-white py-4 rounded-xl font-bold text-center shadow-lg active:scale-95 transition-all"
        >
          Confirm Location
        </button>
      </footer>
    </div>
  );
}
