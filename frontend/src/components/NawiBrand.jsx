import logoImg from '@/assets/logo.png';

export function NawiBrand({ variant = 'dashboard', className = '' }) {
  return (
    <div className={`nawi-brand nawi-brand--${variant} ${className}`.trim()}>
      <div className="nawi-brand-mark">
        <img src={logoImg} alt="NAWI" />
      </div>
      <div className="nawi-brand-copy">
        <div className="nawi-brand-wordmark">NAWI</div>
        <div className="nawi-brand-subtitle">COMPLIANCE SUITE</div>
      </div>
    </div>
  );
}

export default NawiBrand;
