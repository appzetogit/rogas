import { useState } from "react";
import { IMAGES, STANDARD_PLANS, AI_REC_PLANS } from "../types";
export function PlansScreen({ onGoBack, onSelectPlan, onGoToProfile }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [aiMode, setAiMode] = useState(true); // is viewing "AI Picks" view
  const [activeFilters, setActiveFilters] = useState([]);
  // Filter dropdown visibility
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterOptions = {
    Goal: ["Eat Healthy", "Save Time", "Family Meals", "Fitness & Macros"],
    Diet: ["Keto", "Vegan", "Vegetarian", "No preference"],
    Price: ["Under 80 PLN/wk", "80-90 PLN/wk", "Over 90 PLN/wk"],
    Zone: ["Mokotów", "Warsaw City", "Praga", "Ursynów"]
  };
  const toggleFilter = (filterKey, value) => {
    setActiveFilters([value]); // single filter for simplicity
    setOpenDropdown(null);
  };
  const handleDropdown = (id) => {
    setOpenDropdown(openDropdown === id ? null : id);
  };
  const activePlans = aiMode ? AI_REC_PLANS : STANDARD_PLANS;
  const filteredPlans = activePlans.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.chefName.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeFilters.length === 0)
      return matchesSearch;
    // Simple filter conditions
    const filter = activeFilters[0];
    if (filter === "Keto" || filter === "Vegan" || filter === "Vegetarian") {
      return matchesSearch && p.name.includes(filter);
    }
    if (filter === "Mokotów") {
      return matchesSearch && p.location === "Mokotów";
    }
    if (filter === "Under 80 PLN/wk") {
      return matchesSearch && p.price < 80;
    }
    return matchesSearch;
  });
  return (<div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
    {/* Top Header */}
    <header className="fixed top-0 left-0 w-full z-40 bg-white shadow-sm flex justify-between items-center px-5 h-14">
      <div className="flex items-center gap-3">
        <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
          arrow_back
        </button>
        <h1 className="text-xl font-extrabold text-primary">Plans</h1>
      </div>

      {/* Toggle standard view vs AI Match view */}
      <div className="flex items-center gap-3">
        <button onClick={() => setAiMode(!aiMode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${aiMode
          ? "bg-primary-container text-white"
          : "border border-primary text-primary hover:bg-primary/5"}`}>
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          <span>{aiMode ? "AI Model View" : "Discover AI Picks"}</span>
        </button>
        <button onClick={onGoToProfile} className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]/50">
          <img alt="Anna face headshot" className="w-full h-full object-cover" src={IMAGES.profileAnnaSecondary} />
        </button>
      </div>
    </header>

    <main className="pt-20 px-5">
      {/* Search & filters row */}
      <section className="space-y-4">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#bec9c3]">
            search
          </span>
          <input type="text" placeholder="Search plans by title or chefs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-12 pl-10 pr-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm" />
          {searchQuery && (<button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold text-sm">
            Clear
          </button>)}
        </div>

        {/* Filters horizontal scroller with interactive dropdown selectors */}
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            {Object.keys(filterOptions).map((filterKey) => (<div key={filterKey} className="relative flex-none">
              <button onClick={() => handleDropdown(filterKey)} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-primary-container text-primary-container text-xs font-bold whitespace-nowrap active:bg-primary active:text-white transition-all bg-white">
                <span>{filterKey}</span>
                <span className="material-symbols-outlined text-base">keyboard_arrow_down</span>
              </button>

              {/* Dropdown Options Box */}
              {openDropdown === filterKey && (<div className="absolute left-0 mt-2 bg-white border border-[#bec9c3]/50 shadow-2xl rounded-xl p-2 w-48 z-50">
                <p className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider p-1 border-b border-[#f0eded]">
                  Select {filterKey}
                </p>
                <div className="space-y-1 mt-1">
                  {filterOptions[filterKey].map((opt) => (<button key={opt} onClick={() => toggleFilter(filterKey, opt)} className="w-full text-left font-semibold text-xs p-2 hover:bg-primary/5 rounded-md text-[#1b1c1c] transition-colors">
                    {opt}
                  </button>))}
                </div>
              </div>)}
            </div>))}
          </div>

          {activeFilters.length > 0 && (<div className="flex items-center gap-1.5 mt-2 bg-[#E8F3F0] p-2 rounded-lg text-primary text-xs font-bold w-fit">
            <span>Active Filter: {activeFilters[0]}</span>
            <button type="button" onClick={() => setActiveFilters([])} className="material-symbols-outlined text-sm cursor-pointer">
              close
            </button>
          </div>)}
        </div>
      </section>

      {/* AI Recommendations Header component if in AI Mode */}
      {aiMode && (<section className="mt-6">
        <div className="bg-primary p-5 rounded-2xl shadow-md relative overflow-hidden text-white">
          {/* Abstract decorative graphic */}
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-[#b1ffe4]/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <p className="text-[18px] font-extrabold">AI Picks for You</p>
            </div>
            <p className="text-sm opacity-90 leading-snug">Based on your fitness goal + history</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="bg-[#b1ffe4]/20 text-[11px] font-extrabold px-3 py-1 rounded-full border border-white/10 uppercase tracking-wide">
                High protein
              </span>
              <span className="bg-[#b1ffe4]/20 text-[11px] font-extrabold px-3 py-1 rounded-full border border-white/10 uppercase tracking-wide">
                Gluten-free
              </span>
              <span className="bg-[#b1ffe4]/20 text-[11px] font-extrabold px-3 py-1 rounded-full border border-white/10 uppercase tracking-wide">
                Under 500 kcal
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 mb-4">
          <h2 className="text-[12px] font-bold text-[#6e7a74] uppercase tracking-widest">
            Recommended for You
          </h2>
        </div>
      </section>)}

      {/* Plans view grid */}
      <section className="mt-6 space-y-4">
        {filteredPlans.length > 0 ? (filteredPlans.map((plan) => (<article key={plan.id} className="bg-white rounded-2xl overflow-hidden shadow-md flex flex-col border border-transparent hover:border-[#bec9c3]/50 transition-all duration-300">
          {/* Image layout dependent on whether AI picks list with high visuals */}
          {aiMode ? (<div className="relative h-48 w-full bg-surface-container">
            <img alt={plan.name} className="w-full h-full object-cover" src={plan.image} />
            <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-15">
              {plan.isBestMatch && (<span className="bg-primary text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shadow">
                BEST MATCH
              </span>)}
              <span className="bg-white/95 backdrop-blur-sm text-primary text-[10px] font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider shadow">
                {plan.matchPct}% match
              </span>
            </div>
          </div>) : null}

          <div className="p-5 flex flex-col gap-4">
            <div className="flex gap-4">
              {/* Non-AI Mode has standard square thumbnail */}
              {!aiMode && (<div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 shadow bg-surface-container-low">
                <img alt={plan.name} className="w-full h-full object-cover" src={plan.image} />
              </div>)}

              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-extrabold text-on-surface leading-snug">
                    {plan.name}
                  </h3>
                  <div className="flex items-center gap-0.5 text-secondary">
                    <span className="material-symbols-outlined text-[16px] font-fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                      star
                    </span>
                    <span className="text-[13px] font-bold">{plan.rating}</span>
                  </div>
                </div>
                <p className="text-[13px] text-on-surface-variant font-medium">
                  {plan.chefName} · {plan.location}
                </p>

                {plan.tags && (<div className="flex gap-1 pt-1.5">
                  {plan.tags.map((tag) => (<span key={tag} className="bg-primary/5 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                    {tag}
                  </span>))}
                </div>)}

                {!aiMode && (<div className="pt-2">
                  <span className="text-base font-bold text-on-surface">
                    {plan.price} PLN
                    <span className="text-[12px] font-normal text-on-surface-variant">/wk</span>
                  </span>
                </div>)}
              </div>
            </div>

            {/* Pricing line & view buttons */}
            {aiMode ? (<div className="flex justify-between items-center border-t border-[#f0eded] pt-4">
              <div>
                <span className="text-base font-extrabold text-primary">{plan.price} PLN</span>
                <span className="text-[12px] text-on-surface-variant">/wk</span>
              </div>
              <button onClick={() => onSelectPlan(plan)} className="bg-primary-container text-white hover:bg-[#155a49] px-6 py-2.5 rounded-xl text-[13px] font-bold active:scale-[0.97] transition-transform shadow-sm">
                View Plan
              </button>
            </div>) : (<button onClick={() => onSelectPlan(plan)} className="w-full bg-primary-container text-white hover:bg-[#155a49] py-3 rounded-xl text-[13px] font-bold text-center active:scale-[0.98] transition-transform shadow-sm">
              View Plan
            </button>)}
          </div>
        </article>))) : (<div className="text-center py-12 space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#bec9c3]">search_off</span>
          <p className="font-bold text-on-surface-variant">No matching plans found</p>
          <button onClick={() => {
            setSearchQuery("");
            setActiveFilters([]);
          }} className="text-primary font-bold text-xs underline">
            Reset filters
          </button>
        </div>)}
      </section>

      {/* spacer spacing */}
      <div className="h-16"></div>
    </main>
  </div>);
}
