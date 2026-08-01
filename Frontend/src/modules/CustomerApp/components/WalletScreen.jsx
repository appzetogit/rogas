import React, { useState, useEffect } from 'react';
import { dmbCustomerAPI } from "@food/api";
import { ArrowLeft, PlusCircle, Loader2, Info } from 'lucide-react';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function WalletScreen({ onBack, currentUser }) {
    const [walletData, setWalletData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showTopupModal, setShowTopupModal] = useState(false);
    const [topupAmount, setTopupAmount] = useState('');
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchWallet();
    }, []);

    const fetchWallet = async () => {
        try {
            setLoading(true);
            const res = await dmbCustomerAPI.getWallet();
            if (res.data?.success) {
                setWalletData(res.data.data.wallet);
            }
        } catch (error) {
            console.error("Error fetching wallet", error);
        } finally {
            setLoading(false);
        }
    };

    const handleTopup = async () => {
        const amount = parseFloat(topupAmount);
        if (isNaN(amount) || amount <= 0) return;

        try {
            setProcessing(true);
            const loaded = await loadRazorpayScript();
            if (!loaded) {
                console.error("Razorpay SDK failed to load");
                return;
            }

            // 1. Create order
            const orderRes = await dmbCustomerAPI.createWalletTopupOrder(amount);
            if (!orderRes.data?.success) throw new Error("Failed to create order");
            const { orderId: razorpayOrderId, amount: orderAmount, currency, key: rzpKey } = orderRes.data.data.razorpay;

            // 2. Open Razorpay
            const options = {
                key: rzpKey || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_dummy',
                amount: orderAmount,
                currency: currency,
                name: 'DailyMealBox',
                description: 'Wallet Top-up',
                order_id: razorpayOrderId,
                handler: async (response) => {
                    try {
                        const verifyRes = await dmbCustomerAPI.verifyWalletTopupPayment({
                            razorpayOrderId: response.razorpay_order_id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpaySignature: response.razorpay_signature,
                            amount: amount
                        });
                        if (verifyRes.data?.success) {
                            setWalletData(verifyRes.data.data.wallet);
                            setShowTopupModal(false);
                            setTopupAmount('');
                        }
                    } catch (err) {
                        console.error("Verification failed", err);
                    }
                },
                prefill: {
                    name: currentUser?.name || '',
                    email: currentUser?.email || '',
                    contact: currentUser?.phone || ''
                },
                theme: { color: '#1f7a63' }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                console.error("Payment failed", response.error);
            });
            rzp.open();
        } catch (error) {
            console.error("Topup error", error);
        } finally {
            setProcessing(false);
        }
    };

    const balance = walletData?.balance || 0;
    const transactions = walletData?.transactions || [];

    const getIcon = (type) => {
        if (type === 'addition') return { icon: 'payments', bg: 'bg-[#1f7a63]/10', color: 'text-[#1f7a63]' };
        if (type === 'refund') return { icon: 'account_balance_wallet', bg: 'bg-[#1f7a63]/10', color: 'text-[#1f7a63]' };
        return { icon: 'restaurant', bg: 'bg-[#3e4945]/10', color: 'text-[#3e4945]' };
    };

    return (
        <div className="bg-[#F5F5F0] min-h-screen text-[#1b1c1c] relative">
            {/* Top App Bar */}
            <header className="fixed top-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex items-center px-4 h-14 shadow-sm border-b border-[#bec9c3]/20">
                <button onClick={onBack} className="w-10 h-10 flex items-center justify-start active:scale-90 transition-transform">
                    <ArrowLeft className="text-[#1b1c1c]" />
                </button>
                <h1 className="text-[20px] font-extrabold text-[#1b1c1c] mx-auto pr-10">Wallet</h1>
            </header>

            {/* Main Content Canvas */}
            <main className="pt-16 pb-24 px-5">
                {/* Balance Section */}
                <section className="mt-4">
                    <div className="bg-white rounded-xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex flex-col gap-4 relative overflow-hidden">
                        {/* Abstract decorative element */}
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#1f7a63]/5 rounded-full blur-3xl"></div>
                        <div>
                            <p className="text-[14px] font-semibold text-[#3e4945] opacity-70">Current Balance</p>
                            <h2 className="text-[32px] text-[#1f7a63] font-extrabold mt-1">PLN {balance.toFixed(2)}</h2>
                        </div>
                        <button 
                            onClick={() => setShowTopupModal(true)}
                            className="bg-[#1f7a63] hover:bg-[#155a49] text-white font-semibold text-[16px] py-3.5 rounded-lg w-full transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <PlusCircle className="text-[20px]" />
                            Top up wallet
                        </button>
                    </div>
                </section>

                {/* Transaction History */}
                <section className="mt-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-[18px] font-extrabold text-[#1b1c1c]">Transaction History</h3>
                        {/* <button className="text-[#1f7a63] font-semibold text-[14px]">See all</button> */}
                    </div>
                    {loading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="animate-spin text-[#1f7a63]" />
                        </div>
                    ) : transactions.length === 0 ? (
                        <p className="text-center text-sm text-gray-500 py-4">No transactions yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((tx, idx) => {
                                const isPositive = tx.type === 'addition' || tx.type === 'refund';
                                const { icon, bg, color } = getIcon(tx.type);
                                return (
                                    <div key={idx} className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-between transition-colors active:bg-[#f6f3f2] cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-11 h-11 ${bg} rounded-lg flex items-center justify-center`}>
                                                <span className={`material-symbols-outlined ${color}`}>{icon}</span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-[14px] text-[#1b1c1c]">{tx.description || tx.type}</p>
                                                <p className="font-normal text-[13px] text-[#3e4945]">{new Date(tx.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <span className={`font-semibold text-[16px] ${isPositive ? 'text-[#1f7a63]' : 'text-[#3e4945]'}`}>
                                            {isPositive ? '+' : '-'} PLN {Number(tx.amount).toFixed(2)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Quick Tips / Promotions */}
                <section className="mt-6 mb-8">
                    <div className="bg-[#fea619]/10 border border-[#fea619]/20 rounded-xl p-4 flex gap-4">
                        <Info className="text-[#855300]" />
                        <p className="font-normal text-[14px] text-[#684000]">
                            Use wallet funds to receive 2% cashback on every order.
                        </p>
                    </div>
                </section>
            </main>

            {/* Top-up Modal */}
            {showTopupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-xl font-bold mb-4">Top up wallet</h3>
                        <p className="text-sm text-gray-500 mb-4">Enter amount to add to your wallet</p>
                        <input
                            type="number"
                            className="w-full border-2 border-gray-200 rounded-lg p-3 outline-none focus:border-[#1f7a63] mb-6"
                            placeholder="Amount in PLN"
                            value={topupAmount}
                            onChange={(e) => setTopupAmount(e.target.value)}
                        />
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowTopupModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg active:scale-95 transition-transform"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleTopup}
                                disabled={processing || !topupAmount}
                                className="flex-1 py-3 bg-[#1f7a63] text-white font-bold rounded-lg active:scale-95 transition-transform disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                                {processing ? <Loader2 className="animate-spin" /> : 'Proceed'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
