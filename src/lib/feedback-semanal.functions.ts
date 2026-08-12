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
      .filter(
        (x) =>
          x &&
          typeof x.proyecto_id === "string" &&
          typeof x.feedback === "string" &&
          x.feedback.trim().length > 0,
      )
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
    const res = await fetch("https://n8n-m0b3.onrender.com/webhook/feedback-semanal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        community_manager: data.community_manager,
        semana: data.semana,
        feedbacks: data.feedbacks,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
    return { ok: true, enviados: data.feedbacks.length, raw: text };
  });

/** Fallback insert for the public page, where anon has no RLS access to memoria_cliente. */
export const insertarMemoriaDesdeFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as {
      community_manager?: string;
      rows?: Array<{ proyecto_id: string; clave: string; valor: string }>;
    };
    if (!d?.community_manager || !CMS.includes(d.community_manager as (typeof CMS)[number])) {
      throw new Error("Community manager inválido");
    }
    const rows = (Array.isArray(d.rows) ? d.rows : [])
      .filter(
        (r) =>
          r &&
          typeof r.proyecto_id === "string" &&
          String(r.clave ?? "").trim().length > 0 &&
          String(r.valor ?? "").trim().length > 0,
      )
      .slice(0, 200)
      .map((r) => ({
        proyecto_id: r.proyecto_id,
        clave: String(r.clave).trim().toLowerCase(),
        valor: String(r.valor).trim().slice(0, 2000),
      }));
    if (rows.length === 0) throw new Error("Sin clasificaciones para guardar");
    return { community_manager: d.community_manager, rows };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set(data.rows.map((r) => r.proyecto_id)));
    const { data: proyectos, error: pErr } = await supabaseAdmin
      .from("proyectos")
      .select("id")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);
    const valid = new Set((proyectos ?? []).map((p) => p.id));
    const rows = data.rows
      .filter((r) => valid.has(r.proyecto_id))
      .map((r) => ({ ...r, fuente: "feedback-semanal", community_manager: data.community_manager }));
    if (rows.length === 0) throw new Error("Proyectos inválidos");
    const { error } = await supabaseAdmin.from("memoria_cliente").insert(rows);
    if (error) throw new Error(`No se pudo guardar en memoria: ${error.message}`);
    return { insertadas: rows.length };
  });
