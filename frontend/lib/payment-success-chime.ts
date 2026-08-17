/**
 * Singing-bowl chime for the thank-you tick.
 * Not a file — Web Audio. Browsers mute it unless AudioContext was unlocked
 * by a click (Pay now). We unlock on that click and play on success.
 */

const CHIME_LOCK_PREFIX = "sarveda_pay_chime:";

let sharedCtx: AudioContext | null = null;

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function getCtx(): AudioContext | null {
  const AC = audioCtor();
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function alreadyPlayed(key?: string): boolean {
  if (!key || typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(CHIME_LOCK_PREFIX + key) === "1";
}

function markPlayed(key?: string): void {
  if (!key || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(CHIME_LOCK_PREFIX + key, "1");
}

function scheduleTones(ctx: AudioContext): void {
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);

  const tone = (freq: number, start: number, dur: number, peak: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };

  tone(392, 0.06, 1.05, 0.55);
  tone(784, 0.06, 0.9, 0.18);
  tone(587.33, 0.42, 0.45, 0.42);
}

/** Call from Pay now (user click) so later play() is allowed. */
export function unlockPaymentSuccessAudio(): void {
  if (reducedMotion()) return;
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);
}

/** Returns true if the chime actually started. */
export async function playPaymentSuccessChime(orderKey?: string): Promise<boolean> {
  if (reducedMotion()) return false;
  if (alreadyPlayed(orderKey)) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") return false;
    scheduleTones(ctx);
    markPlayed(orderKey);
    return true;
  } catch {
    return false;
  }
}
