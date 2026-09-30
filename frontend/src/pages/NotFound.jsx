import React from 'react';
import { Link } from 'wouter';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Button from '@/components/Button';

export function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f7f3] p-4 text-[#17333c]">
      <div className="panel w-full max-w-md p-8 text-center animate-rise">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#fff1ef] text-[#ba4e48]">
          <AlertCircle size={28} />
        </div>
        <div className="eyebrow mt-4 !text-[#ba4e48]">404 Notice</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-[#58746f]">
          The requested route or evaluation record does not exist on this bench terminal.
        </p>
        <Link href="/dashboard">
          <Button className="mt-6">
            <ArrowLeft size={15} />
            Return to Overview
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
