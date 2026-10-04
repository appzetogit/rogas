import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Utensils, Mail, Lock, KeyRound, AlertCircle, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { requestPasswordResetApi, resetPasswordApi } from '../services/authApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Office "Forgot password": email -> 6-digit code by email -> new password. */
export default function ForgotPasswordPage() {
  const { t } = useTranslation('office');
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email | reset | done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendCode = async () => {
    const clean = email.toLowerCase().trim();
    if (!EMAIL_RE.test(clean)) {
      setError(t('Please enter a valid email address.'));
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await requestPasswordResetApi(clean);
      setEmail(clean);
      setStep('reset');
      setCooldown(45);
      setInfo(t('If an account exists for this email, we have sent a 6-digit code. Please check your inbox.'));
    } catch (err) {
      setError(err.response?.data?.message || t('Could not send the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) {
      setError(t('Please enter the complete 6-digit OTP.'));
      return;
    }
    if (password.length < 8) {
      setError(t('Password must be at least 8 characters.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPasswordApi(email, otp, password);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || t('Could not reset the password. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 bg-gray-50/50 text-sm text-[#1A1C1E] focus:outline-none focus:border-[#287965] focus:ring-4 focus:ring-[#287965]/10';

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Utensils className="text-[#287965]" />
          <span className="text-[#287965] font-bold text-xl tracking-tight">{t('DailyMealBox')}</span>
        </div>

        {step === 'done' ? (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-[#1A1C1E] mb-2">{t('Password updated')}</h1>
            <p className="text-sm text-gray-500 mb-6">{t('You can now log in with your new password.')}</p>
            <button
              type="button"
              onClick={() => navigate('/office/login')}
              className="w-full py-3 bg-[#287965] text-white font-bold rounded-xl hover:bg-[#1f6050] transition-colors"
            >
              {t('Back to Login')}
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-[#1A1C1E] mb-1">{t('Forgot your password?')}</h1>
            <p className="text-sm text-gray-500 mb-5">
              {step === 'email' ? t('Enter your account email and we will send you a 6-digit code.') : t('Enter the code we emailed you and choose a new password.')}
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {info && !error && (
              <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm mb-4 border border-emerald-200">{info}</div>
            )}

            {step === 'email' ? (
              <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('name@company.com')} className={input} required />
                </div>
                <button type="submit" disabled={busy} className="w-full py-3 bg-[#287965] text-white font-bold rounded-xl hover:bg-[#1f6050] transition-colors disabled:opacity-60">
                  {busy ? t('Sending...') : t('Send code')}
                </button>
              </form>
            ) : (
              <form onSubmit={submitReset} className="space-y-4">
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder={t('6-digit code')} className={`${input} tracking-[0.4em]`} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('New password (min. 8 characters)')} className={`${input} pr-10`} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-label={showPassword ? t('Hide password') : t('Show password')}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button type="submit" disabled={busy} className="w-full py-3 bg-[#287965] text-white font-bold rounded-xl hover:bg-[#1f6050] transition-colors disabled:opacity-60">
                  {busy ? t('Saving...') : t('Reset password')}
                </button>
                <button type="button" onClick={sendCode} disabled={busy || cooldown > 0} className="w-full text-sm font-semibold text-[#287965] disabled:text-gray-400">
                  {cooldown > 0 ? t('Resend code in {{s}}s', { s: cooldown }) : t('Resend code')}
                </button>
              </form>
            )}

            <Link to="/office/login" className="mt-6 flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-[#287965]">
              <ArrowLeft className="w-4 h-4" /> {t('Back to Login')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
