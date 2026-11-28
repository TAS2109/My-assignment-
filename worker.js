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

function buildMessage(kind, tasks, force, streak = 0) {
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
    return `🎉 今日は目標を達成しました！お疲れさまでした。${streak > 0 ? `\n🔥 ${streak}日連続達成！` : ''}\n今日の成果：合計${c.done}問\n${doneLines}`;
  }
  if (c.done > 0) {
    return `今日は合計${c.done}問を達成しました。目標まではあと${c.left}問でした。\n${doneLines}\n\n未達成の分は、明日以降の目標に自動で配り直されます。`;
  }
  return `今日は何も達成できませんでした。\n未達成の${c.left}問は、明日以降の目標に自動で配り直されます。無理のない範囲で、明日また進めましょう。`;
}


// ---------- 連続達成日数（ストリーク） ----------
// 夜22時の通知時に「今日の結果」をKVの 'streak' に記録する（1=達成 / 0=未達成）。
// 目標も記録もない日は記録せず、連続は途切れない（数にも入らない）。未達成の日で途切れる。
const STREAK_KEEP = 400;
function streakCount(days) {
  let n = 0, d = today();
  for (let i = 0; i < STREAK_KEEP; i++, d = addDays(d, -1)) {
    if (days[d] === 1) n++; else if (days[d] === 0) break;
  }
  return n;
}
// save=false（テスト送信）のときは保存せず、「今日の結果を入れたら何日か」だけ返す
async function updateStreak(env, tasks, save) {
  const rec = (await env.TASKS_KV.get('streak', 'json')) || {};
  const days = { ...(rec.days || {}) };
  const c = collect(tasks);
  if (c.done > 0 && c.left === 0) days[today()] = 1;
  else if (c.left > 0) days[today()] = 0;
  if (save) {
    const keep = Object.keys(days).sort().slice(-STREAK_KEEP);
    await env.TASKS_KV.put('streak', JSON.stringify({ days: Object.fromEntries(keep.map(k => [k, days[k]])) }));
  }
  return streakCount(days);
}

async function notify(env, kind, force = false) {
  if (!env.DISCORD_WEBHOOK) return { ok: false, error: 'DISCORD_WEBHOOKが設定されていません' };
  const tasks = (await env.TASKS_KV.get(KEY, 'json')) || [];
  const streak = kind === 'night' ? await updateStreak(env, tasks, !force).catch(() => 0) : 0;
  const content = buildMessage(kind, tasks, force, streak);
  if (!content) return { ok: true, sent: false };
  const res = await fetch(env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }) });
  return res.ok ? { ok: true, sent: true } : { ok: false, error: `Discordへの送信に失敗しました（${res.status}）` };
}

// ---------- 版管理とバックアップ ----------
// rev：保存のたびに +1 する番号。古い端末からの上書きを検出するために使う
const BACKUP_GAP = 3 * 3600 * 1000; // 自動バックアップは最短3時間おき
const BACKUP_KEEP = 60;             // 残すバックアップの数（古いものから削除）
const getRev = async env => Number(await env.TASKS_KV.get('rev')) || 0;
const jstStamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 23); // 例 2026-11-28T22:00:05.123（同時刻でも上書きしないようミリ秒まで）
const hashOf = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h); };
const doneOf = tasks => tasks.reduce((a, t) => {
  const v = Math.min(Math.max(0, t.end - t.start + 1), Math.max(0, t.current - t.start));
  return a + (Number.isFinite(v) ? v : 0);
}, 0);

// 今のクラウドの内容をバックアップに残す。force=true なら3時間の間隔を無視（上書き・復元の直前用）
// 前回のバックアップと内容が同じなら作らない
async function backup(env, force = false) {
  const tasks = await env.TASKS_KV.get(KEY, 'json');
  if (!Array.isArray(tasks)) return null;
  const last = (await env.TASKS_KV.get('backup-last', 'json')) || {};
  if (!force && Date.now() - (last.t || 0) < BACKUP_GAP) return null;
  const materials = await env.TASKS_KV.get('materials', 'json');
  const hash = hashOf(JSON.stringify([tasks, materials]));
  if (hash === last.hash) return null;
  const key = `backup:${jstStamp()}`;
  await env.TASKS_KV.put(key, JSON.stringify({ tasks, materials, rev: await getRev(env), savedAt: new Date().toISOString() }),
    { metadata: { n: tasks.length, done: doneOf(tasks) } });
  await env.TASKS_KV.put('backup-last', JSON.stringify({ t: Date.now(), hash }));
  const { keys } = await env.TASKS_KV.list({ prefix: 'backup:' });
  await Promise.all(keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP)).map(k => env.TASKS_KV.delete(k.name)));
  return key;
}

// ---------- タイマーの記録（追記専用。日時をキーにまとめるので端末間で衝突しない） ----------
const HIST_MAX = 5000;
function cleanEntry(e) {
  if (!e || ![e.date, e.count, e.total, e.target].every(Number.isFinite)) return null;
  const parts = (Array.isArray(e.parts) ? e.parts : []).slice(0, 30)
    .filter(p => p && typeof p.label === 'string' && Number.isFinite(p.n))
    .map(p => ({ label: p.label.slice(0, 100), n: Math.max(0, Math.floor(p.n)) }));
  return { date: Math.floor(e.date), title: String(e.title ?? '').slice(0, 300), count: Math.max(0, Math.floor(e.count)),
    total: Math.max(0, Math.round(e.total)), target: Math.max(0, Math.round(e.target)), parts };
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
    if (!['/api/tasks', '/api/notify', '/api/backups', '/api/restore', '/api/history'].includes(path)) return reply({ error: 'URLが違います' }, 404);
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

    // タイマー記録（GET：全件 / POST：{entries:[...]} を追加。同じ日時は上書き）
    if (path === '/api/history') {
      const cur = (await env.TASKS_KV.get('history', 'json')) || [];
      if (request.method === 'GET') return reply({ history: cur });
      if (request.method !== 'POST') return reply({ error: '使えない操作です' }, 405);
      const body = await request.json().catch(() => null);
      if (!Array.isArray(body?.entries) || body.entries.length > 200) return reply({ error: '記録データの形式が違います' }, 400);
      const map = new Map(cur.map(h => [h.date, h]));
      for (const e of body.entries) { const c = cleanEntry(e); if (c) map.set(c.date, c); }
      const list = [...map.values()].sort((a, b) => b.date - a.date).slice(0, HIST_MAX);
      await env.TASKS_KV.put('history', JSON.stringify(list));
      return reply({ ok: true, count: list.length });
    }

    // バックアップ一覧（GET /api/backups）：新しい順
    if (path === '/api/backups') {
      if (request.method !== 'GET') return reply({ error: '使えない操作です' }, 405);
      const { keys } = await env.TASKS_KV.list({ prefix: 'backup:' });
      return reply({ backups: keys.map(k => ({ key: k.name, ...(k.metadata || {}) })).reverse() });
    }

    // バックアップから復元（POST /api/restore?key=backup:...）。復元前の内容もバックアップに残す
    if (path === '/api/restore') {
      if (request.method !== 'POST') return reply({ error: '使えない操作です' }, 405);
      const key = new URL(request.url).searchParams.get('key') || '';
      if (!key.startsWith('backup:')) return reply({ error: 'バックアップの指定が違います' }, 400);
      const snap = await env.TASKS_KV.get(key, 'json');
      if (!Array.isArray(snap?.tasks)) return reply({ error: 'そのバックアップは見つかりません' }, 404);
      await backup(env, true);
      await env.TASKS_KV.put(KEY, JSON.stringify(snap.tasks));
      if (Array.isArray(snap.materials)) await env.TASKS_KV.put('materials', JSON.stringify(snap.materials));
      const rev = (await getRev(env)) + 1;
      await env.TASKS_KV.put('rev', String(rev));
      return reply({ ok: true, rev });
    }

    if (request.method === 'GET') {
      return reply({ tasks: await env.TASKS_KV.get(KEY, 'json'), materials: await env.TASKS_KV.get('materials', 'json'), rev: await getRev(env) });
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!Array.isArray(body?.tasks)) return reply({ error: '課題データの形式が違います' }, 400);
      // 端末が最後に見た版と、クラウドの今の版が違えば、他の端末が先に保存している
      const cur = await getRev(env);
      if (!body.force && Number.isInteger(body.baseRev) && body.baseRev !== cur) {
        return reply({ error: '他の端末でより新しい変更が保存されています', conflict: true, rev: cur }, 409);
      }
      await backup(env, !!body.force); // 書き換える前の内容を残す（上書き時は必ず）
      await env.TASKS_KV.put(KEY, JSON.stringify(body.tasks));
      if (Array.isArray(body.materials)) {
        const next = JSON.stringify(body.materials);
        if (next !== JSON.stringify(await env.TASKS_KV.get('materials', 'json'))) await env.TASKS_KV.put('materials', next);
      }
      const rev = cur + 1;
      await env.TASKS_KV.put('rev', String(rev));
      return reply({ ok: true, rev });
    }
    return reply({ error: '使えない操作です' }, 405);
  },

  // Cron Triggerから毎日呼ばれる
  async scheduled(event, env, ctx) {
    ctx.waitUntil(backup(env).catch(e => console.error('backup', e)));
    ctx.waitUntil(notify(env, kindNow()).then(r => { if (!r.ok) console.error(r.error); }));
  },
};
