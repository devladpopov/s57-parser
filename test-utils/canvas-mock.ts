/**
 * A CanvasRenderingContext2D stand-in that records every method call and
 * property assignment, so renderer output can be checked without a browser.
 */
export interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  calls: { name: string; args: unknown[] }[];
  /** Values assigned to properties such as fillStyle, in order. */
  sets: { name: string; value: unknown }[];
  count(name: string): number;
}

export function recordingContext(): RecordingContext {
  const calls: RecordingContext['calls'] = [];
  const sets: RecordingContext['sets'] = [];
  const state: Record<string | symbol, unknown> = { lineWidth: 1, globalAlpha: 1, font: '10px sans-serif' };
  const ctx = new Proxy({}, {
    get(_t, name) {
      if (name in state) return state[name];
      return (...args: unknown[]) => {
        calls.push({ name: String(name), args });
        if (name === 'measureText') return { width: String(args[0]).length * 6 };
        return undefined;
      };
    },
    set(_t, name, value) {
      state[name] = value;
      sets.push({ name: String(name), value });
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { ctx, calls, sets, count: n => calls.filter(c => c.name === n).length };
}
