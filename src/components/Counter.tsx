/* Stencil room counter whose digits roll like a tally drum, plus the chalk circle. */

const STRIP = ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Counter({ value, width, animate, delay = 150, duration = 900 }: {
  value: number;
  /** number of digit columns to reserve */
  width: number;
  animate: boolean;
  delay?: number;
  duration?: number;
}) {
  const text = String(value).padStart(width, " ");
  const transition = animate ? `transform ${duration}ms cubic-bezier(.3,.7,.2,1) ${delay}ms, width 300ms ease ${delay}ms` : "none";
  return (
    <span className="counter" aria-hidden>
      {text.split("").map((ch, i) => {
        const idx = ch === " " ? 0 : Number(ch) + 1;
        return (
          <span key={i} className={idx === 0 ? "digit blank" : "digit"} style={{ transition }}>
            <span className="strip" style={{ transform: `translateY(${-idx}em)`, transition }}>
              {STRIP.map((d, j) => (
                <span key={j}>{d || " "}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ChalkCircle({ state, digits = 1 }: { state: "hidden" | "drawing" | "shown"; digits?: number }) {
  // wide enough to ring the number: one digit ≈ 0.45em of this stencil face
  const width = `${0.55 + 0.45 * digits}em`;
  return (
    <svg className={`chalk-circle ${state}`} style={{ width }} viewBox="0 0 200 170" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="chalk-rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
        </filter>
      </defs>
      <path
        pathLength={1}
        filter="url(#chalk-rough)"
        d="M132 20 C 92 6, 38 24, 25 72 C 13 120, 58 158, 108 154 C 160 150, 188 114, 182 72 C 177 34, 146 12, 100 18 C 86 20, 74 25, 63 33"
      />
    </svg>
  );
}
