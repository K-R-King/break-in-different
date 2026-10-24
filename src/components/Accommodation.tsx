import type { AccommodationInfo } from "../../shared/types";
import { ACCOMMODATION_LABELS, type AccommodationCode } from "../../shared/taxonomy";
import { COPY } from "../copy";
import { Icon } from "./Icon";

// Evidence label badge: text + icon, never color alone.
export function LabelBadge({ info }: { info: Pick<AccommodationInfo, "label" | "contradicts"> | null }) {
  if (info?.contradicts) return <span className="lb lb-conflict"><Icon name="alert" size={14} strokeWidth={2.6} />Conflicts with your need</span>;
  switch (info?.label) {
    case "stated":
      return <span className="lb lb-stated"><Icon name="check" size={14} strokeWidth={3} />Stated</span>;
    case "verified":
      return <span className="lb lb-verified"><Icon name="shield" size={14} strokeWidth={2.6} />Verified</span>;
    case "unverified":
      return <span className="lb lb-unverified"><Icon name="help" size={14} strokeWidth={2.6} />Unverified</span>;
    default:
      return <span className="lb lb-unavailable"><Icon name="minus" size={14} strokeWidth={3} />Not mentioned</span>;
  }
}

export function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// One accommodation row in the job detail: what the listing says, with its evidence.
export function AccommodationRow({ code, need, info }: { code: AccommodationCode; need?: "Required" | "Preferred"; info: AccommodationInfo | null }) {
  return (
    <div className="stack" style={{ gap: 6, padding: "14px 0", borderTop: "1px solid #e4e6eb" }}>
      <div className="row" style={{ gap: 8 }}>
        <strong>{ACCOMMODATION_LABELS[code]}</strong>
        {need && <span className="tag">{need}</span>}
        <LabelBadge info={info} />
      </div>
      {info?.label === "stated" && info.evidence && (
        <blockquote className={`quote${info.contradicts ? " quote-conflict" : ""}`}>Listing says: "{info.evidence}"</blockquote>
      )}
      {info?.label === "verified" && (
        <p style={{ margin: 0 }}>
          Confirmed from the employer's page on {formatDate(info.checkedAt)}.{" "}
          {info.sourceUrl && <a href={info.sourceUrl} target="_blank" rel="noopener noreferrer">View source<span className="sr-only"> (opens in a new tab)</span></a>}
        </p>
      )}
      {info?.label === "unverified" && (
        <p style={{ margin: 0 }}>
          {COPY.jobs.notConfirmed}
          {info.evidence && <span className="small muted"> (The listing only says: "{info.evidence}")</span>}
          {info.sourceUrl && !info.evidence && <> <a href={info.sourceUrl} target="_blank" rel="noopener noreferrer">Source<span className="sr-only"> (opens in a new tab)</span></a></>}
        </p>
      )}
      {!info && <p style={{ margin: 0 }}>{COPY.jobs.notMentioned}</p>}
    </div>
  );
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function sourceName(source: string): string {
  return source === "greenhouse" ? "Greenhouse" : source === "lever" ? "Lever" : source === "demo" ? "DEMO data" : source;
}
