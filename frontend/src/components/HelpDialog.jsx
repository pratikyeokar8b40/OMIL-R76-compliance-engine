import React from 'react';
import { X } from 'lucide-react';

export function HelpDialog({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#17333c]/40 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      <div className="panel w-full max-w-md p-6 animate-rise">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[15px] font-semibold text-[#33545a]">Bench guide</div>
            <h2 id="guide-title" className="mt-2 text-xl font-semibold text-[#17333c]">
              A quiet place to measure.
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close operator guide"
            data-testid="button-close-help"
            className="text-[#66837d] hover:text-[#17333c]"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#58746f]">
            Follow the controlled workflow from registry selection through measurement, validation, finalization, and officer approval.
        </p>
        <div className="mt-5 space-y-3 border-t border-[#d7e0db] pt-4 text-xs text-[#33545a]">
          <div className="flex gap-3">
            <span className="font-mono text-[#c69852]">01</span>
            <span><strong>Identify.</strong> Select a registered instrument first, or register it once before creating an evaluation.</span>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[#c69852]">02</span>
            <span><strong>Set scope and measure.</strong> Use the instrument base unit, complete applicable tests, and provide a reason for every N/A decision.</span>
          </div>
          <div className="flex gap-3">
            <span className="font-mono text-[#c69852]">03</span>
            <span><strong>Validate and seal.</strong> Resolve required evidence and the checklist before finalizing. Pending changes show in the connectivity status; officer approval follows finalization.</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="button-primary mt-6 w-full rounded-md px-4 py-3 text-sm font-semibold"
          data-testid="button-dismiss-help"
        >
          Return to workspace
        </button>
      </div>
    </div>
  );
}

export default HelpDialog;
