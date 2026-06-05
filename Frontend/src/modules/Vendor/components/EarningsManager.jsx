/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';







export default function EarningsManager({
  transactions,
  onAddTransaction
}) {
  const [subView, setSubView] = useState('summary');
  const [balance, setBalance] = useState(1248);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleRequestPayout = () => {
    if (balance <= 0) {
      triggerToast('No available balance for payout');
      return;
    }
    const refundAmount = balance;
    setBalance(0);
    // Add real-time transaction to registry
    onAddTransaction({
      id: Math.random().toString(),
      date: 'Today',
      type: 'Payout',
      amount: -refundAmount,
      description: 'Payout requested to Bank',
      details: 'Bank clearing reference ID: ' + Math.floor(Math.random() * 8000 + 1000)
    });
    triggerToast(`Payout of ${refundAmount} PLN successfully requested! 🏦`);
  };

  return (
    <div className="flex-grow pt-14 pb-[99px] font-sans px-4 select-none max-w-[390px] mx-auto w-full text-left relative">
      
      {/* Subview Toggle Tabs */}
      <div className="flex gap-2 my-3">
        <button
          onClick={() => setSubView('summary')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all cursor-pointer ${
          subView === 'summary' ?
          'bg-primary text-white border-primary shadow-xs' :
          'bg-white text-primary border-primary hover:bg-primary/5'}`
          }>
          
          Earnings Summary
        </button>
        <button
          onClick={() => setSubView('forecast')}
          className={`flex-grow py-2 text-center text-[12px] font-bold rounded-lg border transition-all cursor-pointer ${
          subView === 'forecast' ?
          'bg-primary text-white border-primary shadow-xs' :
          'bg-white text-primary border-primary hover:bg-primary/5'}`
          }>
          
          Revenue & Retention Forecast
        </button>
      </div>

      {subView === 'summary' ?
      <div className="space-y-4 animate-fadeIn">
          {/* Large Balance Card */}
          <div className="bg-primary-container text-on-primary rounded-xl p-5 shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
            <div className="absolute -right-4 -top-4 opacity-10">
              <span className="material-symbols-outlined !text-[100px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                account_balance_wallet
              </span>
            </div>
            
            <div className="relative z-10 text-left">
              <p className="text-[11px] uppercase tracking-wider text-white/80 font-bold">Available Balance</p>
              <div className="mt-2 text-3xl font-extrabold text-white">{balance.toLocaleString()} PLN</div>
              <div className="mt-1 flex items-center text-[12px] text-white/85">
                <span className="material-symbols-outlined text-[14px] mr-1">schedule</span>
                Next payout: Friday 16 May
              </div>
              <button
              onClick={handleRequestPayout}
              className="mt-5 w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/40 rounded-xl font-bold text-white text-[13px] active:scale-95 transition-all text-center cursor-pointer">
              
                Request Payout
              </button>
            </div>
          </div>

          {/* VAT breakdown card list v3.0 */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs border border-outline-variant/25 text-left">
            <div className="flex justify-between items-center mb-3 border-b border-outline-variant/15 pb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-outline">WEEKLY TAX BREAKDOWN (V3.0)</h2>
              <span className="material-symbols-outlined text-[16px] text-outline">info</span>
            </div>
            
            <div className="space-y-2.5 text-[13px] font-medium">
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Gross food revenue</span>
                <span className="font-bold text-on-surface">632.00 PLN</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-on-surface-variant">Food VAT 8%</span>
                  <span className="text-[10px] text-outline italic font-medium leading-none mt-0.5">(you declare)</span>
                </div>
                <span className="bg-secondary-container/10 text-on-secondary-container px-2.5 py-0.5 rounded-full font-bold text-[12px]">
                  45.33 PLN
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Platform commission 15%</span>
                <span className="font-bold text-on-surface">91.80 PLN</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-on-surface-variant">Commission VAT 23%</span>
                  <span className="text-[10px] text-outline italic font-medium leading-none mt-0.5">(DMB)</span>
                </div>
                <span className="font-bold text-on-surface">21.11 PLN</span>
              </div>
              
              <hr className="border-outline-variant/20 my-2" />
              
              <div className="flex justify-between items-center py-0.5">
                <span className="font-bold text-on-surface">NET PAYOUT to you</span>
                <span className="text-xl font-extrabold text-primary">474.87 PLN</span>
              </div>
            </div>
          </div>

          {/* 7-DAY EARNINGS CHART */}
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1">7-Day Earnings Chart</h2>
            <div className="bg-white rounded-xl p-4 h-[180px] shadow-sm flex items-end justify-between gap-2 border border-outline-variant/15">
              {[
            { label: 'Mon', h: '40px', v: '240 PLN', act: false },
            { label: 'Tue', h: '60px', v: '310 PLN', act: false },
            { label: 'Wed', h: '35px', v: '190 PLN', act: false },
            { label: 'Thu', h: '85px', v: '410 PLN', act: false },
            { label: 'Fri', h: '110px', v: '560 PLN', act: true },
            { label: 'Sat', h: '45px', v: '260 PLN', act: false },
            { label: 'Sun', h: '20px', v: '110 PLN', act: false }].
            map((bar, idx) =>
            <div
              key={idx}
              onClick={() => triggerToast(`Earnings on ${bar.label}: ${bar.v}`)}
              className="flex-1 flex flex-col items-center group cursor-pointer">
              
                  <div className="relative w-full flex flex-col justify-end">
                    <div
                  className={`w-full rounded-t-md transition-all duration-500 hover:brightness-110 ${
                  bar.act ? 'bg-primary' : 'bg-primary/25'}`
                  }
                  style={{ height: bar.h }}>
                </div>
                    {/* Hover indicator tooltip details */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-inverse-surface text-white text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold">
                      {bar.v}
                    </div>
                  </div>
                  <span className={`mt-2 text-[10px] uppercase font-bold tracking-tight ${bar.act ? 'text-primary font-bold' : 'text-outline'}`}>
                    {bar.label}
                  </span>
                </div>
            )}
            </div>
          </section>

          {/* RECENT TRANSACTIONS lists */}
          <section className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-outline">Recent Transactions</h2>
              <button
              onClick={() => triggerToast('Viewing complete historical ledger of credits/debits...')}
              className="font-bold text-primary text-[11px] uppercase">
              
                View All
              </button>
            </div>
            
            <div className="bg-white rounded-xl shadow-xs divide-y divide-outline-variant/15 border border-outline-variant/15 overflow-hidden">
              {transactions.map((t) =>
            <div
              key={t.id}
              onClick={() => triggerToast(`${t.description}: ${t.details}`)}
              className="p-4 flex justify-between items-center active:bg-surface-container/10 hover:bg-surface-container/5 transition-colors cursor-pointer">
              
                  <div className="flex items-center gap-3">
                    <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  t.amount > 0 ? 'bg-primary/10 text-primary' : 'bg-error-container/20 text-error'}`
                  }>
                  
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {t.type === 'Delivery' ? 'local_shipping' : 'account_balance'}
                      </span>
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-[13px] text-on-surface">{t.date}</span>
                      <span className="text-[11px] text-outline font-medium">{t.description}</span>
                    </div>
                  </div>
                  <span className={`font-extrabold text-[14px] ${t.amount > 0 ? 'text-primary' : 'text-error'}`}>
                    {t.amount > 0 ? `+${t.amount}` : t.amount} PLN
                  </span>
                </div>
            )}
            </div>
          </section>
        </div> :

      <div className="space-y-4 animate-fadeIn text-left">
          {/* Projections Card estimated monthly */}
          <section className="bg-primary-container text-on-primary rounded-xl p-5 shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
            <div className="absolute -right-4 -top-4 opacity-10">
              <span className="material-symbols-outlined text-[100px] text-white">payments</span>
            </div>
            <div className="flex flex-col gap-1 relative z-10 text-left">
              <p className="text-[11px] font-bold text-on-primary-container opacity-85 uppercase tracking-wider">
                Earnings Outlook
              </p>
              <h2 className="text-[14px] font-bold text-on-primary">Estimated this month</h2>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-white block">3,248 PLN</span>
                <p className="text-[13px] text-on-primary-container font-medium mt-1">34 subscribers × 18 PLN × ~22 days</p>
              </div>
              <div className="mt-3 pt-3 border-t border-white/15">
                <p className="text-[11px] text-on-primary-container/80 italic">Minus 15% commission + VAT calculated</p>
              </div>
            </div>
          </section>

          {/* 4-week projections visual progress bars */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/15">
            <h3 className="text-[11px] font-bold text-outline mb-4 uppercase tracking-wider">4-WEEK PROJECTION</h3>
            <div className="space-y-4 text-[13px] font-bold">
              {[
            { week: 'Week 1', width: '81.2%', value: '812' },
            { week: 'Week 2', width: '82.6%', value: '826' },
            { week: 'Week 3', width: '79.8%', value: '798' },
            { week: 'Week 4', width: '81.2%', value: '812' }].
            map((proj, idx) =>
            <div key={idx} className="flex items-center gap-3">
                  <span className="text-on-surface-variant font-bold text-[12px] w-12">{proj.week}</span>
                  <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: proj.width }}></div>
                  </div>
                  <span className="text-on-surface text-[13px] w-10 text-right">{proj.value}</span>
                </div>
            )}
            </div>
          </section>

          {/* Subscriber retention specifics */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/15 text-left">
            <h3 className="text-[11px] font-bold text-outline mb-4 uppercase tracking-wider">
              SUBSCRIBER RETENTION FORECAST
            </h3>
            
            <div className="space-y-3 text-[13px] font-semibold">
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Current subscribers</span>
                <span className="text-on-surface bg-表面 text-[13px] font-bold px-2 py-0.5 rounded">34</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Expected renewals</span>
                <span className="text-primary bg-primary/5 px-2.5 py-0.5 rounded-full text-[12px] font-bold">
                  31 (91%)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Estimated new</span>
                <span className="text-secondary bg-secondary-container/10 px-2.5 py-0.5 rounded-full text-[12px] text-orange-600 font-bold">
                  +4
                </span>
              </div>
              
              <div className="pt-3 border-t border-surface-variant/30 flex justify-between items-center">
                <span className="text-[14px] font-bold text-on-surface">Total next month</span>
                <span className="text-lg font-extrabold text-on-surface">35</span>
              </div>
            </div>
          </section>

          {/* Revenue increasing growth options links */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-outline-variant/15">
            <h3 className="text-[11px] font-bold text-outline mb-3 uppercase tracking-wider">
              ACTIONS TO INCREASE REVENUE
            </h3>
            
            <div className="flex flex-col text-[13px] font-bold divide-y divide-outline-variant/15">
              {[
            { task: 'Flash deal', desc: 'Promote active unsold meals instantly', icon: 'local_offer' },
            { task: 'Featured listing', desc: 'Sponsor menu atop user dashboard search feeds', icon: 'auto_awesome' },
            { task: 'Upload menu earlier', desc: 'Expand subscribers pre-order windows', icon: 'upload_file' }].
            map((item, idx) =>
            <div
              key={idx}
              onClick={() => triggerToast(`Action Triggered: ${item.task}. This optimizes logistics pipelines!`)}
              className="flex items-center justify-between py-3 cursor-pointer active:scale-98 transition-transform group">
              
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-[20px]">{item.icon}</span>
                    <span className="text-on-surface hover:text-primary transition-colors text-[13px]">{item.task}</span>
                  </div>
                  <span className="material-symbols-outlined text-outline group-hover:translate-x-0.5 transition-transform text-[18px]">
                    arrow_forward
                  </span>
                </div>
            )}
            </div>
          </section>
        </div>
      }

      {/* Persistence message notice toast overlay */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 transition-all duration-300 z-100 ${
        showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
        }>
        
        <span className="material-symbols-outlined text-primary-fixed text-green-400">check_circle</span>
        <span className="font-bold text-[13px]">{toastMessage}</span>
      </div>
    </div>);

}