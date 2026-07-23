import React, { useState, useEffect } from 'react';
import { adminClient as adminAPI } from '@food/api/axios';
import Loader from '@food/components/Loader';
import { ArrowLeft, Building, Inbox, MoreVertical, Eye, CheckCircle, XCircle } from 'lucide-react';

export default function ApprovedOffices() {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get('/food/admin/office-companies?status=approved,deactivated');
      setRequests(res.data?.data || []);
    } catch (err) {
      console.error(err);
      alert('Failed to load approved offices');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      const isDeactivating = currentStatus === 'approved';
      const action = isDeactivating ? 'deactivate' : 'activate';
      await adminAPI.patch(`/food/admin/office-companies/${id}/${action}`);
      fetchRequests(); // Refresh list
    } catch (err) {
      console.error(err);
      alert('Failed to change status');
    }
  };



  if (isLoading) return <Loader />;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-start gap-3">
          {selectedRequest && (
            <button 
              onClick={() => setSelectedRequest(null)}
              className="mt-1 p-1 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
              title="Back to list"
            >
              <ArrowLeft className="text-xl" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {!selectedRequest && <Building className="text-primary text-[28px]" />}
              Approved Offices
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {selectedRequest ? `Viewing details for ${selectedRequest.legalName}` : 'View details of approved office and corporate accounts.'}
            </p>
          </div>
        </div>
      </div>

      {!selectedRequest ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 pb-16">
          {requests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Inbox className="text-4xl mb-2 text-gray-300" />
              <p>No pending requests.</p>
            </div>
          ) : (
            <div className="w-full">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Company Name</th>
                    <th className="px-6 py-4 font-medium">Contact Person</th>
                    <th className="px-6 py-4 font-medium">Email</th>
                    <th className="px-6 py-4 font-medium">Date Applied</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((req) => (
                    <tr key={req._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{req.legalName}</td>
                      <td className="px-6 py-4 text-gray-600">{req.contactName}</td>
                      <td className="px-6 py-4 text-gray-600">{req.contactEmail}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {req.status === 'approved' ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdown(activeDropdown === req._id ? null : req._id);
                          }}
                          className="p-1 hover:bg-gray-100 rounded-full transition-colors inline-flex items-center justify-center text-gray-500"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>

                        {activeDropdown === req._id && (
                          <div className="absolute right-10 top-10 w-40 bg-white border border-gray-100 shadow-xl rounded-xl z-50 py-1 text-left">
                            <button
                              onClick={() => {
                                setSelectedRequest(req);
                                setActiveDropdown(null);
                              }}
                              className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4 text-gray-400" />
                              View
                            </button>
                            <button
                              onClick={() => {
                                handleToggleStatus(req._id, req.status);
                                setActiveDropdown(null);
                              }}
                              className={`w-full px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${
                                req.status === 'approved' ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              {req.status === 'approved' ? (
                                <>
                                  <XCircle className="w-4 h-4" /> Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-4 h-4" /> Activate
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Office Details</h2>
            <button
              onClick={() => setSelectedRequest(null)}
              className="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
            >
              <ArrowLeft className="text-sm" />
              Back to list
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Company Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Legal Name:</span> <span className="font-medium">{selectedRequest.legalName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">NIP:</span> <span className="font-medium">{selectedRequest.nip}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">REGON:</span> <span className="font-medium">{selectedRequest.regon}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Address:</span> <span className="font-medium">{selectedRequest.registeredAddress}</span></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Contact Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Name:</span> <span className="font-medium">{selectedRequest.contactName} ({selectedRequest.contactRole})</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Email:</span> <span className="font-medium">{selectedRequest.contactEmail}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Phone:</span> <span className="font-medium">{selectedRequest.contactPhone}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Bank Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Bank Name:</span> <span className="font-medium">{selectedRequest.bankName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Account Name:</span> <span className="font-medium">{selectedRequest.accountName}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">IBAN:</span> <span className="font-medium">{selectedRequest.iban}</span></div>
                </div>
              </div>
              
              <div>
                 <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider border-b pb-2 mb-4">Uploaded Documents</h3>
                 <div className="space-y-3">
                   {selectedRequest.onboardingData?.documents && Object.keys(selectedRequest.onboardingData.documents).length > 0 ? (
                     Object.entries(selectedRequest.onboardingData.documents).map(([key, doc]) => (
                       <div key={key} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg">
                         <div className="flex items-center gap-3 overflow-hidden">
                           <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                             <span className="material-symbols-outlined text-sm">
                               {doc.name?.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'image'}
                             </span>
                           </div>
                           <div className="truncate">
                             <p className="text-sm font-medium text-gray-900 truncate">{doc.name || key}</p>
                             <p className="text-xs text-gray-500">{doc.size || 'Unknown size'}</p>
                           </div>
                         </div>
                         <a 
                           href={doc.url} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="ml-3 px-3 py-1.5 bg-white border border-gray-200 text-primary text-xs font-medium rounded hover:bg-gray-50 transition-colors shrink-0"
                         >
                           View
                         </a>
                       </div>
                     ))
                   ) : (
                     <p className="text-sm text-gray-500 italic">No documents uploaded.</p>
                   )}
                 </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
