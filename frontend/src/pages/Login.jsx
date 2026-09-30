import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  FileText,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import machineBg from '@/assets/login-scale.png';
import { api, setTokens } from '@/api/client';

export default function Login() {
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const continueWithOrganization = async (event) => {
    event.preventDefault();
    setSigningIn(true);
    setError('');
    try {
      const data = await api.login(email, password);
      setTokens(data);
      window.location.href = '/dashboard';
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.');
      setSigningIn(false);
    }
  };

  return (
    <div
      className="min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden w-full flex bg-[#F6F5F1] text-[#102A43] antialiased"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif' }}
    >
{/* =====================================================
    LEFT — PRODUCT / INSTRUMENT PANEL
    ===================================================== */}
<section
  className="
    hidden lg:flex
    relative
    w-[52%]
    h-full
    min-h-0
    overflow-hidden
    text-white
    bg-[#102F45]
  "
  style={{
    backgroundColor: '#102F45',
  }}
>
  {/* Solid background layer — guarantees ONE consistent blue */}
  <div
    className="absolute inset-0 z-0 pointer-events-none"
    style={{
      background: '#102F45',
    }}
  />

  {/* Subtle right divider */}
  <div
    className="
      absolute
      right-0
      top-0
      bottom-0
      w-px
      z-[5]
      bg-white/10
    "
  />

  {/* Orange technical accent */}
  <div
    className="
      absolute
      left-0
      top-0
      bottom-0
      w-[4px]
      z-[5]
      bg-[#F47B20]
    "
  />

  {/* Top technical corner */}
  <div
    className="
      absolute
      top-10
      right-10
      w-12
      h-12
      z-[5]
      border-t
      border-r
      border-white/15
    "
  />

  {/* Bottom technical corner */}
  <div
    className="
      absolute
      bottom-10
      left-10
      w-12
      h-12
      z-[5]
      border-b
      border-l
      border-white/15
    "
  />

  {/* Weighing instrument image */}
  <div
    className="
      absolute
      inset-x-0
      bottom-[-24%]
      z-[2]
      flex
      justify-center
      pointer-events-none
    "
  >
    <img
      src={machineBg}
      alt="Non-automatic weighing instrument"
      className="
        w-[105%]
        max-w-none
        object-contain
        select-none
        grayscale
        opacity-[0.22]
      "
    />
  </div>

  {/* LEFT CONTENT */}
  <div
    className="
      relative
      z-[10]
      flex
      h-full
      min-h-0
      w-full
      flex-col
      px-12
      py-8
      xl:px-16
      xl:py-10
    "
  >
    {/* Main heading */}
    <div className="max-w-[590px]">
      <h1
        className="
          text-[48px]
          xl:text-[52px]
          leading-[1.03]
          tracking-[-0.045em]
          font-[800]
          text-white
        "
      >
        Measure with a
        <br />
        record
        <br />

        <span className="text-[#F47B20] font-[650] italic">
          you can trust.
        </span>
      </h1>

      <p
        className="
          mt-3
          max-w-[500px]
          text-[16px]
          xl:text-[17px]
          leading-[1.5]
          text-[#C5D2DC]
          font-medium
        "
      >
        A structured workflow for non-automatic weighing instrument
        inspection, from evaluation to verifiable reports.
      </p>
    </div>

    {/* Instrument-inspired feature rail */}
    <div className="mt-8 pt-5">
      <div className="max-w-[650px] border-t border-white/15 pt-5">
        <div className="grid grid-cols-3 gap-6">

          {/* Structured Records */}
          <div className="flex items-start gap-4">
            <div
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-[10px]
                border
                border-white/15
                bg-white/[0.07]
              "
            >
              <FileText
                size={20}
                strokeWidth={1.8}
                className="text-[#F47B20]"
              />
            </div>

            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-white">
                Structured
              </p>

              <p className="mt-1 text-[12px] font-medium leading-5 text-[#AFC0CD]">
                Records
              </p>
            </div>
          </div>

          {/* Rule-Based Evaluation */}
          <div className="flex items-start gap-4">
            <div
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-[10px]
                border
                border-white/15
                bg-white/[0.07]
              "
            >
              <ShieldCheck
                size={20}
                strokeWidth={1.8}
                className="text-[#F47B20]"
              />
            </div>

            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-white">
                Rule-Based
              </p>

              <p className="mt-1 text-[12px] font-medium leading-5 text-[#AFC0CD]">
                Evaluation
              </p>
            </div>
          </div>

          {/* Verifiable Reports */}
          <div className="flex items-start gap-4">
            <div
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-[10px]
                border
                border-white/15
                bg-white/[0.07]
              "
            >
              <BarChart3
                size={20}
                strokeWidth={1.8}
                className="text-[#F47B20]"
              />
            </div>

            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-white">
                Verifiable
              </p>

              <p className="mt-1 text-[12px] font-medium leading-5 text-[#AFC0CD]">
                Reports
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</section>

      <section className="flex w-full lg:w-[48%] lg:h-full lg:min-h-0 items-center justify-center px-6 py-8 sm:px-10 lg:px-12 xl:px-16 bg-[#F6F5F1]">
        <div className="w-full max-w-[500px]">
          <div className="relative bg-white border border-[#DDE3E8] rounded-[22px] px-8 py-7 sm:px-9 sm:py-8 shadow-[0_12px_40px_rgba(16,42,67,0.055)]">
            <div className="absolute right-6 top-6 h-7 w-7 border-t border-r border-[#D8E0E6]" />

            <div className="mb-6">
              <h2 className="text-[34px] sm:text-[34px] font-[800] tracking-[-0.04em] leading-tight text-[#102A43]">
                Sign in to NAWI
              </h2>
              <p className="mt-3 max-w-[400px] text-[15px] sm:text-[16px] leading-[1.45] font-medium text-[#6B7D8E]">
                Access your organization workspace to continue with inspection work.
              </p>
            </div>

            <form onSubmit={continueWithOrganization} className="space-y-4">
              <div>
                <label className="mb-2.5 block text-[12px] font-bold tracking-[0.12em] uppercase text-[#18344B]">
                  Email
                </label>
                <div className="relative">
                  <Mail size={19} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8EA0AE]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@organization.local"
                    autoComplete="username"
                    required
                    className="w-full h-[52px] pl-12 pr-4 rounded-[12px] border border-[#D7DFE6] bg-[#FBFCFD] text-[16px] font-medium text-[#102A43] placeholder:text-[#9AAAB7] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-[#1B57C4] focus:bg-white focus:ring-4 focus:ring-[#1B57C4]/[0.08]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2.5 block text-[12px] font-bold tracking-[0.12em] uppercase text-[#18344B]">
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole size={19} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8EA0AE]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full h-[52px] pl-12 pr-4 rounded-[12px] border border-[#D7DFE6] bg-[#FBFCFD] text-[16px] font-medium text-[#102A43] placeholder:text-[#9AAAB7] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-[#1B57C4] focus:bg-white focus:ring-4 focus:ring-[#1B57C4]/[0.08]"
                  />
                </div>
              </div>

              {error && <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-medium text-red-600" role="alert">{error}</div>}

              <div className="pt-1 space-y-3">
                <button type="submit" disabled={signingIn} data-testid="button-organization-login" className="group flex h-[52px] w-full items-center justify-center gap-3 rounded-[12px] bg-[#102A43] text-white text-[16px] font-bold shadow-[0_6px_18px_rgba(16,42,67,0.12)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#173B57] hover:-translate-y-[1px] hover:shadow-[0_9px_24px_rgba(16,42,67,0.16)] active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65">
                  {signingIn ? 'Signing in...' : 'Sign in'}
                  {!signingIn && <ArrowRight size={19} strokeWidth={2.4} className="transition-transform duration-300 group-hover:translate-x-1" />}
                </button>

              </div>
            </form>

            <div className="mt-6 border-t border-[#E6EAEE] pt-4">
              <div className="flex items-start gap-3">
                <LockKeyhole size={17} strokeWidth={1.8} className="mt-[2px] shrink-0 text-[#7F93A3]" />
                <p className="text-[13px] leading-[1.65] font-medium text-[#7B8E9E]">
                  If the connection drops mid-session, readings are kept in this browser and sync automatically. Reports are sealed when an evaluation is finalized.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}