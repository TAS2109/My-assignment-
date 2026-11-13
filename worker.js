const corsHeaders = (origin, allowedOrigin) => ({
  "Access-Control-Allow-Origin": allowedOrigin === "*" ? "*" : allowedOrigin,
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin"
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const headers = corsHeaders(origin, allowedOrigin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (url.pathname !== "/api/tasks") return Response.json({ error: "Not found" }, { status: 404, headers });

    const auth = request.headers.get("Authorization") || "";
    if (!env.API_TOKEN || auth !== `Bearer ${env.API_TOKEN}`) {
      return Response.json({ error: "アクセスキーが正しくありません。" }, { status: 401, headers });
    }

    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT payload, updated_at FROM task_data WHERE id = 1").first();
      if (!row) return Response.json({ tasks: null, updatedAt: null }, { headers });
      return Response.json({ tasks: JSON.parse(row.payload), updatedAt: row.updated_at }, { headers });
    }

    if (request.method === "PUT") {
      let body;
      try { body = await request.json(); }
      catch { return Response.json({ error: "JSON形式のデータを送信してください。" }, { status: 400, headers }); }
      if (!Array.isArray(body.tasks) || body.tasks.length > 2000) {
        return Response.json({ error: "課題データの形式が正しくありません。" }, { status: 400, headers });
      }
      const payload = JSON.stringify(body.tasks);
      if (payload.length > 500000) return Response.json({ error: "データが大きすぎます。" }, { status: 413, headers });
      const updatedAt = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO task_data (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
      ).bind(payload, updatedAt).run();
      return Response.json({ ok: true, updatedAt }, { headers });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  }
};
