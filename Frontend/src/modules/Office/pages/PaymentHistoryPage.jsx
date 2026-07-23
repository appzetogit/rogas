import React, { useState, useEffect } from 'react';
import { getPaymentsApi } from '../services/officeApi';
import { Search, Receipt, CheckCircle2, Clock, XCircle, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await getPaymentsApi();
      setPayments(res.data.data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  // Filter payments
  const filteredPayments = payments.filter((payment) => {
    const orderId = payment.razorpayOrderId?.toLowerCase() || '';
    const vendorName = payment.vendorId?.restaurantName?.toLowerCase() || '';
    const planName = payment.subscriptionPlanId?.name?.toLowerCase() || '';

    const matchesSearch = 
      orderId.includes(searchQuery.toLowerCase()) ||
      vendorName.includes(searchQuery.toLowerCase()) ||
      planName.includes(searchQuery.toLowerCase());
      
    let matchesDate = true;
    if (startDate || endDate) {
      if (payment.createdAt) {
        const paymentDate = new Date(payment.createdAt).toISOString().split('T')[0];
        
        if (startDate && endDate) {
          matchesDate = paymentDate >= startDate && paymentDate <= endDate;
        } else if (startDate) {
          matchesDate = paymentDate >= startDate;
        } else if (endDate) {
          matchesDate = paymentDate <= endDate;
        }
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentPayments = filteredPayments.slice(startIndex, startIndex + itemsPerPage);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PAID
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-[11px] font-bold">
            <Clock className="w-3.5 h-3.5" />
            PENDING
          </span>
        );
      case 'failed':
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[11px] font-bold">
            <XCircle className="w-3.5 h-3.5" />
            {status.toUpperCase()}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 text-gray-700 text-[11px] font-bold">
            {status?.toUpperCase()}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-primary flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            Payment History
          </h1>
          <p className="text-sm text-brand-muted mt-1">
            Track and manage your meal subscription orders and payments.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-brand-divider shadow-sm">
        <div className="relative flex-1 min-w-[300px] w-full lg:max-w-3xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            placeholder="Search by Order ID, Vendor, or Plan..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-brand-bg border border-brand-divider rounded-lg text-sm focus:outline-none focus:border-brand-primary transition-colors"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-muted font-medium">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-3 py-1.5 bg-brand-bg border border-brand-divider rounded-lg text-sm text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-muted font-medium">To:</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-3 py-1.5 bg-brand-bg border border-brand-divider rounded-lg text-sm text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>
          
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setCurrentPage(1);
              }}
              title="Clear Date Filter"
              className="p-1.5 text-brand-error-text bg-brand-error-bg hover:bg-brand-error-bg/80 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={fetchPayments}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-brand-divider text-brand-primary rounded-lg text-sm font-semibold hover:bg-brand-primary/5 transition-colors whitespace-nowrap cursor-pointer ml-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-brand-divider rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-brand-bg border-b border-brand-divider text-xs uppercase tracking-wider text-brand-muted">
                <th className="px-6 py-4 font-semibold">Date & Order ID</th>
                <th className="px-6 py-4 font-semibold">Vendor & Plan</th>
                <th className="px-6 py-4 font-semibold">Employees</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-divider">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-brand-muted">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-primary/40 mb-3" />
                    Loading payment history...
                  </td>
                </tr>
              ) : currentPayments.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-bg text-brand-muted mb-3">
                      <Receipt className="w-6 h-6" />
                    </div>
                    <p className="text-brand-primary font-semibold">No payments found</p>
                    <p className="text-sm text-brand-muted mt-1">
                      {searchQuery ? "Try adjusting your search criteria." : "You haven't made any payments yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                currentPayments.map((payment) => (
                  <tr key={payment._id} className="hover:bg-brand-bg/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-brand-primary">
                        {new Date(payment.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </div>
                      <div className="text-xs text-brand-muted font-mono mt-0.5">
                        {payment.razorpayOrderId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-brand-primary flex items-center gap-2">
                        {payment.vendorId?.profileImage && (
                          <img src={payment.vendorId.profileImage} alt="" className="w-5 h-5 rounded-full object-cover" />
                        )}
                        {payment.vendorId?.restaurantName || 'Unknown Vendor'}
                      </div>
                      <div className="text-xs text-brand-muted mt-0.5 flex items-center">
                        {payment.subscriptionPlanId?.name || 'Custom Plan'}
                        {payment.isMock && (
                          <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">MOCK</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-brand-primary">
                        {payment.employeeIds?.length || 0} Employees
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-extrabold text-brand-primary">
                        {payment.amount?.toFixed(2) || '0.00'} {payment.currency || 'INR'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(payment.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && filteredPayments.length > 0 && (
          <div className="px-6 py-4 border-t border-brand-divider bg-brand-bg flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-brand-muted">
              Showing <span className="font-semibold text-brand-primary">{startIndex + 1}</span> to{' '}
              <span className="font-semibold text-brand-primary">
                {Math.min(startIndex + itemsPerPage, filteredPayments.length)}
              </span>{' '}
              of <span className="font-semibold text-brand-primary">{filteredPayments.length}</span> payments
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-brand-divider bg-white text-brand-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-primary/5 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-xs font-semibold px-2">
                Page {currentPage} of {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-brand-divider bg-white text-brand-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-primary/5 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
