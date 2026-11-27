// 課題トラッカー用クラウド保存API（Cloudflare Workers + KV）
// 必要な設定：KVバインディング TRACKER_KV ／ シークレット API_TOKEN
const KEY = 'tasks';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
};

const reply = (data, status = 200) => Response.json(data, { status, headers: HEADERS });

export default {
  async fetch(request, env) {
    // ブラウザが本番の通信前に送る確認リクエスト
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });

    if (new URL(request.url).pathname !== '/api/tasks') return reply({ error: 'URLが違います' }, 404);

    if (!env.API_TOKEN) return reply({ error: 'API_TOKENが未設定です' }, 500);
    if (!env.TRACKER_KV) return reply({ error: 'TRACKER_KVが未設定です' }, 500);
    if (request.headers.get('Authorization') !== `Bearer ${env.API_TOKEN}`) {
      return reply({ error: 'アクセスキーが違います' }, 401);
    }

    if (request.method === 'GET') {
      const saved = await env.TRACKER_KV.get(KEY, 'json');
      return reply(saved ?? { tasks: null });
    }

    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > 500_000) return reply({ error: 'データが大きすぎます' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return reply({ error: 'JSONの形式が正しくありません' }, 400); }
      if (!Array.isArray(body?.tasks)) return reply({ error: 'tasksがありません' }, 400);
      // 日付や計画などの項目も、そのまま保存する
      await env.TRACKER_KV.put(KEY, JSON.stringify({ tasks: body.tasks, updatedAt: new Date().toISOString() }));
      return reply({ ok: true });
    }

    return reply({ error: '未対応の操作です' }, 405);
  },
};
