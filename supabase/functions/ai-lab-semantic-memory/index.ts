import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// The native embedding model runs inside Supabase. There is no external LLM call.
// All database requests use the caller's JWT and existing Super Admin RLS.
const model = new Supabase.ai.Session("gte-small");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

function containsPersonalIdentifiers(text: string): boolean {
  return /@|\bUK\d{8,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{13,}\b|\b\+?\d{10,}\b/i.test(text);
}

function noteIsGeneral(text: string): boolean {
  return text.length >= 10 && text.length <= 350 && !containsPersonalIdentifiers(text);
}

async function embed(text: string): Promise<string> {
  const output = await model.run(text, { mean_pool: true, normalize: true });
  const values = Array.from(output as number[]);
  if (values.length !== 384 || values.some(value => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Embedding model returned an invalid vector");
  }
  return JSON.stringify(values);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Authorisation required" }, 401);
  const endpoint = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!endpoint || !anonKey) return json({ error: "Memory service is not configured" }, 503);
  if (Number(req.headers.get("content-length") || 0) > 3000) return json({ error: "Request too large" }, 413);

  try {
    const client = createClient(endpoint, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await client.auth.getUser(auth.slice(7));
    if (userError || !user) return json({ error: "Session expired" }, 401);
    const { data: admin, error: adminError } = await client.rpc("is_platform_admin");
    if (adminError || admin !== true) return json({ error: "Super Admin only" }, 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid request" }, 400);

    if (body.action === "index") {
      const id = typeof body.lessonId === "string" ? body.lessonId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return json({ error: "Invalid approved lesson ID" }, 400);
      }
      const { data: note, error: readError } = await client.from("ai_lab_learning_notes")
        .select("id,lesson").eq("id", id).eq("user_id", user.id).single();
      if (readError || !note || !noteIsGeneral(note.lesson)) return json({ error: "Approved general lesson unavailable" }, 404);
      const vector = await embed(note.lesson);
      // A note can be removed while embedding is running; this update then affects zero rows.
      const { data: indexed, error: updateError } = await client.from("ai_lab_learning_notes")
        .update({ embedding: vector }).eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
      if (updateError) return json({ error: "Unable to index approved lesson" }, 503);
      return json({ indexed: Boolean(indexed) });
    }

    if (body.action === "search") {
      const query = typeof body.query === "string" ? body.query.trim().replace(/\s+/g, " ") : "";
      if (body.site != null && (typeof body.site !== "string" || !/^[A-Z0-9]{3,6}$/.test(body.site))) {
        return json({ error: "Invalid station selection" }, 400);
      }
      const site = body.site || null;
      if (query.length < 3 || query.length > 160) return json({ error: "Query must be 3–160 characters" }, 400);
      if (containsPersonalIdentifiers(query)) return json({ error: "Do not search personal identifiers" }, 400);
      const vector = await embed(query);
      const { data, error: searchError } = await client.rpc("ai_lab_semantic_notes", {
        query_embedding: vector, filter_site: site, max_results: 8,
      });
      if (searchError) return json({ error: "Semantic search is temporarily unavailable" }, 503);
      return json({ matches: (data || []).filter((item: { similarity: number }) => item.similarity >= 0.35)
        .map((item: { id: string; site: string | null; lesson: string; similarity: number }) => ({
          id: item.id, site: item.site || "General", lesson: item.lesson,
          similarity: Math.round(item.similarity * 1000) / 1000,
        })) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch {
    return json({ error: "Semantic memory temporarily unavailable; keyword search remains active" }, 503);
  }
});
