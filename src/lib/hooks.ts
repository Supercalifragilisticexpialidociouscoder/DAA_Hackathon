import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof matchMedia !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Animates a number toward `target`; jumps straight there when `animate` is false. */
export function useTween(target: number, animate: boolean, duration = 900, delay = 0) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!animate) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    let raf = 0;
    let t0 = 0;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        if (!t0) t0 = now;
        const k = Math.min(1, (now - t0) / duration);
        const e = 1 - Math.pow(1 - k, 3);
        const v = start + (target - start) * e;
        from.current = v;
        setValue(v);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, animate, duration, delay]);
  return value;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** A "Copied" flag that resets itself. */
export function useFlash(ms = 1600) {
  const [key, setKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = (k: string) => {
    setKey(k);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setKey(null), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [key, flash] as const;
}
