/**
 * Short singing-bowl style chime timed to PaymentSuccessMark
 * (circle pop ~0s, tick draw ~0.42s).
 */
export function playPaymentSuccessChime(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;

  try {
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.11;
    master.connect(ctx.destination);

    const tone = (freq: number, start: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };

    // Bowl strike with the badge pop
    tone(392, 0.06, 1.05, 0.55);
    tone(784, 0.06, 0.9, 0.18);
    // Bright confirm with the tick
    tone(587.33, 0.42, 0.45, 0.42);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1600);
  } catch {
    // Autoplay may be blocked after a Stripe/PayPal redirect — ignore.
  }
}
