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
    return { ok: true, enviados: data.feedbacks.length, raw: text };
  });
