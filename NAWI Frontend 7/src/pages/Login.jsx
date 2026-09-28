import React, { useState } from 'react';
import { BarChart3, FileText, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import machineBg from '@/assets/login-scale.png';
import { api, setTokens } from '@/api/client';
import { NawiBrand } from '@/components/NawiBrand';

const features = [
  { icon: FileText, label: 'Structured records' },
  { icon: ShieldCheck, label: 'Rule-based evaluation', accent: true },
  { icon: BarChart3, label: 'Verifiable reports' },
];

export function Login() {
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const continueWithOrganization = async () => {
    setSigningIn(true);
    setError('');
    try {
      const data = await api.login(email, password);
      setTokens(data);
      localStorage.removeItem('nawi-local-mode');
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
      setSigningIn(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-visual" aria-label="NAWI workspace introduction">
        <div className="login-dots" />
        <NawiBrand variant="login" className="login-brand" />

        <div className="login-hero-copy">
          <div className="login-eyebrow"><span />Digital inspection workspace</div>
          <h1>Measure with a record<br /><em>you can trust.</em></h1>
          <p>A structured workflow for non-automatic weighing instrument inspection, from evaluation to verifiable reports.</p>

          <div className="login-feature-row">
            {features.map(({ icon: Icon, label, accent }) => (
              <div className="login-feature" key={label}>
                <div className={`login-feature-icon ${accent ? 'accent' : ''}`}><Icon size={27} strokeWidth={1.8} /></div>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <img className="login-machine" src={machineBg} alt="Non-automatic weighing instrument" />

      </section>

      <section className="login-form-side">
        <div className="login-form-card">
          <div className="login-card-heading">
            <div className="login-eyebrow"><span />Secure workspace access</div>
            <h2>Sign in to NAWI</h2>
            <p>Access your organization workspace to continue with inspection work.</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void continueWithOrganization(); }}>
            <label className="login-field">
              <span>Email</span>
              <div className="login-input-wrap">
                <Mail size={20} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="name@organization.local" />
              </div>
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-input-wrap">
                <LockKeyhole size={20} />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
              </div>
            </label>

            {error && <div className="login-error" role="alert">{error}</div>}

            <button type="submit" disabled={signingIn} className="login-submit" data-testid="button-organization-login">
              <span>{signingIn ? 'Signing in…' : 'Sign in'}</span>
              <span className="login-submit-arrow">→</span>
            </button>

          </form>

          <div className="login-note">
            <LockKeyhole size={18} />
            <span>If the connection drops mid-session, readings are kept in this browser and sync automatically. Reports are sealed when an evaluation is finalized.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Login;
