import React, { useState, useEffect } from 'react';
import { dmbCustomerAPI } from "@food/api";
import { Loader2, Eye, X, PlusCircle, MinusCircle, RefreshCw, RefreshCcw } from 'lucide-react';

export default function CustomerWalletScreen() {
    const [wallets, setWallets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedWallet, setSelectedWallet] = useState(null);

    useEffect(() => {
        fetchWallets();
    }, []);

    const fetchWallets = async () => {
        try {
            setLoading(true);
            const res = await dmbCustomerAPI.getAllCustomerWallets();
            if (res.data?.success) {
                setWallets(res.data.data.wallets);
            }
        } catch (error) {
            console.error("Error fetching wallets", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredWallets = wallets.filter(wallet => {
        const name = wallet.userId?.name || "";
        const email = wallet.userId?.email || "";
        const phone = wallet.userId?.phone || "";
        return name.toLowerCase().includes(searchTerm.toLowerCase()) || 
               email.toLowerCase().includes(searchTerm.toLowerCase()) ||
               phone.includes(searchTerm);
    });

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Customer Wallets</h1>
                <button 
                    onClick={fetchWallets} 
                    className="flex items-center gap-2 px-4 py-2 bg-white border rounded-md shadow-sm hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                    disabled={loading}
                >
                    <RefreshCcw className={`${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>
            
            <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                <input 
                    type="text" 
                    placeholder="Search by name, email or phone..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full max-w-md px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#1f7a63]"
                />
            </div>

            {loading ? (
                <div className="flex justify-center p-10">
                    <Loader2 className="animate-spin text-4xl text-[#1f7a63]" />
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b">
                                    <th className="p-4 font-semibold text-gray-700">Customer</th>
                                    <th className="p-4 font-semibold text-gray-700">Balance</th>
                                    <th className="p-4 font-semibold text-gray-700">Total Transactions</th>
                                    <th className="p-4 font-semibold text-gray-700">Last Updated</th>
                                    <th className="p-4 font-semibold text-gray-700 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredWallets.length > 0 ? (
                                    filteredWallets.map((wallet) => (
                                        <tr key={wallet._id} className="border-b hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-[#1f7a63]/10 flex items-center justify-center text-[#1f7a63] font-bold overflow-hidden shrink-0">
                                                        {wallet.userId?.profileImage ? (
                                                            <img src={wallet.userId.profileImage} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span>{(wallet.userId?.name || "U").charAt(0).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-800">{wallet.userId?.name || "Unknown"}</p>
                                                        <p className="text-sm text-gray-500">{wallet.userId?.email}</p>
                                                        <p className="text-sm text-gray-500">{wallet.userId?.phone}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="font-bold text-[#1f7a63] text-lg">PLN {wallet.balance.toFixed(2)}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium">
                                                    {wallet.transactions?.length || 0}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-600">
                                                {new Date(wallet.updatedAt).toLocaleString()}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button 
                                                    onClick={() => setSelectedWallet(wallet)}
                                                    className="px-3 py-2 bg-[#1f7a63]/10 text-[#1f7a63] font-medium rounded-md hover:bg-[#1f7a63] hover:text-white transition-colors inline-flex items-center justify-center"
                                                    title="View Details"
                                                >
                                                    <Eye className="text-[20px]" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-gray-500">
                                            No wallets found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedWallet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Wallet Details</h2>
                                <p className="text-sm text-gray-500 mt-1">Customer: {selectedWallet.userId?.name || "Unknown"}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedWallet(null)}
                                className="text-gray-400 hover:text-gray-700 bg-gray-100 rounded-full p-2"
                            >
                                <X className="block" />
                            </button>
                        </div>
                        
                        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Current Balance</p>
                                <p className="text-3xl font-bold text-[#1f7a63] mt-1">PLN {selectedWallet.balance.toFixed(2)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500 font-medium">Total Transactions</p>
                                <p className="text-xl font-bold text-gray-800 mt-1">{selectedWallet.transactions?.length || 0}</p>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <h3 className="font-semibold text-gray-800 mb-4">Transaction History</h3>
                            {selectedWallet.transactions && selectedWallet.transactions.length > 0 ? (
                                <div className="space-y-4">
                                    {selectedWallet.transactions.map((tx, idx) => (
                                        <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    {tx.type === 'addition' ? (
                                                        <PlusCircle className="text-green-600 bg-green-50 p-1 rounded" />
                                                    ) : tx.type === 'deduction' ? (
                                                        <MinusCircle className="text-red-600 bg-red-50 p-1 rounded" />
                                                    ) : (
                                                        <RefreshCw className="text-blue-600 bg-blue-50 p-1 rounded" />
                                                    )}
                                                    <span className="font-semibold capitalize text-gray-800">{tx.type}</span>
                                                </div>
                                                <span className={`font-bold text-lg ${tx.type === 'addition' ? 'text-green-600' : tx.type === 'deduction' ? 'text-red-600' : 'text-blue-600'}`}>
                                                    {tx.type === 'addition' ? '+' : '-'} PLN {tx.amount.toFixed(2)}
                                                </span>
                                            </div>
                                            
                                            <p className="text-gray-600 text-sm mb-3">{tx.description}</p>
                                            
                                            <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 grid grid-cols-2 gap-2">
                                                <div>
                                                    <span className="font-medium">Status:</span> 
                                                    <span className={`ml-1 px-2 py-0.5 rounded-full ${tx.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {tx.status}
                                                    </span>
                                                </div>
                                                <div><span className="font-medium">Date:</span> {new Date(tx.createdAt || tx.date).toLocaleString()}</div>
                                                
                                                {tx.razorpayOrderId && (
                                                    <div className="col-span-2 mt-2 pt-2 border-t border-gray-200">
                                                        <div className="grid grid-cols-1 gap-1">
                                                            <div><span className="font-medium">Razorpay Order ID:</span> <span className="font-mono">{tx.razorpayOrderId}</span></div>
                                                            {tx.razorpayPaymentId && <div><span className="font-medium">Payment ID:</span> <span className="font-mono">{tx.razorpayPaymentId}</span></div>}
                                                            {tx.metadata?.mode && <div><span className="font-medium">Mode:</span> {tx.metadata.mode}</div>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-8">No transactions found for this wallet.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
