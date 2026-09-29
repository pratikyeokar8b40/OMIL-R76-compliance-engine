import React from 'react';
import { Link } from 'wouter';
import {
  Award,
  CheckCircle2,
  Cpu,
  Database,
  FileCheck2,
  Lock,
  Scale,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import { Card, PanelDark } from '@/components/Card';
import Button from '@/components/Button';

export function About() {
  return (
    <div>
      <SectionHeader
        title="About NAWI Compliance Suite."
        detail="A precision metrology verification platform designed for legal metrology officers, testing laboratories, and scale manufacturers under OIML R-76."
        action={
          <Link href="/evaluations/new">
            <Button>Start New Evaluation</Button>
          </Link>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="animate-rise">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#dceee8] text-[#2e7568]">
              <Scale size={20} />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[#33545a]">Standard</div>
              <h3 className="text-base font-semibold text-[#17333c]">OIML R 76-1 / R 76-2</h3>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-6 text-[#58746f]">
            Complete implementation of international metrology recommendations for Non-Automatic Weighing Instruments, including accuracy classes I, II, III, and IIII.
          </p>
        </Card>

        <Card className="animate-rise animate-delay-1">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#fbf4e4] text-[#92713a]">
              <Database size={20} />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[#92713a]">Storage</div>
              <h3 className="text-base font-semibold text-[#17333c]">Offline-First IndexedDB</h3>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-6 text-[#58746f]">
            Zero cloud dependency for active bench operations. Live working drafts, telemetry observations, and calibration metadata persist locally even during network outages.
          </p>
        </Card>

        <Card className="animate-rise animate-delay-2">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#eaf4ef] text-[#2e7568]">
              <Lock size={20} />
            </div>
            <div>
              <div className="text-[15px] font-semibold text-[#33545a]">Integrity</div>
              <h3 className="text-base font-semibold text-[#17333c]">Cryptographic Sealing</h3>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-6 text-[#58746f]">
            Report integrity data is recorded with the evaluation for later verification.
          </p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="panel p-6 md:p-8">
          <div className="text-[15px] font-semibold text-[#33545a]">Evaluation Framework</div>
          <h2 className="mt-2 text-xl font-semibold text-[#17333c]">R-76 test workflow</h2>
          <p className="mt-3 text-[15px] leading-6 text-[#58746f]">
            Each weighing instrument undergoes a structured sequence designed to satisfy statutory legal metrology requirements:
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-4 rounded-lg border border-[#e5ece8] bg-[#fbfdfb] p-4">
              <span className="font-mono text-xs font-bold text-[#2e7568]">01</span>
              <div>
                <div className="text-sm font-semibold">Identification & Profile</div>
                <p className="mt-1 text-xs text-[#66837d]">
                  Verification of instrument plate, model designation, accuracy class, verification interval (e), and maximum capacity.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-lg border border-[#e5ece8] bg-[#fbfdfb] p-4">
              <span className="font-mono text-xs font-bold text-[#2e7568]">02</span>
              <div>
                <div className="text-sm font-semibold">Environmental Baseline</div>
                <p className="mt-1 text-xs text-[#66837d]">
                  Monitoring bench ambient temperature (20–23°C), relative humidity, and atmospheric pressure with automated drift detection.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-lg border border-[#e5ece8] bg-[#fbfdfb] p-4">
              <span className="font-mono text-xs font-bold text-[#2e7568]">03</span>
              <div>
                <div className="text-sm font-semibold">Zero Indication Check</div>
                <p className="mt-1 text-xs text-[#66837d]">
                  Verification of return-to-zero behavior and initial zero setting error limits.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-lg border border-[#e5ece8] bg-[#fbfdfb] p-4">
              <span className="font-mono text-xs font-bold text-[#2e7568]">04</span>
              <div>
                <div className="text-sm font-semibold">Eccentricity Loading Test</div>
                <p className="mt-1 text-xs text-[#66837d]">
                  Five-position loading (Center, Top-Left, Top-Right, Bottom-Right, Bottom-Left) to confirm corner load uniform tolerances.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-lg border border-[#e5ece8] bg-[#fbfdfb] p-4">
              <span className="font-mono text-xs font-bold text-[#2e7568]">05</span>
              <div>
                <div className="text-sm font-semibold">Repeatability Check</div>
                <p className="mt-1 text-xs text-[#66837d]">
                  Consecutive central load indications compared against maximum permissible error (MPE) thresholds.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-lg border border-[#e5ece8] bg-[#fbfdfb] p-4">
              <span className="font-mono text-xs font-bold text-[#2e7568]">06</span>
              <div>
                <div className="text-sm font-semibold">Disposition & Verdict</div>
                <p className="mt-1 text-xs text-[#66837d]">
                  Real-time tolerance error summary, disposition assessment, and handoff to the approving officer.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <PanelDark className="p-6">
            <div className="flex items-center gap-2 text-[#c8a96b]">
              <Award size={18} />
              <span className="eyebrow !text-[#c8a96b]">Statutory Alignment</span>
            </div>
            <h3 className="mt-4 text-xl font-semibold text-[#f4f7f3]">
              Legal Metrology Compliance
            </h3>
            <p className="mt-3 text-xs leading-6 text-[#a5c0b8]">
              Designed in conformance with the Legal Metrology (General) Rules and OIML R-76 recommendations for pattern approval, initial verification, and subsequent reverification.
            </p>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs text-[#c8dbd2]">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={15} className="text-[#c8a96b]" />
                <span>Web Serial automated scale interface</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={15} className="text-[#c8a96b]" />
                <span>7-Segment OCR display capture</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={15} className="text-[#c8a96b]" />
                <span>GPS geolocation binding & timestamping</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={15} className="text-[#c8a96b]" />
                <span>Standardized A4 printable report export</span>
              </div>
            </div>
          </PanelDark>

          <Card className="p-6">
            <div className="eyebrow">Quick Navigation</div>
            <div className="mt-4 space-y-2">
              <Link href="/reports" className="flex items-center justify-between rounded-md p-2.5 text-xs font-semibold hover:bg-[#edf4ef] text-[#33545a]">
                <span>View Report Archive</span>
                <span className="font-mono text-[#7b9690]">→</span>
              </Link>
              <Link href="/reports" className="flex items-center justify-between rounded-md p-2.5 text-xs font-semibold hover:bg-[#edf4ef] text-[#33545a]">
                <span>Sample Public Verification</span>
                <span className="font-mono text-[#7b9690]">→</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default About;
