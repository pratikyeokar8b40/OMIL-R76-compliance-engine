import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NawiBrand } from "@/components/NawiBrand";
import "../landing.css";

function Reveal({children,className=""}){const ref=useRef(null),[visible,setVisible]=useState(false);useEffect(()=>{const n=ref.current;if(!n||!("IntersectionObserver" in window)){setVisible(true);return}const f=setTimeout(()=>setVisible(true),900),o=new IntersectionObserver(([e])=>{if(e.isIntersecting){setVisible(true);clearTimeout(f);o.disconnect()}},{threshold:.12});o.observe(n);return()=>{clearTimeout(f);o.disconnect()}},[]);return <div ref={ref} className={`lp-reveal ${visible?"lp-is-visible":""} ${className}`}>{children}</div>}

const TOTAL_TESTS=17;
const COUNT_DURATION=3000;
const COMPLETION_PAUSE=3000;

function R76Counter(){
 const [testNumber,setTestNumber]=useState(0);
 const [reducedMotion,setReducedMotion]=useState(false);
 useEffect(()=>{
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const update=()=>setReducedMotion(media.matches);
  update();
  media.addEventListener?.("change",update);
  return()=>media.removeEventListener?.("change",update);
 },[]);
 useEffect(()=>{
  if(reducedMotion){setTestNumber(TOTAL_TESTS);return}
  let frame;
  const startedAt=performance.now();
  const tick=(now)=>{
   const elapsed=(now-startedAt)%(COUNT_DURATION+COMPLETION_PAUSE);
   setTestNumber(elapsed<COUNT_DURATION?Math.min(TOTAL_TESTS,Math.floor((elapsed/COUNT_DURATION)*TOTAL_TESTS)):TOTAL_TESTS);
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[reducedMotion]);
 const completed=testNumber===TOTAL_TESTS;
 return <div className="lp-evaluation-counter" aria-label={`R-76 evaluation demonstration: test ${String(testNumber).padStart(2,"0")} of ${TOTAL_TESTS}, ${completed?"test completed":"in progress"}`}>
  <span>R-76 EVALUATION</span>
  <strong>TEST {String(testNumber).padStart(2,"0")} / {TOTAL_TESTS}</strong>
  <small><i className={completed?"lp-counter-complete":""}/> {completed?"TEST COMPLETED":"IN PROGRESS"}</small>
 </div>;
}

function Icon({name}){const p={scale:<><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5M8 17h8"/></>,shield:<><path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/></>,offline:<><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 8 10 8M17 8 7 16"/></>,report:<><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15h5"/></>,audit:<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,verify:<><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.3 2.3 4.7-5"/></>,checklist:<><path d="M7 4h10v16H7z"/><path d="m9 9 1.5 1.5L13 8M9 14h6M9 17h6"/></>,environment:<><path d="M12 4v10"/><circle cx="12" cy="17" r="3"/><path d="M9 14V7a3 3 0 0 1 6 0v7"/></>};return <svg className="lp-line-icon" viewBox="0 0 24 24" aria-hidden="true">{p[name]}</svg>}

const challenges=[
 ["scale","Structured instrument records","Keep manufacturer, model, serial number, class, capacity, d, e, and technical specifications together with each evaluation."],
 ["shield","Authoritative evaluation","Measurement calculations and compliance decisions are performed by the server-side metrology engine."],
 ["offline","Offline-ready inspection","Continue capturing evaluation data when connectivity is unavailable and synchronize it when the connection returns."],
 ["audit","Traceable evidence","Preserve observations, validation records, report integrity data, and authorized approval as part of the evaluation history."]
];
const steps=[
 ["01","Register","Capture instrument identity and technical specifications."],
 ["02","Evaluate","Record observations across the applicable R-76 test procedures."],
 ["03","Validate","Apply evaluation rules and complete required validation checks."],
 ["04","Report","Generate standardized PDF and editable DOCX reports."],
 ["05","Approve & Verify","Obtain authorized officer approval and verify report integrity."]
];
const moduleGroups=[
 ["Core verification",[
  ["Zero Check","Verifies the instrument's indication at zero load and checks the applicable zero-error requirement.","ZERO CONDITION"],
  ["Weighing Performance","Checks weighing errors at prescribed loads and compares measured error with the applicable maximum permissible error.","PERFORMANCE CONDITION"],
  ["Eccentricity","Checks whether the indication remains within the applicable error limits when the load is positioned at different locations on the load receptor.","LOAD RECEPTOR CONDITION"],
  ["Repeatability","Evaluates the consistency of repeated indications under the same load and prescribed conditions.","REPEATABILITY CONDITION"],
  ["Tare","Checks the instrument's tare function and the resulting indication/error under the prescribed conditions.","TARE CONDITION"],
  ["Creep","Checks changes in indication over time while a load remains applied.","TIME-DEPENDENT CONDITION"]
 ]],
 ["Influence / Environmental",[
  ["Temperature No-Load","Evaluates zero or no-load indication under the prescribed temperature conditions.","INFLUENCE CONDITION"],
  ["Damp Heat","Evaluates instrument behavior after exposure to prescribed damp-heat environmental conditions.","INFLUENCE CONDITION"],
  ["Voltage Variations","Checks instrument performance when the supply voltage is varied within the prescribed test conditions.","INFLUENCE CONDITION"],
  ["EMC Disturbances","Evaluates the instrument's response to specified electromagnetic disturbances and checks for unacceptable effects.","INFLUENCE CONDITION"]
 ]],
 ["Special Procedures",[
  ["Discrimination","Checks whether the instrument can distinguish a small additional load from the initial indication.","SPECIAL PROCEDURE"],
  ["Sensitivity","Evaluates the instrument's response to a prescribed change in load or input.","SPECIAL PROCEDURE"],
  ["Equilibrium","Checks the stability and equilibrium behavior of the weighing indication under prescribed conditions.","SPECIAL PROCEDURE"],
  ["Tilting","Evaluates instrument performance when subjected to the prescribed tilt or inclination conditions.","SPECIAL PROCEDURE"],
  ["Warm-Up","Checks the instrument's behavior after the prescribed warm-up period.","SPECIAL PROCEDURE"],
  ["Span Stability","Evaluates stability of the weighing indication/span over the prescribed period or sequence.","SPECIAL PROCEDURE"],
  ["Endurance","Evaluates instrument performance after the prescribed repeated loading/endurance sequence.","SPECIAL PROCEDURE"]
 ]]
];

function TestCoverageRow({groupIndex,testIndex,test,openTest,setOpenTest}){
 const [name,description,condition]=test;
 const id=`r76-test-${groupIndex}-${testIndex}`;
 const isOpen=openTest===id;
 const canHover=()=>window.matchMedia("(hover: hover)").matches;
 const toggle=()=>setOpenTest((current)=>canHover()?id:current===id?null:id);
 return <div className={`lp-module-row-wrap ${isOpen?"lp-module-row-open":""}`} onMouseEnter={()=>canHover()&&setOpenTest(id)} onMouseLeave={()=>canHover()&&setOpenTest((current)=>current===id?null:current)}>
  <button className="lp-module-row" id={id} type="button" aria-expanded={isOpen} aria-controls={`${id}-details`} onClick={toggle} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();toggle()}}}>
   <b>{String(testIndex+1).padStart(2,"0")}</b><span>{name}</span><i aria-hidden="true">{isOpen?"↓":"↗"}</i>
  </button>
  <div className="lp-module-details" id={`${id}-details`} role="region" aria-labelledby={id}>
   <div className="lp-module-details-inner"><p>{description}</p><small>R-76 TEST · {condition}</small></div>
  </div>
 </div>;
}

function ReportAnatomy(){
 return <Reveal><section className="lp-report-anatomy-section" id="report-anatomy"><div className="lp-report-anatomy-copy"><span className="lp-eyebrow">07 / REPORT ANATOMY</span><h2>From measurement<br/><span>to evidence.</span></h2><p>Every evaluation produces a structured record that brings together the instrument, conditions, observations, validation, result, approval, and integrity information.</p><div className="lp-report-callouts"><div><strong>Instrument identity</strong><span>Who and what was evaluated.</span></div><div><strong>Environmental record</strong><span>Conditions recorded around the evaluation.</span></div><div><strong>Test results</strong><span>Structured observations and outcomes.</span></div><div><strong>Overall result</strong><span>A clear evaluation state for review.</span></div><div><strong>Approval + integrity</strong><span>Authorized review and verification data.</span></div></div></div><div className="lp-report-mockup" aria-label="Example report showing instrument, environment, test results, overall result, approval, and integrity information"><div className="lp-report-mockup-head"><div><b>NAWI EVALUATION REPORT</b><span>R-76 DIGITAL EVALUATION</span></div><em>Example report</em></div><div className="lp-report-block"><h3>Instrument</h3><div className="lp-report-fields"><span>Manufacturer<strong>Example Instruments</strong></span><span>Model<strong>NAWI-300</strong></span><span>Serial Number<strong>DEMO-001</strong></span><span>Class<strong>III</strong></span></div></div><div className="lp-report-block"><h3>Environment</h3><div className="lp-report-fields"><span>Temperature<strong>23.4 °C</strong></span><span>Humidity<strong>52 %</strong></span></div></div><div className="lp-report-block"><h3>Test Results</h3><div className="lp-report-results"><span>Zero Check<b>PASS</b></span><span>Weighing Performance<b>PASS</b></span><span>Repeatability<b>PASS</b></span><span>Eccentricity<b>PASS</b></span></div></div><div className="lp-report-result"><span>Overall Result</span><strong>PASS</strong></div><div className="lp-report-footer"><span>Approval &amp; Integrity<strong>✓ Authorized officer approval</strong></span><span><strong>SHA-256</strong><small>QR Verify</small></span></div></div></section></Reveal>;
}

export default function Landing(){
 const [menu,setMenu]=useState(false);
 const [openTest,setOpenTest]=useState(null);
 const [,setLocation]=useLocation();
 const go=(id)=>{document.querySelector(id)?.scrollIntoView({behavior:"smooth"});setMenu(false)};
 return <main className="lp-site-shell">
  <nav className="lp-navbar">
  <button className="lp-brand" onClick={()=>go("#top")}><NawiBrand variant="landing" /></button>
   <div className={`lp-nav-links ${menu?"lp-open":""}`}><a onClick={()=>go("#workflow")}>Workflow</a><a onClick={()=>go("#modules")}>Inspection</a><a onClick={()=>go("#integrity")}>Integrity</a></div>
  <div className="lp-nav-actions"><button className="lp-button lp-login-button" onClick={()=>setLocation("/login")}>Login / Signup</button><button className="lp-button lp-button-outline" onClick={()=>go("#workflow")}>Explore the workflow</button><button className="lp-menu-btn" onClick={()=>setMenu(!menu)} aria-label="Menu">☰</button></div>
  </nav>

  <section className="lp-hero" id="top">
   <Reveal className="lp-hero-copy"><span className="lp-eyebrow"><i/>DIGITAL INSPECTION WORKSPACE</span>
    <h1>Compliance, built for <span>measurement.</span></h1>
    <p>NAWI Compliance Suite supports an OIML R-76 based digital evaluation workflow for structured inspection, calculation, validation, reporting, and verification.</p>
    <div className="lp-hero-actions"><button className="lp-button lp-button-primary" onClick={()=>setLocation("/login")}>Explore NAWI <span>→</span></button><button className="lp-text-link" onClick={()=>go("#modules")}>View R-76 coverage <span>→</span></button></div>
    <div className="lp-hero-rule"><b>01</b><span>Designed to support — not replace — human inspection.</span></div>
   </Reveal>
    <Reveal className="lp-hero-visual"><div className="lp-tricolor lp-tricolor-top"/><svg className="lp-hero-orbit" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><ellipse cx="50" cy="50" rx="43" ry="33"/></svg><div className="lp-instrument-art"><div className="lp-art-screen"><span>NAWI</span><R76Counter/><small>DEMONSTRATION · R-76 COVERAGE</small></div><div className="lp-art-platform"/><div className="lp-art-base"/></div></Reveal>
  </section>

  <Reveal><section className="lp-context-section" id="about"><div className="lp-context-accent"/><div className="lp-context-copy"><span className="lp-eyebrow">/ THE WORKSPACE</span><h2>A structured digital layer for NAWI inspection.</h2><p>Replace fragmented inspection records with a controlled digital workspace for instrument data, environmental conditions, observations, validation checks, and reporting.</p></div><div className="lp-context-points"><div><b>INSTRUMENT</b><span>Identity + specifications</span></div><div><b>OBSERVATION</b><span>Measurements + conditions</span></div><div><b>EVIDENCE</b><span>Validation + reporting</span></div></div></section></Reveal>

  <Reveal><section className="lp-challenge-section"><div className="lp-challenge-heading"><span className="lp-section-pill lp-orange-pill">02 / WHY IT MATTERS</span><h2>Turn a fragmented inspection into one controlled record.</h2><p>NAWI connects the practical inspection workflow with validation, persistence, synchronization, and report integrity.</p></div><div className="lp-challenge-grid">{challenges.map(([icon,title,text],i)=><article className="lp-challenge-card" key={title}><div className="lp-challenge-icon"><Icon name={icon}/></div><span className="lp-card-number">0{i+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section></Reveal>

    <Reveal><section className="lp-modules-section" id="modules"><div className="lp-section-heading"><div><span className="lp-eyebrow">04 / R-76 COVERAGE</span><h2>R-76 test workflows.<br/><span>One evaluation.</span></h2></div><p><strong>Applicability-aware evaluation.</strong> The evaluation test plan identifies the procedures applicable to the instrument and verification mode, rather than treating every test as universally mandatory.</p></div><div className="lp-module-groups">{moduleGroups.map(([group,items],groupIndex)=><div className="lp-module-group" key={group}><h3>{group}</h3><div className="lp-module-list">{items.map((test,testIndex)=><TestCoverageRow key={test[0]} groupIndex={groupIndex} testIndex={testIndex} test={test} openTest={openTest} setOpenTest={setOpenTest}/>)}</div></div>)}</div></section></Reveal>

    <Reveal><section className="lp-workflow-section" id="workflow"><div className="lp-workflow-intro"><div className="lp-workflow-copy"><span className="lp-section-pill lp-blue-pill">05 / WORKFLOW</span><h2>From instrument<br/><span>to verified report</span></h2><p>A single flow keeps inspection data organized from registration through validation, reporting, authorized officer approval, and public verification.</p></div><div className="lp-workflow-visual"><div className="lp-visual-photo"><Icon name="scale"/></div><div className="lp-visual-arrow">→</div><div className="lp-visual-report"><div/><div/><div/><b>✓</b></div></div></div><div className="lp-workflow-grid">{steps.map(([num,title,text],i)=><article className={`lp-workflow-card workflow-card-${i+1}`} key={num}><div className="lp-workflow-icon"><Icon name={["scale","shield","checklist","report","verify"][i]}/></div><span className="lp-workflow-number">{num}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section></Reveal>

    <Reveal><section className="lp-split-section" id="integrity"><div><span className="lp-eyebrow">06 / INTEGRITY</span><h2>Every committed observation has a traceable path.</h2><p>Measurement data is evaluated by the backend metrology engine using decimal-safe calculations and configured R-76 rules. The frontend displays the authoritative result rather than independently deciding compliance.</p></div><div className="lp-principles">{[["01","DECIMAL-SAFE","Controlled numerical precision across the calculation pipeline."],["02","REVISIONED","Observation changes remain traceable through revisions."],["03","AUDITABLE","Evaluation actions and approvals are recorded."],["04","VERIFIABLE","Generated reports carry integrity information for independent verification."]].map(([n,t,d])=><div key={n}><b>{n}</b><span><strong>{t}</strong><small>{d}</small></span></div>)}</div></section></Reveal>

    <ReportAnatomy/>

    <Reveal><section className="lp-awareness-section"><div><span className="lp-eyebrow">08 / HUMAN REVIEW</span><h2>Technology supports the inspector.</h2><p>The system automates calculations, validation, record management, and reporting while the inspector remains responsible for performing and reviewing the physical evaluation.</p></div><div className="lp-responsibility-visual"><span className="lp-responsibility-eyebrow">RESPONSIBLE POSITIONING</span><div className="lp-responsibility-columns"><div><strong>SYSTEM</strong><ul><li>Calculations</li><li>Validation</li><li>Record management</li><li>Reporting</li></ul></div><b className="lp-responsibility-plus">+</b><div><strong>INSPECTOR</strong><ul><li>Physical evaluation</li><li>Review</li><li>Approval</li></ul></div></div></div></section></Reveal>

  <Reveal><section className="lp-cta-section"><div><span className="lp-eyebrow">09 / NAWI COMPLIANCE SUITE</span><h2>Ready to explore the NAWI workspace?</h2><p>See how a structured R-76 evaluation becomes a traceable digital record.</p></div><button className="lp-button lp-button-primary" onClick={()=>setLocation("/login")}>Explore NAWI <span>→</span></button></section></Reveal>

  <footer className="lp-footer"><div className="lp-footer-identity"><NawiBrand variant="landing" className="lp-footer-brand" /><span>Digital compliance workflow for non-automatic weighing instrument inspection.</span></div><div className="lp-footer-meta"><span className="lp-footer-status"><i/> PROTOTYPE · v0.1</span><strong>R-76 evaluation workflow</strong><small>Structured observations · Rule-based evaluation · Report integrity</small></div><nav className="lp-footer-nav" aria-label="Footer navigation"><a onClick={()=>go("#top")}>Home</a><a onClick={()=>go("#workflow")}>Workflow</a><a onClick={()=>go("#modules")}>R-76 Coverage</a><a onClick={()=>go("#integrity")}>Integrity</a></nav></footer>
 </main>
}
