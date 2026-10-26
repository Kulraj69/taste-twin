import { Activity, ArrowUpRight, ChevronDown } from "lucide-react";
import type { TraceStep } from "@/lib/types";

export function TracePanel({ trace, synthetic = false, failedAttempt = false }: { trace: TraceStep[]; synthetic?: boolean; failedAttempt?: boolean }) {
  const panelId = failedAttempt ? "failed-agent-trace" : "agent-trace";
  return (
    <details className="trace-panel" id={panelId}>
      <summary>
        <span className="trace-title"><Activity size={17} /> {failedAttempt ? "Latest attempt trace" : "Agent trace"} <span className="count-badge">{trace.length}</span></span>
        <span className="trace-summary">See the connections <ChevronDown size={16} /></span>
      </summary>
      <div className="trace-content">
        <p>{failedAttempt ? "The latest attempt didn’t finish. These calls belong to that attempt; the itinerary above is your previous plan." : synthetic ? "These calls ran against our synthetic adapter. No Qloo network requests were made." : "Every Qloo query used for this plan, including empty results, cache hits and failed calls."}</p>
        <ol className="trace-list">
          {trace.map((step) => (
            <li key={step.id} id={`${panelId}-${step.id}`}>
              <details>
                <summary>
                  <span className={`trace-dot ${step.status}`} />
                  <span className="trace-step-name">{step.label}<code>GET {step.endpoint}</code></span>
                  <span className="trace-metrics">{step.count} results · {step.ms} ms<span>{step.source}{step.status === "error" ? " · failed" : ""}</span></span>
                  <ChevronDown size={14} />
                </summary>
                <dl className="param-list">
                  {Object.entries(step.params).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
                </dl>
              </details>
            </li>
          ))}
        </ol>
        <a href="https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide" target="_blank" rel="noreferrer" className="text-link">Qloo’s hackathon guide <ArrowUpRight size={13} /></a>
      </div>
    </details>
  );
}
