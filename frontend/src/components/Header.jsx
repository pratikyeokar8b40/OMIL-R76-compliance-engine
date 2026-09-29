import React from 'react';
import { CircleHelp, Menu } from 'lucide-react';
import ConnectivityPill from '@/components/ConnectivityPill';

export function Header({ onOpenMobileNav, onOpenHelp }) {
  return (
    <header className="flex h-[72px] items-center justify-between border-b border-[#d7e0db] bg-[#f4f7f3]/90 px-5 backdrop-blur md:px-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="rounded-xl border border-transparent p-2 text-[#33545a] transition-colors hover:border-[#d7e0db] hover:bg-white/80 md:hidden"
          aria-label="Open navigation"
          data-testid="button-open-navigation"
        >
          <Menu size={20} />
        </button>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={onOpenHelp}
          className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-[15px] font-medium text-[#58746f] transition-colors hover:bg-white/80 hover:text-[#17333c] sm:flex"
          data-testid="button-header-help"
        >
          <CircleHelp size={16} />
          Help
        </button>
        <ConnectivityPill />
      </div>
    </header>
  );
}

export default Header;
