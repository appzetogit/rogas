import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './CustomerApp.css';
import CustomerAppMain from './CustomerAppMain';

const CustomerRoutes = () => {
  return (
    <Routes>
      <Route path="*" element={<CustomerAppMain />} />
    </Routes>
  );
};

export default CustomerRoutes;
