// Bridge to the Android app (BokraNative is injected by MainActivity). On desktop/browser it's a no-op.
const N = window.BokraNative;
export const isNative = !!N;

export function call(name, arg) {
  if (!N || typeof N[name] !== 'function') return null;
  try {
    return arg === undefined ? N[name]() : N[name](typeof arg === 'string' ? arg : JSON.stringify(arg));
  } catch (e) {
    console.warn('native', name, e);
    return null;
  }
}

export function callJSON(name, arg) {
  const r = call(name, arg);
  if (!r) return null;
  try { return JSON.parse(r); } catch (e) { return null; }
}
