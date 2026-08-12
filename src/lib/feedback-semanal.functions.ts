import { createServerFn } from "@tanstack/react-start";
import { parseRaw, findResultados } from "./feedback-semanal.server";

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
