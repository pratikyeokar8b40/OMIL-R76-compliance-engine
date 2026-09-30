import React from 'react';

export function SectionHeader({ eyebrow: _eyebrow, title, detail, action }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {detail && <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#58746f] sm:text-base">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default SectionHeader;
