// Sample data for the public demo (app/demo/). Generic on purpose: nothing from the real account.
import * as db from './db.js';
import * as M from './model.js';
import { shiftKey, nowISO, pad } from './util.js';
import { PRAYERS } from './prayer.js';

export function seedDemo() {
  if (db.get('demo:seeded')) return;
  const k = M.today();
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

  M.saveSettings({ city: 'القاهرة', lat: 30.0444, lng: 31.2357, sleepFrom: '00:00', sleepTo: '07:00', dayStartHour: 3, level: 4 });

  const T = [
    ['t_quran', { name: 'القرآن', icon: 'book', type: 'count', unit: 'صفحة', target: 4, period: 'day', note: 'الورد' }],
    ['t_study', { name: 'مذاكرة', icon: 'school', type: 'duration', unit: 'دقيقة', target: 45, period: 'day', note: 'كورس أونلاين' }],
    ['t_water', { name: 'مية', icon: 'droplet', type: 'count', unit: 'كوباية', target: 8, period: 'day' }],
    ['t_read', { name: 'قراية', icon: 'pen', type: 'count', unit: 'صفحة', target: 10, period: 'day', note: 'كتاب الشهر' }],
    ['t_sport', { name: 'رياضة', icon: 'activity', type: 'check', target: 4, period: 'week' }],
    ['t_sleep', { name: 'النوم', icon: 'moon', type: 'sleep', target: '07:00', period: 'day', note: 'ميعاد الصحيان المستهدف' }],
    ['t_screen', { name: 'الموبايل', icon: 'phone', type: 'number', unit: 'دقيقة', target: 180, period: 'day', lowerIsBetter: true }],
    ['t_money', { name: 'المصاريف', icon: 'wallet', type: 'money', unit: 'ج', target: 0, period: 'day' }],
  ];
  T.forEach(([id, d], i) => db.put('tracker', id, { ...d, order: i }));

  // the last 9 days
  for (let i = 9; i >= 1; i--) {
    const d = shiftKey(k, -i);
    PRAYERS.forEach((p) => { if (rnd() < (p.key === 'fajr' ? 0.65 : 0.9)) M.setPrayer(d, p.key, true); });
    M.setEntry('t_quran', d, pick([2, 3, 4, 4, 5]));
    M.setEntry('t_study', d, pick([0, 30, 45, 45, 60]));
    M.setEntry('t_water', d, pick([4, 5, 6, 7, 8, 9]));
    M.setEntry('t_read', d, pick([0, 8, 10, 12, 15]));
    if ([1, 3, 4, 6, 8].includes(i)) M.setEntry('t_sport', d, 1);
    M.setEntry('t_sleep', d, { slept: pick(['23:30', '00:00', '00:30', '01:15']), woke: pick(['06:40', '07:00', '07:20', '08:00']) });
    M.setEntry('t_screen', d, pick([150, 175, 190, 210, 240]));
    M.addExpense({ tracker: 't_money', amount: pick([35, 60, 85, 120]), category: 'أكل', note: '', date: d });
    if (rnd() < 0.5) M.addExpense({ tracker: 't_money', amount: pick([20, 40, 150]), category: pick(['مواصلات', 'خروج', 'شحن ونت']), note: '', date: d });
  }

  // today: some done, some still open
  const passed = M.prayerDay(k).filter((p) => p.time <= new Date());
  passed.slice(0, Math.max(0, passed.length - 1)).forEach((p) => M.setPrayer(k, p.key, true));
  M.setEntry('t_quran', k, 2);
  M.setEntry('t_water', k, 5);
  M.setEntry('t_study', k, 20);
  M.setEntry('t_sleep', k, { slept: '00:30', woke: '07:10' });
  M.setEntry('t_screen', k, 95);
  M.addExpense({ tracker: 't_money', amount: 45, category: 'أكل', note: 'فطار', date: k });

  // week schedule: work Sunday to Thursday
  M.weekKeys(k).forEach((d, i) => M.setShift(d, i === 0 || i === 6 ? { off: true } : { start: '09:00', end: '17:00' }));

  // tasks
  const t1 = M.addTask({ title: 'ابعت التقرير الأسبوعي للمدير', date: k, area: 'الشغل' });
  const t2 = M.addTask({ title: 'اتمرّن 30 دقيقة', date: k, time: '18:30', area: 'عام' });
  const t3 = M.addTask({ title: 'ذاكر الفصل التالت', date: k, area: 'عام' });
  [t1, t2, t3].forEach((id) => M.setTop3(id, k));
  M.toggleTask(t3);
  const t4 = M.addTask({ title: 'ادفع فاتورة الكهربا', date: k, area: 'البيت' });
  M.toggleTask(t4);
  M.addTask({ title: 'اشتري هدية لماما', date: k, time: '19:00', area: 'البيت' });
  M.addTask({ title: 'رد على إيميل الجامعة', date: shiftKey(k, -1), area: 'عام' });
  M.addTask({ title: 'حجز عند دكتور الأسنان', date: shiftKey(k, 1), time: '17:00', area: 'عام' });
  M.addTask({ title: 'اتعلّم Excel', date: null, area: 'الشغل' });

  // goals
  db.put('goal', 'g_prayer', { title: 'أنتظم في الصلاة', tracker: 'prayer', target: 35, order: 0 });
  db.put('goal', 'g_quran', { title: 'أختم القرآن في شهرين', tracker: 't_quran', target: 28, order: 1, why: '4 صفحات كل يوم' });
  db.put('goal', 'g_sport', { title: 'أتمرّن 4 مرات في الأسبوع', tracker: 't_sport', target: 4, order: 2 });

  // a sample review from Claude
  const y = shiftKey(k, -1);
  db.put('report', `r:${y}:night`, {
    type: 'night', date: y, created_at: ago(600),
    verdict: 'يوم متوازن: الصلاة كاملة والمية قربت من الهدف، بس المذاكرة اتأجلت لآخر اليوم ومتعملتش.',
    stats: [{ label: 'الصلاة', value: '5/5' }, { label: 'القرآن', value: '4 ص' }, { label: 'مذاكرة', value: '0 د' }, { label: 'نوم', value: '7.2' }],
    insights: [
      'الأيام اللي صحيت فيها قبل 7، ذاكرت فيها 45 دقيقة في المتوسط.',
      'الموبايل كان 4 ساعات امبارح، ساعة أكتر من المعدل.',
      'المية وصلت 8 كوبايات 3 أيام بس من 7.',
    ],
    plan: ['مذاكرة 45 دقيقة الساعة 10 الصبح', 'ابعت التقرير قبل الضهر', 'رياضة 30 دقيقة بعد الشغل'],
  });
  db.put('suggestion', `s:${y}:night:1`, { title: 'خلّي المذاكرة الصبح الساعة 10', why: 'اتعملت 4 مرات من 5 لما كانت قبل الضهر', status: 'pending', created_at: ago(600), action: { type: 'update_tracker', tracker: 't_study', patch: { remind: '10:00' } } });
  db.put('suggestion', `s:${y}:night:2`, { title: 'زوّد القراية لـ 15 صفحة', why: 'عدّيت 10 صفحات 6 أيام من 7', status: 'pending', created_at: ago(600), action: { type: 'set_target', tracker: 't_read', target: 15 } });

  // a voice note Claude already applied, and one idea waiting
  db.put('inbox', 'i_demo1', { text: 'قريت صفحتين قرآن وشربت 3 كوبايات مية ولعبت رياضة', source: 'voice', created_at: ago(90), processed: true, processed_at: ago(40), result: 'قرآن +2 صفحة · مية +3 · رياضة ✓' });
  db.put('inbox', 'i_demo2', { text: 'فكرة: أعمل جدول مذاكرة للأسبوع الجاي', source: 'text', created_at: ago(25), processed: false });

  db.put('meta', 'demo:seeded', { at: nowISO(), v: `${pad(1)}` });
}
