import { Mark } from "@/components/mark";
import { ART } from "@/content/catalogue";

// First-visit splash: Tōhaku's pines in ink on white, the mark, then it dissolves into the page. Pure CSS, no JS timers.
// Shown once per browser session, and never on caller pages (a caller in trouble should not wait for art).
export function Splash() {
  return (
    <div id="splash" aria-hidden className="splash pointer-events-none fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed decorative asset, not content */}
      <img src="/art/pines-wide.webp" alt="" className="splash-art absolute inset-0 h-full w-full object-cover" />
      <div className="splash-mark relative flex flex-col items-center gap-3 text-foreground">
        <Mark className="h-10 w-12" strokeWidth={1.2} />
        <span className="text-[30px] tracking-[-0.04em]">Ichido</span>
      </div>
      <span className="splash-credit absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-black/45">{ART.credit}</span>
    </div>
  );
}

// Runs before first paint: skip the splash if it was already shown this session, or on caller-facing pages.
export const SPLASH_GATE = `try{var p=location.pathname;if(sessionStorage.getItem("ichido.splash")||/^\\/(s|caller|h)(\\/|$)/.test(p)){document.documentElement.dataset.splash="off"}else{sessionStorage.setItem("ichido.splash","1")}}catch(e){document.documentElement.dataset.splash="off"}`;
