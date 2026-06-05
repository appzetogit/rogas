import React from 'react';
import { Routes, Route } from 'react-router-dom';
import VendorApp from './App';

export default function VendorRouter() {
  return (
    <Routes>
      <Route path="/*" element={<VendorApp />} />
    </Routes>
  );
}
