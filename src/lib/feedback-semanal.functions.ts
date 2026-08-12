import { createServerFn } from "@tanstack/react-start";

const CMS = ["Alicia Prieto", "Alexandra Salas"] as const;

export const listProyectos = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("proyectos")
    .select("id, nombre, pais, community_manager")
    .order("nombre", { ascending: true });
  if (error) throw new Error(error.message);
  return { proyectos: rows ?? [] };
});

export const guardarFeedbackSemanal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as {
      community_manager?: string;
      semana?: string;
      feedbacks?: Array<{ proyecto_id: string; proyecto_nombre: string; feedback: string }>;
    };
    if (!d?.community_manager || !CMS.includes(d.community_manager as (typeof CMS)[number])) {
      throw new Error("Community manager inválido");
    }
    if (!Array.isArray(d.feedbacks) || d.feedbacks.length === 0) {
      throw new Error("Sin feedback para enviar");
    }
    const feedbacks = d.feedbacks
      .filter((x) => x && typeof x.proyecto_id === "string" && typeof x.feedback === "string" && x.feedback.trim().length > 0)
      .map((x) => ({
        proyecto_id: x.proyecto_id,
        proyecto_nombre: String(x.proyecto_nombre ?? ""),
        feedback: x.feedback.trim(),
      }));
    if (feedbacks.length === 0) throw new Error("Sin feedback para enviar");
    return {
      community_manager: d.community_manager,
      semana: d.semana || new Date().toISOString().slice(0, 10),
      feedbacks,
    };
  })
  .handler(async ({ data }) => {
    const payload = {
      community_manager: data.community_manager,
      semana: data.semana,
      feedbacks: data.feedbacks,
    };
    const res = await fetch("https://n8n-m0b3.onrender.com/webhook/feedback-semanal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);

    const parsed = parseRaw(text);
    const resultados = findResultados(parsed);
    const proyectoIds = new Set(data.feedbacks.map((f) => f.proyecto_id));

    const rows: Array<{
      proyecto_id: string;
      clave: string;
      valor: string;
      fuente: string;
      community_manager: string;
    }> = [];

    for (const r of resultados) {
      const pid = String(r?.proyecto_id ?? "");
      if (!proyectoIds.has(pid)) continue;
      const clasificaciones = Array.isArray(r?.clasificaciones) ? r.clasificaciones : [];
      for (const c of clasificaciones) {
        const clave = String(c?.clave ?? "").trim().toLowerCase();
        const valor = String(c?.valor ?? "").trim();
        if (!clave || !valor) continue;
        rows.push({
          proyecto_id: pid,
          clave,
          valor,
          fuente: "feedback-semanal",
          community_manager: data.community_manager,
        });
      }
    }

    let insertadas = 0;
    if (rows.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("memoria_cliente").insert(rows);
      if (error) throw new Error(`No se pudo guardar en memoria: ${error.message}`);
      insertadas = rows.length;
    }

    return { ok: true, enviados: data.feedbacks.length, insertadas, raw: text };
  });

function parseRaw(text: string): any {
  let t = (text ?? "").trim().replace(/^=+\s*/, "");
  for (let i = 0; i < 3; i++) {
    try {
      const p = JSON.parse(t);
      if (typeof p === "string") {
        t = p.trim().replace(/^=+\s*/, "");
        continue;
      }
      return p;
    } catch {
      return null;
    }
  }
  return null;
}

function findResultados(node: any, depth = 0): any[] {
  if (!node || depth > 6) return [];
  if (Array.isArray(node)) {
    if (node.some((x) => x && typeof x === "object" && ("clasificaciones" in x || "proyecto_id" in x))) {
      return node;
    }
    for (const item of node) {
      const found = findResultados(item, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof node === "object") {
    if (Array.isArray(node.resultados)) return findResultados(node.resultados, depth + 1);
    for (const v of Object.values(node)) {
      const found = findResultados(v, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}
