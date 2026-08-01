import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Check, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const ShiftChangeRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('admin_accessToken');
            const res = await axios.get('/api/v1/food/admin/delivery/shift-requests', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setRequests(res.data.data.requests);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch shift requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleAction = async (id, action) => {
        try {
            const token = localStorage.getItem('admin_accessToken');
            const endpoint = `/api/v1/food/admin/delivery/shift-requests/${id}/${action}`;
            const res = await axios.post(endpoint, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                toast.success(`Request ${action}d successfully`);
                fetchRequests();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to ${action} request`);
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'approved': return 'bg-[#1F7A63]/10 text-[#1F7A63] border-[#1F7A63]/20';
            case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const pendingRequests = requests.filter(req => req.status === 'pending');
    const resolvedRequests = requests.filter(req => req.status !== 'pending');
    const displayRequests = activeTab === 'pending' ? pendingRequests : resolvedRequests;

    return (
        <div className="p-4 lg:p-6 bg-[#F5F5F0] min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                        <h1 className="text-2xl font-bold text-[#1F7A63]">Delivery Shift Requests</h1>
                        <button
                            onClick={fetchRequests}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-[#1F7A63] text-white text-sm font-medium rounded-lg hover:bg-[#145c4a] transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-6 border-b border-slate-200 mb-6">
                        <button
                            onClick={() => setActiveTab("pending")}
                            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === "pending"
                                    ? "border-[#1F7A63] text-[#1F7A63]"
                                    : "border-transparent text-[#2B2B2B] hover:text-[#1F7A63]"
                            }`}
                        >
                            PENDING REQUESTS ({pendingRequests.length})
                        </button>
                        <button
                            onClick={() => setActiveTab("resolved")}
                            className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === "resolved"
                                    ? "border-[#1F7A63] text-[#1F7A63]"
                                    : "border-transparent text-[#2B2B2B] hover:text-[#1F7A63]"
                            }`}
                        >
                            RESOLVED REQUESTS ({resolvedRequests.length})
                        </button>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="flex justify-center items-center py-20">
                                <div className="w-8 h-8 border-4 border-[#1F7A63]/20 border-t-[#1F7A63] rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-[#F5F5F0] border-b border-slate-200">
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">Partner Name</th>
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">Phone</th>
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">Current Shifts</th>
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">Requested Shifts</th>
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">Status</th>
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">Date</th>
                                        <th className="px-4 py-3 text-sm font-bold text-[#2B2B2B] text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displayRequests.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-medium">
                                                No {activeTab} requests found
                                            </td>
                                        </tr>
                                    ) : (
                                        displayRequests.map((req) => (
                                            <tr key={req._id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-sm text-[#2B2B2B]">{req.partnerId?.name || 'Unknown'}</td>
                                                <td className="px-4 py-3 text-sm text-[#2B2B2B]">{req.partnerId?.phone || 'N/A'}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {req.currentShifts?.map(s => (
                                                            <span key={s} className="px-2.5 py-1 text-xs font-medium border border-slate-300 text-slate-600 rounded-full bg-white">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {req.requestedShifts?.map(s => (
                                                            <span key={s} className="px-2.5 py-1 text-xs font-medium bg-[#1F7A63] text-white rounded-full">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 text-xs font-bold border rounded-full capitalize ${getStatusStyle(req.status)}`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-[#2B2B2B]">
                                                    {new Date(req.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {req.status === 'pending' ? (
                                                        <div className="flex justify-end gap-2">
                                                            <button 
                                                                onClick={() => handleAction(req._id, 'approve')}
                                                                className="p-1.5 bg-[#e5f3ef] text-[#1F7A63] rounded hover:bg-[#ccede1] transition-colors"
                                                                title="Approve"
                                                            >
                                                                <Check size={18} />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleAction(req._id, 'reject')}
                                                                className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                                                                title="Reject"
                                                            >
                                                                <X size={18} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm font-bold text-[#1F7A63]">Resolved</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ShiftChangeRequests;
