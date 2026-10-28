"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, Coffee, Disc3, FileCheck2, Film, Heart, LoaderCircle, MapPin, Music2, Plus, ReceiptText, Sparkles, Ticket, Upload, Utensils, Wine, X } from "lucide-react";
import { examplesForMode } from "@/lib/examples";
import { MAX_CSV_BYTES, parseLetterboxdCsv } from "@/lib/csv";
import type { DayId, Mode, PickKind, TraceStep, WeekendPick, WeekendPlan } from "@/lib/types";
import { ReceiptDrawer } from "./receipt-drawer";
import { TracePanel } from "./trace-panel";
import { TwinMark } from "./twin-mark";
import { NightScene } from "./night-scene";

const cities = ["Lisbon", "Tokyo", "New York", "Mumbai", "Berlin"];
const pickIcons = { bar: Wine, restaurant: Utensils, artist: Music2, book: BookOpen, cafe: Coffee };
const pickLabels: Record<PickKind, string> = { bar: "Listening & late nights", restaurant: "Something delicious", artist: "A new frequency", book: "Between the pages", cafe: "A slower kind of Sunday" };

function ModeBadge({ mode }: { mode: Mode }) {
  return <span className={`mode-badge ${mode === "mock" ? "demo" : "live"}`}><span />{mode === "mock" ? "Demo mode: synthetic data" : "Live discoveries by Qloo"}</span>;
}

function TicketArt({ kind }: { kind: PickKind }) {
  const Icon = pickIcons[kind];
  return <div className={`ticket-art art-${kind}`} aria-hidden="true">{kind === "artist" ? <span className="vinyl"><span /></span> : <Icon className="art-icon" strokeWidth={1.5} />}<span className="art-caption">{kind.toUpperCase()}</span></div>;
}

function PickTicket({ pick, index, onReceipt }: { pick: WeekendPick; index: number; onReceipt: (pick: WeekendPick) => void }) {
  return <article className={`pick-ticket ticket-${pick.kind}`} style={{ "--print-delay": `${(index - 1) * 120}ms` } as CSSProperties}>
    <TicketArt kind={pick.kind} />
    <div className="ticket-copy"><span className="pick-category">{pickLabels[pick.kind]}</span><h4>{pick.entity.name}</h4><p>{pick.detail}</p>
      <button type="button" className="receipt-button" onClick={() => onReceipt(pick)} aria-label={`Why you’ll like ${pick.entity.name}`}><ReceiptText size={14} /> Why you’ll like it <ArrowUpRight size={14} /></button>
    </div>
    <div className="ticket-stub"><span className="stub-number">0{index}</span><span className="stub-time">{pick.time}</span><span className="stub-barcode" aria-hidden="true" /></div>
  </article>;
}

export function TasteApp({ mode, preview }: { mode: Mode; preview: WeekendPlan }) {
  const examples = examplesForMode(mode);
  const [favourites, setFavourites] = useState(examples[0].favourites.join("\n"));
  const [city, setCity] = useState("Lisbon");
  const [upload, setUpload] = useState<{ name: string; text: string; count: number } | null>(null);
  const [plan, setPlan] = useState(preview);
  const [isPreview, setIsPreview] = useState(true);
  const [activeExample, setActiveExample] = useState<string | null>("romantic");
  const [selectedDay, setSelectedDay] = useState<"all" | DayId>("all");
  const [receipt, setReceipt] = useState<WeekendPick | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [errorTrace, setErrorTrace] = useState<TraceStep[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  async function generate(values = { favourites, city, csv: upload?.text }) {
    if (pending) return;
    const entries = values.favourites.split("\n").map((item) => item.trim()).filter(Boolean);
    if (entries.length > 20) { setError("Choose up to 20 typed favourites. Each one gets its own line."); return; }
    if (!entries.length && !values.csv) { setError("Give your twin a favourite or a Letterboxd CSV to start with."); return; }
    if (!values.city.trim()) { setError("Your weekend needs a city. Where are we going?"); return; }
    const abort = new AbortController();
    abortRef.current = abort;
    const timer = setTimeout(() => abort.abort("timeout"), 65_000);
    setPending(true);
    setError("");
    setErrorTrace([]);
    try {
      const response = await fetch("/api/plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ favourites: entries, city: values.city, ...(values.csv ? { letterboxdCsv: values.csv } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (Array.isArray(body.trace)) setErrorTrace(body.trace);
        const retry = typeof body.retryAfter === "number" ? ` Try again in about ${Math.ceil(body.retryAfter / 60)} minutes.` : "";
        throw new Error(`${typeof body.error === "string" ? body.error : "Your twin couldn’t finish this plan. Please try again."}${retry}`);
      }
      setPlan(body as WeekendPlan);
      setIsPreview(false);
      setSelectedDay("all");
      if (window.matchMedia("(max-width: 900px)").matches) resultsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    } catch (caught) {
      setError(abort.signal.aborted
        ? abort.signal.reason === "timeout" ? "That trip took too long to plan. Please try again." : "Planning paused. Your previous weekend is still here."
        : caught instanceof Error ? caught.message : "We couldn’t reach your twin. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
      setPending(false);
      abortRef.current = null;
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    setUpload(null);
    if (file.size > MAX_CSV_BYTES) { setError("That CSV is a little big. Please keep it under 200 KB."); return; }
    try {
      const text = await file.text();
      const films = parseLetterboxdCsv(text);
      setUpload({ name: file.name, text, count: films.length });
      setActiveExample(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t read that CSV. Try a fresh Letterboxd export.");
    }
  }

  function tryExample(index: number) {
    const example = examples[index];
    setFavourites(example.favourites.join("\n"));
    setCity(example.city);
    setUpload(null);
    if (fileInput.current) fileInput.current.value = "";
    setActiveExample(example.id);
    void generate({ favourites: example.favourites.join("\n"), city: example.city, csv: undefined });
  }

  const favouriteCount = favourites.split("\n").filter((line) => line.trim()).length;
  const totalPicks = plan.days.reduce((sum, day) => sum + day.picks.length, 0);
  const pickedIndex = new Map(plan.days.flatMap((day) => day.picks).map((pick, index) => [pick.id, index + 1]));

  return <>
    <NightScene />
    <a className="skip-link" href="#taste-form">Skip to your taste</a>
    <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="Taste Twin home"><TwinMark /><span>taste twin<span className="brand-dot">✳</span></span></Link><nav aria-label="Main navigation"><a href="#how-it-works">The idea <ArrowUpRight size={13} /></a><span className="header-divider" /><ModeBadge mode={mode} /></nav></div></header>
    <main className="page-shell">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><span className="eyebrow"><span className="tiny-star" aria-hidden="true">✦</span> A personal computer for your off-duty hours</span><h1 id="hero-title">Your taste.<br /><span>Your next <em>weekend.</em><span className="terminal-cursor" aria-hidden="true">_</span></span></h1><p>The films you love. The songs on repeat. A whole weekend<br className="desktop-break" /> of new favourites, connected by you.</p></div>
        <div className="hero-aside"><div className="weekend-stamp" aria-hidden="true"><span>WEEKEND.EXE</span><div><span>FRI</span><ArrowRight size={26} /><span>SUN</span></div><span>NEW PLACES. FAMILIAR FEELING.</span></div><p>A taste of somewhere new.<br />Receipts included.</p></div>
      </section>
      <div className="computer-case">
      <div className="workspace-topline"><span className="hardware-nameplate">TASTE TWIN <strong>5150</strong></span><span className="hardware-vents" aria-hidden="true" /><span className="power-label"><span className="live-dot" /> SYSTEM READY</span></div>

      <div className="workspace">
        <aside className="input-column">
          <form id="taste-form" className="taste-form" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
            <div className="form-heading"><span className="section-index">01 / TASTE INPUT</span><Heart size={18} /></div>
            <h2>A little about <em>you.</em></h2><p className="form-description">Give us your favourites. Your twin will connect the dots.</p>
            <fieldset disabled={pending}>
              <div className="field-label"><label htmlFor="favourites">What’s your kind of thing?</label><span>{favouriteCount}/20</span></div>
              <div className="taste-types" aria-hidden="true"><span><Film size={13} /> Films</span><span><Disc3 size={13} /> Artists</span><span><BookOpen size={13} /> Books</span><span><Utensils size={13} /> Dishes</span></div>
              <textarea id="favourites" name="favourites" value={favourites} onChange={(event) => { setFavourites(event.target.value); setActiveExample(null); }} rows={6} maxLength={4200} aria-describedby="favourites-hint" placeholder={"movie: Amélie\nartist: Khruangbin\nbook: The Little Prince\ndish: ramen"} />
              <p id="favourites-hint" className="field-hint">One per line. Add movie:, artist:, book: or dish: for a more precise match.</p>
              <div className="or-divider"><span />or bring your film diary<span /></div>
              <input className="visually-hidden" id="letterboxd" type="file" accept=".csv,text/csv" aria-label="Upload a Letterboxd CSV" ref={fileInput} onChange={(event) => { void readFile(event.target.files?.[0]); }} />
              {upload ? <div className="upload-complete"><FileCheck2 size={23} /><span><strong>{upload.name}</strong><small>{upload.count} films ready to connect</small></span><button type="button" aria-label="Remove CSV" onClick={() => { setUpload(null); if (fileInput.current) fileInput.current.value = ""; }}><X size={17} /></button></div> : <label className="upload-zone" htmlFor="letterboxd" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!pending) void readFile(event.dataTransfer.files[0]); }}><Upload size={19} /><span><strong>Drop in your Letterboxd</strong><small>Choose a CSV export · up to 200 KB</small></span><Plus size={15} /></label>}
              <label className="city-label" htmlFor="city">Where’s the weekend taking you?</label>
              <div className="city-input"><MapPin size={18} /><input id="city" name="city" value={city} onChange={(event) => { setCity(event.target.value); setActiveExample(null); }} list="cities" maxLength={80} required autoComplete="address-level2" placeholder="Choose a city" /><ChevronDown size={15} /><datalist id="cities">{cities.map((name) => <option key={name} value={name} />)}</datalist></div>
              <button className="generate-button" type="submit">{pending ? <><LoaderCircle className="spin" size={19} /> Connecting the dots…</> : <>Find my weekend <ArrowRight size={20} /></>}</button>
            </fieldset>
            <p className="form-footnote"><Sparkles size={12} /> Your taste in. New favourites out.</p>
            {pending && <button type="button" className="cancel-button" onClick={() => abortRef.current?.abort()}>Cancel planning</button>}
            {error && <div className="form-error" role="alert">{error}</div>}
          </form>

          <section className="examples" aria-labelledby="examples-title"><div className="examples-heading"><h3 id="examples-title">Or borrow a little taste</h3><span>LOAD A PRESET</span></div>{examples.map((example, index) => <button type="button" key={example.id} className={`example-button ${activeExample === example.id ? "selected" : ""}`} disabled={pending} onClick={() => tryExample(index)}><span className={`example-icon example-${index}`}>{index === 0 ? <Wine size={17} /> : index === 1 ? <Disc3 size={18} /> : <Sparkles size={18} />}</span><span><strong>{example.title}</strong><small>{example.hint}</small></span><ArrowUpRight size={15} /></button>)}</section>
          <div className="little-note"><span aria-hidden="true">↳</span><p>You don’t need a new personality.<br />Just a new place to take it.</p></div>
        </aside>

        <section className={`results-column ${pending ? "is-planning" : ""}`} ref={resultsRef} aria-labelledby="weekend-title" aria-busy={pending}>
          <div className="screen-topline" aria-hidden="true"><span>TASTE TWIN / WEEKEND TERMINAL</span><span>● {pending ? "PROCESSING" : "ONLINE"}</span></div>
          <div className="results-heading"><div><span className="section-index">02 / {isPreview ? "A LITTLE PREVIEW" : "YOUR NEXT CHAPTER"}</span><h2 id="weekend-title">A weekend in <em>{plan.city}.</em></h2></div><span className="weekend-count"><Ticket size={14} /> {totalPicks} discoveries</span></div>
          <div className="result-context"><span>{isPreview ? "An invented sample of what your twin can do." : `${plan.seeds.length} favourites + ${plan.cuisineTags.length} cuisine interests. One very you weekend.`}</span>{plan.mode === "mock" && <ModeBadge mode="mock" />}</div>

          <div className="persona-card"><div className="persona-portrait"><TwinMark /><span className="portrait-spark">✳</span></div><div className="persona-copy"><span className="persona-label">MEET YOUR TASTE TWIN</span><h3>{plan.persona.title}</h3><div className="persona-tags">{plan.persona.tags.length ? plan.persona.tags.map((tag) => <span key={tag.id} title={`${tag.id}${tag.affinity === null ? "" : ` · affinity ${tag.affinity}`}`}>{tag.name}</span>) : <span>Still discovering your common threads</span>}</div></div><span className="persona-seal" aria-hidden="true">✳<small>YOUR VIBE</small></span></div>

          {pending && <div className="planning-status" role="status"><LoaderCircle size={23} className="spin" /><div><strong>Your twin is making connections.</strong><p>Resolving favourites, exploring taste signals, and finding your five discoveries.</p></div></div>}

          <div className="day-tabs" role="group" aria-label="Filter itinerary by day">{(["all", "friday", "saturday", "sunday"] as const).map((day) => <button type="button" key={day} aria-pressed={selectedDay === day} className={selectedDay === day ? "active" : ""} onClick={() => setSelectedDay(day)}>{day === "all" ? "The whole weekend" : day.charAt(0).toUpperCase() + day.slice(1)}</button>)}</div>
          <div className="itinerary">{plan.days.filter((day) => selectedDay === "all" || day.id === selectedDay).map((day) => <section className={`day-section day-${day.id}`} key={day.id} aria-labelledby={`day-${day.id}`}><div className="day-heading"><span className="day-dot" /><h3 id={`day-${day.id}`}>{day.name}</h3><span className="day-rule" /><span>{day.subtitle}</span></div><p className="day-intro">{day.intro}</p><div className="day-picks">{day.picks.length ? day.picks.map((pick) => <PickTicket key={`${pick.id}-${pick.entity.entityId}`} pick={pick} index={pickedIndex.get(pick.id)!} onReceipt={setReceipt} />) : <div className="empty-day">A little room for spontaneity. No matching picks were returned for this day.</div>}</div></section>)}</div>
          <div className="plan-fineprint"><Check size={14} /><p>Suggested stops, at your own pace. Check opening hours and menus. Artist picks are discoveries; local gigs aren’t confirmed.</p></div>
          {!!plan.warnings.length && <details className="plan-notes"><summary>{plan.warnings.length} note{plan.warnings.length > 1 ? "s" : ""} about this trip <ChevronDown size={14} /></summary><ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
          {!!errorTrace.length && <TracePanel trace={errorTrace} failedAttempt />}
          <TracePanel trace={plan.trace} synthetic={plan.mode === "mock"} />
          <p className="narration-credit">{plan.narration === "nebius" ? "Day intros by Nemotron on Nebius." : "Template day intros."} {plan.mode === "mock" ? "Synthetic receipts from invented data." : "Taste receipts built from Qloo data."}</p>
        </section>
      </div>
      <div className="hardware-bottom" aria-hidden="true"><span className="hardware-vents" /><span>PERSONAL TASTE COMPUTER</span><span className="hardware-controls"><i /><i /><i /></span></div>
      </div>
      <section id="how-it-works" className="how-it-works"><span className="section-index">03 / THERE’S A METHOD TO YOUR TASTE</span><div className="how-grid"><div><span>01</span><h3>You bring the favourites.</h3><p>A film, a record, a book, a dish. Little clues to what makes you, you.</p></div><div><span>02</span><h3>{mode === "mock" ? "Try the synthetic taste adapter." : "Qloo finds the connections."}</h3><p>{mode === "mock" ? "Invented examples show the workflow. Live Qloo recommendations still need verification." : "Taste signals connect your interests across culture, food and places."}</p></div><div><span>03</span><h3>Your twin keeps the receipts.</h3><p>Open any pick to see the signal, score and shared tags behind it.</p></div></div></section>
    </main>
    <footer className="site-footer"><Link className="brand" href="/"><TwinMark /><span>taste twin</span></Link><p>Made for your kind of weekend.</p><a href="https://qloo.com" target="_blank" rel="noreferrer">{mode === "mock" ? "Built for " : "Powered by "}<strong>Qloo</strong> <ArrowUpRight size={13} /></a></footer>
    <ReceiptDrawer pick={receipt} onClose={() => setReceipt(null)} />
    <div className="visually-hidden" aria-live="polite">{pending ? "Planning your weekend." : !isPreview ? `Your weekend in ${plan.city} is ready with ${totalPicks} discoveries.` : "Sample weekend ready to explore."}</div>
  </>;
}
