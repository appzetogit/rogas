import React, { useState, useEffect, useRef } from "react";
import { SUPPORTED_COUNTRIES } from "@/config/countries";
import { useTranslation } from "react-i18next";

export default function CountrySelector({ selectedCountry, onSelect, className = "", buttonClassName = "" }) {
  const { t } = useTranslation("common");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const modalRef = useRef(null);

  // Filter countries by name or code
  const filteredCountries = SUPPORTED_COUNTRIES.filter((country) => {
    const term = search.toLowerCase();
    return (
      country.name.toLowerCase().includes(term) ||
      country.code.includes(term)
    );
  });

  // Handle click outside to close (if modal is open)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Reset search on close
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      {/* Selector Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={buttonClassName || "flex items-center justify-between gap-2 px-3 h-11 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 rounded-md shadow-sm hover:border-gray-400 dark:hover:border-gray-600 transition-colors shrink-0 cursor-pointer min-w-[90px]"}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="text-base">{selectedCountry?.flag}</span>
          <span>{selectedCountry?.code}</span>
        </span>
        <svg
          className="w-4 h-4 text-gray-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Searchable Dialog Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div
            ref={modalRef}
            className="bg-white rounded-2xl w-full max-w-sm max-h-[75vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100 transform transition-all animate-in zoom-in-95 duration-100"
          >
            {/* Search Header */}
            <div className="p-3 border-b border-gray-100 flex items-center gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder={t("Search country...")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm text-gray-800 focus:border-primary focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Country List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filteredCountries.length > 0 ? (
                filteredCountries.map((country) => (
                  <button
                    key={country.name}
                    type="button"
                    onClick={() => {
                      onSelect(country);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors cursor-pointer ${
                      selectedCountry?.name === country.name
                        ? "bg-gray-100 font-semibold text-primary"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xl leading-none">{country.flag}</span>
                    <span className="flex-1 truncate">{country.name}</span>
                    <span className="text-gray-400 font-semibold text-xs shrink-0">
                      {country.code}
                    </span>
                  </button>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-gray-400">
                  {t("No countries found")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
