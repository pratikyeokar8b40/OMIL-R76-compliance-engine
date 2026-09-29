import React from 'react';
import ReportMeta from '@/components/reports/ReportMeta';
import ReportSection from '@/components/reports/ReportSection';
import ReportGrid from '@/components/reports/ReportGrid';
import ReportTable from '@/components/reports/ReportTable';
import ReportNote from '@/components/reports/ReportNote';
import { labelForTestType } from '@/lib/requirements';

export function ReportDocument({
  reportId,
  reportHash,
  metadata = {},
  verified = null,
  session = null,
  instrument = null,
  observations = [],
}) {
  const modelName = instrument?.model || session?.model || session?.asset || 'NAWI Instrument';
  const mfr = instrument?.manufacturer || '—';
  const serialNo = instrument?.serial_number || session?.serial || '—';
  const accClass = instrument?.accuracy_class || session?.accuracyClass || 'III';
  const unit = instrument?.unit || session?.unit || 'g';
  const maxCap = instrument?.max_capacity || session?.capacity || '—';
  const minCap = instrument?.min_capacity || session?.min_capacity || '—';
  const eVal = instrument?.verification_scale_interval || session?.verificationScaleInterval || '—';
  const dVal = instrument?.scale_interval || session?.displayInterval || session?.display_interval || '—';
  const nVal = instrument?.num_scale_intervals || session?.num_scale_intervals || '—';
  const evalMode = session?.evaluation_mode === 'in_service' ? 'In-Service Verification' : 'Initial Verification';
  const dateStr = verified?.signed_at || session?.created_at || metadata?.sealedAt;
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : '—';
  const signerName = verified?.signed_by_name || verified?.signed_by || metadata?.signer || 'Awaiting Officer Approval';

  return (
    <section className="report-print-surface mt-10">
      <div className="report-page relative overflow-hidden rounded-lg border border-[#b9cbc2] bg-white p-5 shadow-[0_18px_60px_rgba(23,51,60,.08)] md:p-10">
        <div className="report-watermark" aria-hidden="true">
          NAWI · CONTROLLED COPY
        </div>

        <div className="relative">
          <div className="report-masthead text-center">
            <div className="eyebrow">
              SIH 26035 · Legal Metrology Laboratory Prototype
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[.16em] text-[#66837d]">
              Non-Automatic Weighing Instrument Evaluation System
            </div>
            <div className="mt-6 text-[10px] uppercase tracking-[.2em] text-[#2e7568]">
              Pattern Evaluation &amp; Verification Record
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">
              Non-Automatic Weighing Instruments (NAWI)
            </h2>
            <div className="mt-2 font-mono text-xs text-[#66837d]">
              OIML R 76-2:2007 / OIML R 76-1:2006
            </div>

            <div className="mt-5 grid gap-2 text-left text-[10px] sm:grid-cols-4">
              <ReportMeta label="Report ID" value={reportId ? String(reportId).slice(0, 16) : '—'} />
              <ReportMeta label="Session ID" value={verified?.session_id || session?.id ? String(verified?.session_id || session?.id).slice(0, 16) : '—'} />
              <ReportMeta label="Type Designation" value={modelName} />
              <ReportMeta label="Date" value={formattedDate} />
            </div>
          </div>

          <ReportSection number="1" title="GENERAL INFORMATION">
            <ReportGrid
              rows={[
                ['Type designation', modelName, 'Instrument category', 'Non-automatic weighing instrument'],
                ['Manufacturer', mfr, 'Serial number', serialNo],
                ['Evaluation mode', evalMode, 'Standard reference', 'OIML R 76-2:2007'],
                ['Overall result', verified?.overall_result || 'INCOMPLETE', 'Template version', verified?.template_version || '2007.1'],
              ]}
            />
          </ReportSection>

          <ReportSection number="2" title="INSTRUMENT SPECIFICATIONS">
            <ReportGrid
              rows={[
                ['Accuracy class', String(accClass), 'Verification scale interval (e)', `${eVal} ${unit}`],
                ['Actual scale interval (d)', `${dVal} ${unit}`, 'Minimum capacity (Min)', `${minCap} ${unit}`],
                ['Maximum capacity (Max)', `${maxCap} ${unit}`, 'Number of scale intervals (n)', String(nVal)],
                ['Zero-setting range', 'Semi-automatic / Automatic', 'Unit of measurement', unit],
              ]}
            />
          </ReportSection>

          <ReportSection number="4" title="ENVIRONMENTAL CONDITIONS">
            <ReportGrid
              rows={[
                ['Starting temperature', session?.start_temp_c !== undefined && session?.start_temp_c !== null ? `${session.start_temp_c} °C` : '—', 'Ending temperature', session?.end_temp_c !== undefined && session?.end_temp_c !== null ? `${session.end_temp_c} °C` : '—'],
                ['Relative humidity', session?.humidity_pct !== undefined && session?.humidity_pct !== null ? `${session.humidity_pct} %` : '—', 'Barometric pressure', session?.pressure_hpa !== undefined && session?.pressure_hpa !== null ? `${session.pressure_hpa} hPa` : '—'],
              ]}
            />
          </ReportSection>

          <ReportSection number="5" title="OBSERVATIONS SUMMARY">
            {observations.length > 0 ? (
              <ReportTable
                headers={['Test Type', 'Seq', 'Pos', 'Applied Load', 'Indication', 'Corr. Error', 'MPE Limit', 'Verdict']}
                rows={observations.map((obs) => [
                  labelForTestType(obs.test_type),
                  String(obs.sequence_no ?? 0),
                  obs.position || '—',
                  `${obs.applied_load} ${unit}`,
                  `${obs.indication} ${unit}`,
                  obs.corrected_error !== undefined && obs.corrected_error !== null ? String(obs.corrected_error) : '—',
                  obs.mpe_limit !== undefined && obs.mpe_limit !== null ? `±${obs.mpe_limit}` : '—',
                  obs.verdict || '—',
                ])}
              />
            ) : (
              <p className="text-xs text-[#66837d]">
                Recorded observations are included in the generated PDF / DOCX artifacts.
              </p>
            )}
          </ReportSection>

          <ReportSection number="38" title="AUTHENTICATED OFFICER APPROVAL &amp; INTEGRITY">
            <ReportGrid
              rows={[
                ['Approving officer', signerName, 'Approval status', verified?.signed ? 'Officer Approved' : 'Awaiting Officer Approval'],
                ['Approval timestamp', verified?.signed_at ? new Date(verified.signed_at).toLocaleString() : 'Pending sign-off', 'Storage integrity', verified?.file_intact ? 'Intact (SHA-256 verified)' : 'Intact'],
                ['Content digest', verified?.content_digest || '—', 'SHA-256 file hash', verified?.file_sha256 || reportHash || '—'],
              ]}
            />
          </ReportSection>

          <div className="report-footer mt-8 flex flex-col gap-2 border-t border-[#c9d9d1] pt-4 text-[10px] text-[#66837d] sm:flex-row sm:justify-between">
            <span>Generated by NAWI Compliance Engine · Authoritative Record</span>
            <span className="font-mono">{reportId} · {verified?.file_sha256 ? `${verified.file_sha256.slice(0, 16)}…` : ''}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ReportDocument;
