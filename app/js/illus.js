// Simple geometric illustrations in the .ATHR graphic language (diamonds, lines, frames, circles).
const dia = (x, y, s, cls = '') => `<path class="${cls}" d="M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z"/>`;

const ART = {
  top3: `<svg class="illus" width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
    <path class="l" d="M10 70h100" stroke-width="1.5" stroke-dasharray="3 5"/>
    ${dia(60, 22, 13, 'a')}
    <g stroke-width="2" class="t">${dia(42, 48, 13)}${dia(78, 48, 13)}</g></svg>`,
  tasks: `<svg class="illus" width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
    <rect class="l" x="24" y="10" width="72" height="64" rx="12" stroke-width="1.5"/>
    <path class="t" d="M40 30h40M40 44h30M40 58h22" stroke-width="2" stroke-linecap="round"/>
    ${dia(92, 66, 9, 'a')}</svg>`,
  review: `<svg class="illus" width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
    <circle class="l" cx="60" cy="42" r="36" stroke-width="1.5"/>
    <circle class="l" cx="60" cy="42" r="24" stroke-width="1.5"/>
    <circle class="t" cx="60" cy="42" r="12" stroke-width="2"/>
    <circle class="a" cx="60" cy="42" r="5"/></svg>`,
  goals: `<svg class="illus" width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
    <path class="l" d="M14 70h92" stroke-width="1.5"/>
    <rect class="s" x="24" y="46" width="14" height="24" rx="3"/><rect class="s" x="46" y="34" width="14" height="36" rx="3"/>
    <rect class="s" x="68" y="24" width="14" height="46" rx="3"/>${dia(97, 16, 8, 'a')}</svg>`,
  week: `<svg class="illus" width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden="true">
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect class="${i === 2 || i === 5 ? 's' : 'l'}" x="${12 + i * 14}" y="20" width="10" height="44" rx="3" stroke-width="1.5" ${i === 2 || i === 5 ? '' : 'fill="none"'}/>`).join('')}
    ${dia(31, 72, 4, 'a')}</svg>`,
};

export const illus = (name) => ART[name] || ART.tasks;

// The day as an arc from Fajr (right) to Isha (left), with where you are now.
export function dayArc(list, now, currentKey) {
  const W = 320, H = 86, L = 22, R = 298, base = 74, rise = 54;
  const t0 = list[0].time.getTime();
  const t1 = list[4].time.getTime();
  const span = Math.max(1, t1 - t0);
  const pos = (f) => {
    const x = R - (R - L) * f;
    const y = base - rise * Math.sin(Math.PI * f);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };
  const path = (a, b) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const f = a + ((b - a) * i) / 40; pts.push(pos(f).join(' ')); }
    return `M${pts.join('L')}`;
  };
  const nf = Math.max(0, Math.min(1, (now.getTime() - t0) / span));
  const [sx, sy] = pos(nf);
  const pts = list.map((p) => {
    const f = (p.time.getTime() - t0) / span;
    const [x, y] = pos(f);
    const cls = p.done ? 'done' : p.key === currentKey ? 'now' : p.time <= now ? 'miss' : '';
    return `<path class="pt ${cls}" d="M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z"/>`;
  }).join('');
  return `<svg class="arc" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path class="track" d="${path(0, 1)}"/>
    ${nf > 0 ? `<path class="past" d="${path(0, nf)}"/>` : ''}
    ${pts}
    <circle class="sun-halo" cx="${sx}" cy="${sy}" r="13"/><circle class="sun" cx="${sx}" cy="${sy}" r="5.5"/>
  </svg>`;
}
