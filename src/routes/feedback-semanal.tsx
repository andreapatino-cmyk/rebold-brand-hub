import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Send, MessageSquare, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { buildMemoriaRows } from "@/lib/feedback-semanal.parse";
import {
  listProyectos,
  guardarFeedbackSemanal,
  insertarMemoriaDesdeFeedback,
} from "@/lib/feedback-semanal.functions";

export const Route = createFileRoute("/feedback-semanal")({
  head: () => ({
    meta: [
      { title: "Feedback semanal — Rebold" },
      { name: "description", content: "Registra el feedback semanal de tus clientes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedbackSemanalPage,
});

const CMS = ["Alicia Prieto", "Alexandra Salas"] as const;
type CM = (typeof CMS)[number];

type Proyecto = { id: string; nombre: string; pais: string | null; community_manager: string | null };

function FeedbackSemanalPage() {
  const listar = useServerFn(listProyectos);
  const guardar = useServerFn(guardarFeedbackSemanal);
  const insertarServidor = useServerFn(insertarMemoriaDesdeFeedback);

  const [cm, setCm] = useState<CM | "">("");
  const [semana, setSemana] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["feedback-semanal-proyectos"],
    queryFn: async () => {
      const r = await listar();
      return r.proyectos as Proyecto[];
    },
  });

  const proyectos = data ?? [];

  const setFB = (id: string, v: string) => setFeedbacks((c) => ({ ...c, [id]: v }));

  const enviar = async () => {
    if (!cm) return toast.error("Selecciona un community manager");
    const items = proyectos
      .map((p) => ({ proyecto_id: p.id, proyecto_nombre: p.nombre, feedback: (feedbacks[p.id] ?? "").trim() }))
      .filter((x) => x.feedback.length > 0);
    if (items.length === 0) return toast.error("Escribe feedback en al menos un proyecto");
    setEnviando(true);
    try {
      const r = await guardar({ data: { community_manager: cm, semana, feedbacks: items } });
      console.log("[feedback-semanal] raw webhook:", r.raw);

      const rows = buildMemoriaRows(r.raw, {
        community_manager: cm,
        proyectoIds: items.map((i) => i.proyecto_id),
      });

      let insertadas = 0;
      if (rows.length > 0) {
        // 1) Intento directo desde el cliente con el supabase client.
        const { error } = await supabase.from("memoria_cliente").insert(rows);
        if (error) {
          console.warn("[feedback-semanal] insert cliente falló, usando servidor:", error.message);
          // 2) Esta pantalla es pública (sin login): sin sesión, RLS bloquea el insert.
          const res = await insertarServidor({
            data: {
              community_manager: cm,
              rows: rows.map(({ proyecto_id, clave, valor }) => ({ proyecto_id, clave, valor })),
            },
          });
          insertadas = res.insertadas;
        } else {
          insertadas = rows.length;
          console.log("[feedback-semanal] insert cliente OK:", insertadas);
        }
      }

      toast.success(
        `Feedback enviado (${r.enviados} ${r.enviados === 1 ? "proyecto" : "proyectos"})` +
          (insertadas > 0
            ? ` · ${insertadas} entradas en memoria`
            : " · sin clasificaciones en la respuesta")
      );
      setFeedbacks({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setEnviando(false);
    }
  };

  const conFeedback = Object.values(feedbacks).filter((v) => v.trim().length > 0).length;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Rebold</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold">Feedback semanal</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Registra el feedback de tus clientes de esta semana. Se clasificará automáticamente en preferencias, vetos y aprendizajes.
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-card/40 p-5 mb-6 grid sm:grid-cols-[1fr_180px] gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Community manager</label>
            <Select value={cm} onValueChange={(v) => setCm(v as CM)}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {CMS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Semana</label>
            <input
              type="date"
              value={semana}
              onChange={(e) => setSemana(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        {isLoading || isFetching ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando proyectos…
          </div>
        ) : proyectos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No hay proyectos disponibles.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {proyectos.map((p) => (
                <div key={p.id} className="rounded-2xl border border-border bg-card/40 p-5">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h3 className="font-display font-semibold text-lg">{p.nombre}</h3>
                    {p.pais && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <Globe className="h-3 w-3" /> {p.pais}
                      </span>
                    )}
                  </div>
                  <Textarea
                    value={feedbacks[p.id] ?? ""}
                    onChange={(e) => setFB(p.id, e.target.value)}
                    placeholder="Escribe aquí el feedback de esta semana..."
                    rows={4}
                    maxLength={2000}
                  />
                </div>
              ))}
            </div>

            <div className="sticky bottom-4 mt-6 flex justify-end">
              <Button
                onClick={enviar}
                disabled={enviando || conFeedback === 0}
                className="gradient-primary glow-primary"
                size="lg"
              >
                {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Guardar feedback {conFeedback > 0 && `(${conFeedback})`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
