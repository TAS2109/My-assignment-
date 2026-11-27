// 課題トラッカーのクラウド保存API
const ALLOWED_ORIGIN = 'https://my-assignment-37i.pages.dev';
const KEY = 'tasks';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    const reply = (data, status = 200) =>
      Response.json(data, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });

    // ブラウザが本番の通信前に送る確認
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (new URL(request.url).pathname !== '/api/tasks') return reply({ error: 'URLが違います' }, 404);
    if (!env.API_TOKEN) return reply({ error: 'WorkerにAPI_TOKENが設定されていません' }, 500);
    if (!env.TASKS_KV) return reply({ error: 'WorkerにTASKS_KVが接続されていません' }, 500);
    if (request.headers.get('Authorization') !== `Bearer ${env.API_TOKEN}`) {
      return reply({ error: 'アクセスキーが違います' }, 401);
    }

    if (request.method === 'GET') {
      return reply({ tasks: await env.TASKS_KV.get(KEY, 'json') });
    }
    if (request.method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!Array.isArray(body?.tasks)) return reply({ error: '課題データの形式が違います' }, 400);
      await env.TASKS_KV.put(KEY, JSON.stringify(body.tasks));
      return reply({ ok: true });
    }
    return reply({ error: '使えない操作です' }, 405);
  },
};
