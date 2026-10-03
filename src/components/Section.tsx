import type { ReactNode } from "react";

/** A page section with a painted step plate: the algorithm's stages in order. */
export function Section({ id, step, title, lede, children, className = "" }: {
  id: string;
  step: number;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="section-head">
        <span className="step-plate" aria-hidden>{step}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      {lede && <p className="section-lede">{lede}</p>}
      {children}
    </section>
  );
}

/** Monospace pseudocode with optional highlighted lines (1-based). */
export function Pseudo({ lines, active = [], label }: { lines: string[]; active?: number[]; label: string }) {
  return (
    <pre className="pseudo" aria-label={label}>
      {lines.map((l, i) => (
        <span key={i} className={active.includes(i + 1) ? "on" : ""}>
          <i aria-hidden>{String(i + 1).padStart(2, " ")}</i>
          {l}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}
