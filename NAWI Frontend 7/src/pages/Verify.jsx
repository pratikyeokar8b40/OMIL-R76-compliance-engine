import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck,
  FileText,
  Fingerprint,
  Globe2,
  LockKeyhole,
  MapPin,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  XCircle,
} from 'lucide-react';
import ReportDocument from '@/components/reports/ReportDocument';
import Button from '@/components/Button';
import logoImg from '@/assets/logo.png';
import { api, downloadFile } from '@/api/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { OFFICER_ROLES, hasRole } from '@/lib/roles';
import QRCode from 'qrcode';

function VerifyField({ label, value, mono }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 text-sm font-semibold text-[#33545a] ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  );
}

const PENDING = 'Verifying…';

export function Verify({ id }) {
  const reportId = id || '';
  const currentUser = useCurrentUser();
  const isOfficer = hasRole(currentUser, OFFICER_ROLES);

  const [verified, setVerified] = useState(null);
  const [session, setSession] = useState(null);
  const [instrument, setInstrument] = useState(null);
  const [observations, setObservations] = useState([]);
  const [reportHash, setReportHash] = useState(PENDING);
  const [metadata, setMetadata] = useState({
    signer: '',
    designation: 'Authenticated Officer Approval',
    sealedAt: '',
  });
  const [verifyError, setVerifyError] = useState('');
  const [signError, setSignError] = useState('');
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [fileCheck, setFileCheck] = useState(null);

  const isSignedIn = localStorage.getItem('nawi-authenticated') === '1' && Boolean(currentUser?.role);
  // The printed QR carries the report's content digest after '#'.
  const urlDigest = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
  const notFound = !loading && !verified;
  const result = verified?.overall_result;
  const resultColor = result === 'PASS' ? '#2e7568' : result === 'FAIL' ? '#b24b43' : '#7b9690';

  const loadVerification = async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const data = await api.verify(reportId);
      setVerified(data);
      // Public payload names the instrument, so anonymous visitors see what
      // the report covers; signed-in users get the full record below.
      if (data.instrument) setInstrument(data.instrument);
      setReportHash(data.file_sha256 || 'Not available');
      setMetadata((m) => ({
        ...m,
        signer: data.signed_by || '',
        sealedAt: data.signed_at || '',
      }));

      if (data.session_id) {
        try {
          const sess = await api.session(data.session_id);
          setSession(sess);
          if (sess.instrument_id) {
            try {
              const inst = await api.instrument(sess.instrument_id);
              setInstrument(inst);
            } catch {
              // optional
            }
          }
          try {
            const obs = await api.observations(data.session_id);
            setObservations(obs || []);
          } catch {
            // optional
          }
        } catch {
          // unauthenticated public check cannot fetch full session payload
        }
      }
    } catch (err) {
      setVerifyError(err.message || 'Report could not be verified on the server.');
      setReportHash('Not available');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVerification();
  }, [reportId]);

  const verifyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/verify/${reportId}`
      : `https://nawi.local/verify/${reportId}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, color: { dark: '#17333c', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [verifyUrl]);

  // Hash a PDF the visitor has in hand and compare it with the sealed file.
  const checkFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !verified) return;
    if (!window.crypto?.subtle) {
      setFileCheck({ status: 'error', name: file.name, detail: 'File checking needs https or localhost in this browser.' });
      return;
    }
    try {
      const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      setFileCheck({ status: hex === verified.file_sha256 ? 'match' : 'mismatch', name: file.name, hex });
    } catch {
      setFileCheck({ status: 'error', name: file.name, detail: 'The file could not be read.' });
    }
  };

  const signReport = async () => {
    if (!verified?.session_id) return;
    setSigning(true);
    setSignError('');
    try {
      await api.sign(verified.session_id, reportId);
      await loadVerification();
    } catch (err) {
      setSignError(err.message || 'Officer sign-off requires officer/admin permissions.');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#edf3ee] text-[#17333c]">
      <header className="screen-only border-b border-[#cfddd5] bg-[#f4f7f3]/90 px-5 py-5 md:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3" data-testid="link-verify-logo">
            <div className="grid h-9 w-9 place-items-center rounded-[9px] border border-[#c69852] bg-[#17333c] overflow-hidden">
              <img
                src={logoImg}
                alt="NAWI Logo"
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="font-mono text-sm font-bold text-[#c69852]">N</span>
            </div>
            <div>
              <div className="wordmark">NAWI</div>
              <div className="mt-1 text-[9px] uppercase tracking-[.16em] text-[#66837d]">
                Public Verification &amp; Report
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-xs text-[#66837d]">
            <ShieldCheck size={15} className="text-[#2e7568]" />
            Authoritative Cryptographic Seal
          </div>
        </div>
      </header>

      {verifyError && (
        <div className="screen-only mx-auto max-w-6xl px-5 pt-5 md:px-12 text-xs text-[#a6423b]">
          {verifyError}
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 py-10 md:px-12 md:py-14">
        <div className="screen-only grid gap-8 lg:grid-cols-[1fr_280px]">
          <section>
            <div className="eyebrow">Verified Instrument Report</div>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <h1 className="page-title">Report {reportId ? String(reportId).slice(0, 16) : '—'}</h1>
              <span
                className={`stamp inline-flex w-fit items-center gap-2 rounded px-3 py-2 font-mono text-[10px] font-bold ${
                  notFound || verified?.file_intact === false
                    ? '!border-[#b24b43] !text-[#b24b43]'
                    : verified?.file_intact
                    ? '!border-[#2e7568] !text-[#2e7568]'
                    : ''
                }`}
              >
                {notFound ? (
                  <>
                    <XCircle size={13} /> NOT A KNOWN REPORT
                  </>
                ) : verified?.file_intact ? (
                  <>
                    <Check size={13} /> GENUINE RECORD
                  </>
                ) : verified?.file_intact === false ? (
                  <>
                    <XCircle size={13} /> INTEGRITY CHECK FAILED
                  </>
                ) : (
                  'VERIFYING'
                )}
              </span>
            </div>

            <div className="panel mt-8 overflow-hidden">
              <div
                className="flex items-center gap-4 border-b border-[#d7e0db] px-5 py-5"
                style={{ background: notFound ? '#fff5f3' : result === 'PASS' ? '#eaf4ef' : result === 'FAIL' ? '#fdeeec' : '#f4f7f3' }}
              >
                <div
                  className="grid h-12 w-12 place-items-center rounded-full text-white"
                  style={{ background: notFound ? '#b24b43' : resultColor }}
                >
                  {notFound || result === 'FAIL' ? <XCircle size={27} /> : <CheckCircle2 size={27} />}
                </div>
                <div>
                  <div className="font-mono text-xl font-bold" style={{ color: notFound ? '#b24b43' : resultColor }}>
                    {loading
                      ? PENDING
                      : notFound
                      ? 'REPORT NOT FOUND'
                      : `EVALUATION RESULT: ${result || 'INCOMPLETE'}`}
                  </div>
                  <div className="mt-1 text-xs text-[#58746f]">
                    {loading
                      ? 'Validating cryptographic digest…'
                      : notFound
                      ? 'No sealed report exists with this ID. Do not rely on this document.'
                      : `Session ${String(verified.session_status || '').toUpperCase()}${verified.signed ? ' and signed by the approving officer' : ', awaiting officer sign-off'}. ${
                          verified.file_intact ? 'The stored report file matches its SHA-256 seal.' : 'The stored report file does NOT match its seal.'
                        }`}
                  </div>
                  {!loading && result === 'FAIL' && (verified?.result_reasons || []).length > 0 && (
                    <ul className="mt-2 list-disc pl-4 text-xs text-[#a6423b]">
                      {verified.result_reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  )}
                </div>
              </div>

              <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 md:p-7">
                <VerifyField
                  label="Instrument"
                  value={
                    loading
                      ? PENDING
                      : instrument
                      ? `${instrument.manufacturer || ''} ${instrument.model || ''} · Class ${instrument.accuracy_class}`.trim()
                      : '—'
                  }
                />
                <VerifyField
                  label="Serial number"
                  value={loading ? PENDING : instrument?.serial_number || session?.serial || '—'}
                  mono
                />
                <VerifyField label="Standard" value="OIML R 76-2:2007 / R 76-1:2006" />
                <VerifyField
                  label="Signed At"
                  value={
                    loading
                      ? PENDING
                      : verified?.signed_at
                      ? new Date(verified.signed_at).toLocaleString()
                      : 'Pending sign-off'
                  }
                />
                <VerifyField
                  label="Authenticated Signatory"
                  value={loading ? PENDING : verified?.signed_by || 'Awaiting Officer Approval'}
                />
                <VerifyField
                  label="Session ID"
                  value={loading ? PENDING : verified?.session_id ? String(verified.session_id).slice(0, 16) : '—'}
                  mono
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="sm" onClick={() => window.print()} data-testid="button-print-report">
                <Printer size={15} />
                Print report
              </Button>
              {isSignedIn && (<>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => void downloadFile(reportId, 'pdf').catch((err) => setVerifyError(err.message))}
                data-testid="button-download-report-pdf"
              >
                <Download size={15} />
                Download PDF
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => void downloadFile(reportId, 'docx').catch((err) => setVerifyError(err.message))}
                data-testid="button-download-report-docx"
              >
                <FileText size={15} />
                Download DOCX
              </Button>
              </>)}
            </div>

            {verified && (
              <div className="panel mt-6 p-5">
                <div className="eyebrow">Check a copy you were given</div>
                <p className="mt-2 text-xs leading-5 text-[#66837d]">
                  Choose the PDF file. Its SHA-256 is computed in this browser (nothing is uploaded) and compared with the sealed original.
                </p>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={checkFile}
                  className="mt-3 block text-xs"
                  data-testid="input-verify-file"
                />
                {fileCheck && (
                  <div
                    className="mt-3 rounded-md px-3 py-2 text-xs font-semibold"
                    style={{
                      background: fileCheck.status === 'match' ? '#eaf4ef' : '#fdeeec',
                      color: fileCheck.status === 'match' ? '#2e7568' : '#a6423b',
                    }}
                    data-testid="text-verify-file-result"
                  >
                    {fileCheck.status === 'match'
                      ? `${fileCheck.name}: identical to the sealed report.`
                      : fileCheck.status === 'mismatch'
                      ? `${fileCheck.name}: does NOT match the sealed report (altered or a different file).`
                      : `${fileCheck.name}: ${fileCheck.detail}`}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="panel p-5">
              <div className="eyebrow">Public QR Check</div>
              <div className="mt-5 grid aspect-square place-items-center rounded-lg border border-[#c9d9d1] bg-white p-4">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code linking to the verification page for report ${reportId}`}
                    className="h-full w-full object-contain"
                    data-testid="image-verify-qr"
                  />
                ) : (
                  <div className="text-[10px] text-[#9ab0a9]">Generating QR code…</div>
                )}
              </div>
              <div className="mt-4 break-all text-center font-mono text-[10px] text-[#66837d]">
                {verifyUrl.replace(/^https?:\/\//, '')}
              </div>
            </div>

            <div className="panel p-5 text-xs leading-5 text-[#66837d]">
              <LockKeyhole size={15} className="mb-3 text-[#2e7568]" />
              <p>
                Authoritative verification confirms the report digest, session identity, officer approval, and stored-file SHA-256 integrity.
              </p>
              <p className="mt-3">
                Overall result <span className="font-mono font-bold" style={{ color: resultColor }}>{verified?.overall_result || '—'}</span>
              </p>
              <p className="mt-3">
                Content digest (printed on the report){' '}
                <span className="break-all font-mono text-[#33545a]">{verified?.content_digest || '—'}</span>
              </p>
              {urlDigest && verified && (
                <p className="mt-2 font-semibold" style={{ color: urlDigest === verified.content_digest ? '#2e7568' : '#a6423b' }}>
                  {urlDigest === verified.content_digest
                    ? 'QR code digest matches the sealed report.'
                    : 'QR code digest does NOT match the current seal (older copy or altered QR).'}
                </p>
              )}
              <p className="mt-3">
                PDF file SHA-256 <span className="break-all font-mono text-[#33545a]">{reportHash}</span>
              </p>
            </div>
          </aside>
        </div>

        {isOfficer && (
          <section className="screen-only panel mt-8 p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="eyebrow">Officer Approval &amp; Seal</div>
                <h2 className="mt-2 text-xl font-semibold">Authoritative Sign-Off</h2>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-[#66837d]">
                  Authenticated sign-off transitions the session to approved and stamps the report seal row with your officer credentials and audit hash.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                    verified?.signed ? 'bg-[#dceee8] text-[#2e7568]' : 'bg-[#fbf4e4] text-[#92713a]'
                  }`}
                >
                  <Stamp size={13} />
                  {verified?.signed ? 'Officer Approved' : 'Sign-Off Pending'}
                </span>
              </div>
            </div>

            {signError && <div className="mt-4 text-xs text-[#a6423b]">{signError}</div>}

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="rounded-md border border-[#c9d9d1] bg-[#fbfdfb] px-3 py-3 text-xs text-[#58746f]">
                <div className="eyebrow">Authenticated account</div>
                <div className="mt-1 font-semibold text-[#17333c]">{currentUser?.full_name || currentUser?.email || 'Current officer account'}</div>
                <div className="mt-1">The backend records the authenticated officer identity. Name/designation are not editable report fields.</div>
              </div>
              <div className="flex gap-2 self-end">
                <Button
                  size="sm"
                  onClick={signReport}
                  disabled={signing || verified?.signed}
                  data-testid="button-seal-report"
                >
                  <Stamp size={14} />
                  {verified?.signed ? 'Approved' : signing ? 'Signing…' : 'Approve & Seal'}
                </Button>
              </div>
            </div>
          </section>
        )}

        <ReportDocument
          reportId={reportId}
          reportHash={reportHash}
          metadata={metadata}
          verified={verified}
          session={session}
          instrument={instrument}
          observations={observations}
        />
      </main>
    </div>
  );
}

export default Verify;
