import { useState, useEffect } from "react";
import { ArrowLeft, Utensils, Loader2 } from 'lucide-react';

export function DietAndAllergensScreen({ onBack, initialPrefs, onSave }) {
    const [selectedDiet, setSelectedDiet] = useState(initialPrefs?.dietType || 'No preference');
    const [selectedAllergies, setSelectedAllergies] = useState(initialPrefs?.allergies || []);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialPrefs) {
            setSelectedDiet(initialPrefs.dietType || 'No preference');
            setSelectedAllergies(initialPrefs.allergies || []);
        }
    }, [initialPrefs]);

    const handleSaveClick = async () => {
        setIsSaving(true);
        await onSave({
            ...initialPrefs,
            dietType: selectedDiet,
            allergies: selectedAllergies
        });
        setIsSaving(false);
    };

    const diets = [
        { id: 'Keto', label: 'Keto', desc: 'High fat, low carb', icon: 'bolt' },
        { id: 'Vegan', label: 'Vegan', desc: 'Plant-based only', icon: 'eco' },
        { id: 'Vegetarian', label: 'Vegetarian', desc: 'No meat or fish', icon: 'nutrition' },
        { id: 'Paleo', label: 'Paleo', desc: 'Whole foods only', icon: 'outdoor_grill' }
    ];

    const allAllergies = [
        'Gluten', 'Dairy', 'Eggs', 'Nuts', 'Peanuts',
        'Soy', 'Fish', 'Shellfish', 'Sesame',
        'Mustard', 'Celery', 'Lupin', 'Molluscs', 'Sulphites'
    ];

    const handleToggleAllergy = (allergy) => {
        setSelectedAllergies(prev =>
            prev.includes(allergy) ? prev.filter(a => a !== allergy) : [...prev, allergy]
        );
    };

    return (
        <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[100dvh] relative">
            <header className="fixed top-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-50 bg-white flex justify-between items-center px-4 h-14 shadow-sm border-b border-[#bec9c3]/20">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} aria-label="Go back" className="p-2 -ml-2 rounded-full hover:bg-slate-200 transition-colors">
                        <ArrowLeft className="text-primary" />
                    </button>
                    <h1 className="text-[20px] font-extrabold text-primary">Diet &amp; Allergens</h1>
                </div>
            </header>

            <main className="pt-20 pb-[100px] px-5">
                {/* Header Visual Accent */}
                <div className="mb-6 relative overflow-hidden rounded-xl h-24 bg-[#1f7a63] flex items-center px-4 shadow-sm">
                    <div className="z-10">
                        <h2 className="text-white text-[18px] font-bold leading-tight">Tailor Your Plate</h2>
                        <p className="text-white/80 text-[13px] mt-0.5 font-medium">We'll filter meals based on your needs.</p>
                    </div>
                    <div className="absolute right-[-20px] bottom-[-10px] opacity-20">
                        <Utensils className="text-[80px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                    </div>
                </div>

                {/* Current Diet Section */}
                <section className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[16px] font-bold text-[#1b1c1c]">Current Diet</h3>
                        <span className="text-[13px] text-primary font-bold">{selectedDiet && selectedDiet !== 'No preference' ? '1 Selected' : '0 Selected'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {diets.map(diet => {
                            const isActive = selectedDiet === diet.id;
                            return (
                                <div
                                    key={diet.id}
                                    onClick={() => setSelectedDiet(isActive ? 'No preference' : diet.id)}
                                    className={`bg-white p-4 rounded-xl shadow-sm transition-all cursor-pointer ${isActive ? 'border-2 border-primary ring-1 ring-primary/10 bg-[#f0fdf4]' : 'border border-[#bec9c3] hover:border-primary/40'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`material-symbols-outlined ${isActive ? 'text-primary' : 'text-[#6e7a74]'}`} style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                                            {diet.icon}
                                        </span>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-primary' : 'border-[#bec9c3]'}`}>
                                            {isActive && <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>}
                                        </div>
                                    </div>
                                    <p className="font-bold text-[14px] text-[#1b1c1c]">{diet.label}</p>
                                    <p className="text-[11px] text-[#6e7a74] leading-tight mt-0.5">{diet.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Allergies & Exclusions */}
                <section className="mb-6">
                    <h3 className="text-[12px] font-bold text-[#6e7a74] mb-3 uppercase tracking-wider">Allergies</h3>
                    <div className="flex flex-wrap gap-2.5">
                        {allAllergies.map((allergy) => {
                            const isChecked = selectedAllergies.includes(allergy);
                            return (
                                <button
                                    key={allergy}
                                    onClick={() => handleToggleAllergy(allergy)}
                                    className={`px-4 py-1.5 rounded-full border text-[14px] font-bold transition-all active:scale-95 ${isChecked
                                            ? 'border-[#e53e3e] text-[#e53e3e] bg-white shadow-sm'
                                            : 'border-[#bec9c3] text-[#6e7a74] bg-white hover:border-[#e53e3e]/50 hover:text-[#e53e3e]/70'
                                        }`}
                                >
                                    {allergy}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Save Button */}
                <div className="fixed bottom-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] px-5 pb-6 pt-6 bg-gradient-to-t from-[#F5F5F0] via-[#F5F5F0] to-transparent z-10">
                    <button
                        onClick={handleSaveClick}
                        disabled={isSaving}
                        className="w-full bg-[#1f7a63] hover:bg-[#155a49] text-white h-14 rounded-xl font-bold text-[16px] flex items-center justify-center shadow-lg active:scale-[0.98] transition-transform duration-150 disabled:opacity-70 disabled:active:scale-100"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="text-[20px] animate-spin mr-2" />
                                Saving...
                            </>
                        ) : 'Save Changes'}
                    </button>
                </div>
            </main>
        </div>
    );
}
