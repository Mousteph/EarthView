import type { ReactNode, RefObject } from "react";

export function InspectionPanel({ ariaLabel, closeLabel, detailsRef, onClose, children }: {
  readonly ariaLabel: string;
  readonly closeLabel: string;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return <section className="event-details" aria-label={ariaLabel} ref={detailsRef}>
    <button className="event-close" type="button" onClick={onClose} aria-label={closeLabel}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
    <div className="event-details-scroll">{children}</div>
  </section>;
}
