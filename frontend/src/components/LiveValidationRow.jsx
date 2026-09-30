import React from 'react';

export function LiveValidationRow({ evaluation, unit = 'g' }) {
  if (!evaluation) return null;
  if (evaluation.invalid) {
    return (
      <div className="mt-5 rounded-md border border-[#e3cf9c] bg-[#fbf4e4] px-3 py-2.5 text-[11px] text-[#92713a]" role="status">
        {evaluation.message}
      </div>
    );
  }
  const isPass = evaluation.verdict === 'PASS';

  return (
    <div className="mt-5 overflow-hidden rounded-md border border-[#d7e0db]">
      <div className="grid grid-cols-2 gap-px bg-[#d7e0db] sm:grid-cols-6">
        <div className="bg-white p-3">
          <div className="eyebrow">E</div>
          <div className="mt-2 font-mono text-sm">{evaluation.errorPrior} {unit}</div>
        </div>
        <div className="bg-white p-3">
          <div className="eyebrow">Ec</div>
          <div className="mt-2 font-mono text-sm">{evaluation.correctedError} {unit}</div>
        </div>
        <div className="bg-white p-3">
          <div className="eyebrow">MPE</div>
          <div className="mt-2 font-mono text-sm">{evaluation.mpeLabel}</div>
        </div>
        <div className="bg-white p-3">
          <div className="eyebrow">Limit</div>
          <div className="mt-2 font-mono text-sm">{evaluation.mpeLimit} {unit}</div>
        </div>
        <div className="bg-white p-3">
          <div className="eyebrow">Intervals</div>
          <div className="mt-2 font-mono text-sm">{evaluation.intervals}e</div>
        </div>
        <div
          className={`flex min-h-[72px] items-center justify-center p-3 text-center font-mono text-xs font-bold text-white ${
            isPass ? 'bg-[#2e7568]' : 'bg-[#b24b43]'
          }`}
          aria-live="polite"
        >
          {isPass ? '✓ PASS' : '✕ FAIL'}
        </div>
      </div>
      <div
        className={`px-3 py-2 text-[10px] ${
          isPass ? 'bg-[#eaf4ef] text-[#2e7568]' : 'bg-[#fff1ef] text-[#a6423b]'
        }`}
      >
        {evaluation.message}
      </div>
    </div>
  );
}

export default LiveValidationRow;
