import React from 'react';
import { cn } from '@/lib/utils';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  onClick,
  type = 'button',
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-[#c69852]/70 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'button-primary text-[#fffaf0] shadow-[0_8px_20px_rgba(11,45,69,0.12)]',
    quiet: 'button-quiet',
    brass: 'button-brass',
    danger: 'bg-[#ba4e48] text-white hover:bg-[#a33e38] active:translate-y-0.5',
    ghost: 'text-[#66837d] hover:text-[#17333c] hover:bg-black/5',
  };

  const sizes = {
    sm: 'px-3.5 py-2.5 text-sm gap-1.5',
    md: 'px-4 py-3 text-[15px] gap-2',
    lg: 'px-5 py-3.5 text-[15px] gap-2.5',
    icon: 'p-2',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
