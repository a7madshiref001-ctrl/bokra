// Prayer times, computed offline (PrayTimes-style astronomy).
// Egyptian General Authority of Survey: Fajr 19.5°, Isha 17.5°, Asr = shadow 1 (Shafi'i).
// The same algorithm lives in the Android app (Prayer.kt) so the widget matches.

export const PRAYERS = [
  { key: 'fajr', name: 'الفجر', short: 'فجر' },
  { key: 'dhuhr', name: 'الضهر', short: 'ضهر' },
  { key: 'asr', name: 'العصر', short: 'عصر' },
  { key: 'maghrib', name: 'المغرب', short: 'مغرب' },
  { key: 'isha', name: 'العشا', short: 'عشا' },
];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const sin = (d) => Math.sin(rad(d));
const cos = (d) => Math.cos(rad(d));
const tan = (d) => Math.tan(rad(d));
const asin = (x) => deg(Math.asin(x));
const acos = (x) => deg(Math.acos(x));
const atan2 = (y, x) => deg(Math.atan2(y, x));
const acot = (x) => deg(Math.atan(1 / x));
const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPos(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
}

export function prayerTimes(date, lat, lng, fajrAngle = 19.5, ishaAngle = 17.5) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const jDate = julian(y, m, d) - lng / (15 * 24);
  const midDay = (t) => fix(12 - sunPos(jDate + t).eqt, 24);
  const angleTime = (angle, t, ccw) => {
    const decl = sunPos(jDate + t).decl;
    const noon = midDay(t);
    const v = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    const tt = acos(Math.max(-1, Math.min(1, v))) / 15;
    return noon + (ccw ? -tt : tt);
  };
  const asrTime = (factor, t) => {
    const decl = sunPos(jDate + t).decl;
    return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t, false);
  };

  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    const p = (k) => t[k] / 24;
    t = {
      fajr: angleTime(fajrAngle, p('fajr'), true),
      sunrise: angleTime(0.833, p('sunrise'), true),
      dhuhr: midDay(p('dhuhr')),
      asr: asrTime(1, p('asr')),
      sunset: angleTime(0.833, p('sunset'), false),
      isha: angleTime(ishaAngle, p('isha'), false),
    };
  }
  // local-mean-solar hours -> UTC -> device local time (DST handled by the device)
  const base = Date.UTC(y, m - 1, d);
  const toDate = (h) => new Date(base + Math.round((h - lng / 15) * 60) * 60000);
  return {
    fajr: toDate(t.fajr), sunrise: toDate(t.sunrise), dhuhr: toDate(t.dhuhr),
    asr: toDate(t.asr), maghrib: toDate(t.sunset), isha: toDate(t.isha),
  };
}

export const CITIES = [
  { name: 'بني سويف', lat: 29.0661, lng: 31.0994 },
  { name: 'القاهرة', lat: 30.0444, lng: 31.2357 },
  { name: 'الجيزة', lat: 30.0131, lng: 31.2089 },
  { name: 'الفيوم', lat: 29.3084, lng: 30.8428 },
  { name: 'المنيا', lat: 28.0871, lng: 30.7618 },
  { name: 'الإسكندرية', lat: 31.2001, lng: 29.9187 },
  { name: 'أسيوط', lat: 27.1783, lng: 31.1859 },
];
