// 課題トラッカーのクラウド保存API
const ALLOWED_ORIGIN = 'https://my-assignment-37i.pages.dev';
const KEY = 'tasks';

// ---------- 夜の未達成通知（Discord） ----------
// 日付はすべて日本時間（JST）で扱う
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (s, n) => new Date(toDate(s) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const dayStart = t => Math.max(t.start, t.day?.date === today() ? Math.min(t.day.from, t.current) : t.current);
// ↓ index.html の makePlan / todayInfo と同じ計算
function makePlan(t) {
  const now = today(), days = new Map(), base = dayStart(t), total = t.end - base + 1;
  const limit = [t.goal, t.due].find(d => d && d >= now), late = !limit && !!(t.goal || t.due);
  if (total <= 0 || (!limit && !late)) return { days, short: 0, late: false };
  const span = late ? 1 : Math.min(1000, daysBetween(now, limit) + 1), list = Array.from({ length: span }, (_, i) => addDays(now, i));
  const fixed = d => late ? undefined : t.manual?.[d];
  let rest = Math.max(0, total - list.reduce((a, d) => a + (fixed(d) ?? 0), 0)), free = list.filter(d => fixed(d) === undefined).length, pos = base;
  for (const d of list) {
    let q = fixed(d); const manual = q !== undefined;
    if (!manual) { q = Math.ceil(rest / free); rest -= q; free--; }
    q = Math.max(0, Math.min(q, t.end - pos + 1)); days.set(d, { count: q, from: pos, to: pos + q - 1, manual }); pos += q;
  }
  return { days, short: t.end - pos + 1, late };
}
function todayInfo(t) {
  const p = makePlan(t).days.get(today());
  if (!p) return null;
  return { ...p, done: Math.max(0, Math.min(p.count, t.current - p.from)) };
}
const nm = t => `${t.book} ${t.name}`;
const rangeOf = (from, to) => from === to ? `${from}番` : `${from}〜${to}番`;
const dateText = s => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}(${'日月火水木金土'[new Date(toDate(s)).getUTCDay()]})`;
const jstHour = () => new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
// 実行時刻（日本時間）で種類を決める：〜11時=朝、12〜20時=夜の催促、21時〜=夜の結果
const kindNow = () => { const h = jstHour(); return h < 12 ? 'morning' : h < 21 ? 'evening' : 'night'; };

// 今日の目標と、今日解いた分を集計
function collect(tasks) {
  const goals = [], solved = [];
  for (const t of tasks) {
    if (t.cleared) continue;
    const p = todayInfo(t);
    if (p && p.count) goals.push({ t, p, left: p.count - p.done });
    if (t.day?.date === today()) {
      const from = t.day.from, to = Math.min(t.end, t.current - 1);
      if (to >= from) solved.push({ t, from, to, n: to - from + 1 });
    }
  }
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  return { goals, solved, goal: sum(goals, g => g.p.count), left: sum(goals, g => g.left), done: sum(solved, s => s.n) };
}

function buildMessage(kind, tasks, force) {
  const c = collect(tasks);
  const leftLines = c.goals.filter(g => g.left > 0).map(g => `・${nm(g.t)}：あと${g.left}問（${rangeOf(g.p.from + g.p.done, g.p.to)}）`);

  if (kind === 'morning') {
    const parts = [];
    if (c.goal > 0) {
      const lines = c.goals.map(g => `・${nm(g.t)}：${g.p.count}問（${rangeOf(g.p.from, g.p.to)}）`);
      parts.push(`☀️ おはようございます。今日の目標は合計${c.goal}問です。\n${lines.join('\n')}`);
    }
    // 提出期限が近い課題
    const now = today(), groups = { 0: [], 1: [], 7: [] };
    for (const t of tasks) {
      if (t.cleared || !t.due) continue;
      const remain = Math.max(0, t.end - Math.max(t.start, t.current) + 1);
      if (!remain) continue;
      const n = daysBetween(now, t.due);
      const key = n === 0 ? 0 : n === 1 ? 1 : n >= 2 && n <= 7 ? 7 : null;
      if (key === null) continue;
      groups[key].push({ t, n, remain, line: `・${nm(t)}（${dateText(t.due)}${t.dueTime ? ' ' + t.dueTime : ''}${key === 7 ? `・${n}日後` : ''}）残り${remain}問` });
    }
    const titles = { 0: '🚨 今日提出期限の課題があります！', 1: '⚠️ 明日提出期限の課題があります！', 7: '📅 7日以内に提出期限の課題があります！' };
    for (const k of [0, 1, 7]) {
      if (groups[k].length) parts.push(`${titles[k]}\n${groups[k].sort((x, y) => x.n - y.n).map(x => x.line).join('\n')}`);
    }
    if (parts.length) return parts.join('\n\n');
    return force ? '【テスト送信】今日の目標も、近い提出期限もありません。' : null;
  }

  if (kind === 'evening') {
    if (c.left > 0) return `今日の目標が達成されていません。あと${c.left}問で達成されます。\n${leftLines.join('\n')}`;
    return force ? (c.goal ? '【テスト送信】今日の目標は達成済みです。' : '【テスト送信】今日の目標はありません。') : null;
  }

  // night：1日の結果
  if (!c.goals.length && !c.solved.length) return force ? '【テスト送信】今日の目標も記録もありません。' : null;
  const doneLines = c.solved.map(s => `・${nm(s.t)}：${s.n}問（${rangeOf(s.from, s.to)}）`).join('\n');
  if (c.done > 0 && c.left === 0) {
    return `🎉 今日は目標を達成しました！お疲れさまでした。\n今日の成果：合計${c.done}問\n${doneLines}`;
  }
  if (c.done > 0) {
    return `今日は合計${c.done}問を達成しました。目標まではあと${c.left}問でした。\n${doneLines}\n\n未達成の分は、明日以降の目標に自動で配り直されます。`;
  }
  return `今日は何も達成できませんでした。\n未達成の${c.left}問は、明日以降の目標に自動で配り直されます。無理のない範囲で、明日また進めましょう。`;
}

async function notify(env, kind, force = false) {
  if (!env.DISCORD_WEBHOOK) return { ok: false, error: 'DISCORD_WEBHOOKが設定されていません' };
  const tasks = (await env.TASKS_KV.get(KEY, 'json')) || [];
  const content = buildMessage(kind, tasks, force);
  if (!content) return { ok: true, sent: false };
  const res = await fetch(env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }) });
  return res.ok ? { ok: true, sent: true } : { ok: false, error: `Discordへの送信に失敗しました（${res.status}）` };
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    const reply = (data, status = 200) =>
      Response.json(data, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });

    // ブラウザが本番の通信前に送る確認
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;
    if (path !== '/api/tasks' && path !== '/api/notify') return reply({ error: 'URLが違います' }, 404);
    if (!env.API_TOKEN) return reply({ error: 'WorkerにAPI_TOKENが設定されていません' }, 500);
    if (!env.TASKS_KV) return reply({ error: 'WorkerにTASKS_KVが接続されていません' }, 500);
    if (request.headers.get('Authorization') !== `Bearer ${env.API_TOKEN}`) {
      return reply({ error: 'アクセスキーが違います' }, 401);
    }

    // 今すぐ通知を試す（POST /api/notify）
    if (path === '/api/notify') {
      if (request.method !== 'POST') return reply({ error: '使えない操作です' }, 405);
      const kind = new URL(request.url).searchParams.get('kind') || 'evening';
      if (!['morning', 'evening', 'night'].includes(kind)) return reply({ error: 'kindはmorning / evening / nightのどれかです' }, 400);
      const r = await notify(env, kind, true);
      return reply(r, r.ok ? 200 : 500);
    }

    if (request.method === 'GET') {
      return reply({ tasks: await env.TASKS_KV.get(KEY, 'json'), materials: await env.TASKS_KV.get('materials', 'json') });
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!Array.isArray(body?.tasks)) return reply({ error: '課題データの形式が違います' }, 400);
      await env.TASKS_KV.put(KEY, JSON.stringify(body.tasks));
      if (Array.isArray(body.materials)) await env.TASKS_KV.put('materials', JSON.stringify(body.materials));
      return reply({ ok: true });
    }
    return reply({ error: '使えない操作です' }, 405);
  },

  // Cron Triggerから毎日呼ばれる
  async scheduled(event, env, ctx) {
    ctx.waitUntil(notify(env, kindNow()).then(r => { if (!r.ok) console.error(r.error); }));
  },
};
