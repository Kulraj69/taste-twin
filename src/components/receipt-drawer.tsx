"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, Check, Fingerprint, ReceiptText, X } from "lucide-react";
import type { WeekendPick } from "@/lib/types";

export function ReceiptDrawer({ pick, onClose }: { pick: WeekendPick | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (pick && node && !node.open) {
      node.showModal();
      const oldOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = oldOverflow; node.close(); };
    }
  }, [pick]);

  const receipt = pick?.receipt;
  return (
    <dialog ref={dialog} className="receipt-drawer" aria-labelledby="receipt-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {pick && receipt && <div className="receipt-paper">
        <div className="drawer-top"><span className="eyebrow"><ReceiptText size={15} /> The taste receipt</span><button type="button" className="icon-button" aria-label="Close receipt" onClick={onClose} autoFocus><X size={22} /></button></div>
        <h2 id="receipt-title">Why you’ll<br /><em>like it.</em></h2>
        <p className="drawer-intro">Follow the connection from your favourites to <strong>{pick.entity.name}</strong>.</p>
        <span className={`mode-badge ${receipt.source === "mock" ? "demo" : "live"}`}><span />{receipt.source === "mock" ? "Demo mode: synthetic data" : "Evidence from Qloo"}</span>

        <div className="receipt-chain">
          <section className="chain-block"><span className="receipt-label">01 / Your taste, resolved</span>
            {receipt.seeds.map((seed) => <div className="seed-proof" key={seed.entityId}>
              <h3>{seed.name}</h3><span className="seed-input">From “{seed.input}”</span><code>{seed.entityId}</code><small>Resolved by /search · {seed.searchTraceId}</small>
            </div>)}
            {receipt.seedTags.map((tag) => <div className="seed-proof" key={tag.id}><h3>{tag.name}</h3><span className="seed-input">Cuisine interest resolved through /v2/tags</span><code>{tag.id}</code></div>)}
          </section>
          <div className="chain-arrow"><ArrowDown size={19} /><span>passed as the interest signal</span></div>
          <section className="chain-block signal-block"><span className="receipt-label">02 / {receipt.source === "mock" ? "Synthetic" : "Qloo"} taste signal</span>
            <h3><Fingerprint size={20} /> GET /v2/insights</h3>
            <p>The complete signal, with the exact query parameters used for this pick.</p>
            <dl className="param-list">{Object.entries(receipt.signal.params).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
            <small>Agent trace · {receipt.signal.traceId}</small>
          </section>
          <div className="chain-arrow"><ArrowDown size={19} /><span>returned this discovery</span></div>
          <section className="chain-block"><span className="receipt-label">03 / Your next favourite</span><h3 className="picked-name">{receipt.picked.name}</h3><code>{receipt.picked.entityId}</code>
            <div className="affinity-proof"><span>Returned affinity<small>query.affinity · unrounded</small></span><strong>{receipt.affinity === null ? "Not returned" : String(receipt.affinity)}</strong></div>
          </section>
        </div>

        <section className="shared-evidence"><span className="receipt-label">The common threads</span><p>Tag IDs present on this pick and on a seed or in the taste analysis. Names are shown as returned.</p>
          {receipt.sharedTags.length ? receipt.sharedTags.map((tag) => {
            const evidence = receipt.tagEvidence.find((item) => item.tagId === tag.id);
            return <div className="tag-proof" key={tag.id}><div><Check size={15} /><strong>{tag.name}</strong></div><code>{tag.id}</code>{tag.type && <code>{tag.type}</code>}<small>{evidence?.seedIds.length ? `Shared with ${evidence.seedIds.length} resolved favourite${evidence.seedIds.length > 1 ? "s" : ""}` : "Present in the combined taste analysis"}{evidence?.inTasteAnalysis && evidence.seedIds.length ? " · also in taste analysis" : ""}</small></div>;
          }) : <p className="empty-evidence">No shared tag IDs were returned. The affinity signal still stands; we haven’t invented a tag explanation.</p>}
          {receipt.signal.tagAnalysisTraceId && <small>Taste analysis · {receipt.signal.tagAnalysisTraceId} · filter.type=urn:tag</small>}
        </section>
        <p className="receipt-note">{receipt.note}</p>
        <div className="receipt-footer"><span className="barcode" aria-hidden="true" /><span>GOOD TASTE. CLEAR RECEIPTS.</span></div>
      </div>}
    </dialog>
  );
}
