import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Sparkles, Film, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const searchSchema = z.object({ evalId: z.string().optional() });

export const Route = createFileRoute("/proyectos/$id/sugerencias")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sugerencias — Rebold" },
      { name: "description", content: "Descubre recomendaciones accionables para mejorar la parrilla." },
      { property: "og:title", content: "Sugerencias — Rebold" },
      { name: "twitter:title", content: "Sugerencias — Rebold" },
      { property: "og:description", content: "Descubre recomendaciones accionables para mejorar la parrilla." },
      { name: "twitter:description", content: "Descubre recomendaciones accionables para mejorar la parrilla." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SugerenciasPage,
});

interface Sug { titulo: string; descripcion: string; impacto: string; guion_etv?: string }

const impactoStyles = (i: string) => {
  if (i === "Alto") return "bg-primary/15 text-primary border-primary/30";
  if (i === "Medio") return "bg-[color:var(--warning)]/15 text-[color:var(--warning)] border-[color:var(--warning)]/30";
  return "bg-muted text-muted-foreground border-border";
};

function SugerenciasPage() {
  const { id } = Route.useParams();
  const { evalId } = Route.useSearch();

  const { data: evaluacion, isLoading } = useQuery({
    queryKey: ["sugerencias", id, evalId],
    queryFn: async () => {
      if (evalId && evalId.startsWith("local-")) {
        const raw = sessionStorage.getItem(`evaluacion:${evalId}`);
        if (raw) {
          try { return JSON.parse(raw); } catch { /* fallthrough */ }
        }
      }
      let query = supabase.from("evaluaciones").select("*, parrillas!inner(proyecto_id)");
      if (evalId) {
        const { data, error } = await query.eq("id", evalId).maybeSingle();
        if (error) throw error;
        return data;
      }
      const { data, error } = await query
        .eq("parrillas.proyecto_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando sugerencias…</div>;

  const rawSug = ((evaluacion?.sugerencias as unknown) as any[]) ?? [];
  console.log("[sugerencias] evaluacion:", evaluacion);
  console.log("[sugerencias] rawSug:", rawSug);

  const normalizaImpacto = (v: any): string => {
    const s = String(v ?? "").toLowerCase();
    if (s.includes("alt")) return "Alto";
    if (s.includes("baj") || s === "low") return "Bajo";
    if (s) return "Medio";
    return "Medio";
  };

  const sugerencias: Sug[] = rawSug.map((s) => {
    if (typeof s === "string") {
      return { titulo: s, descripcion: "", impacto: "Medio" };
    }
    return {
      titulo: s?.titulo ?? s?.title ?? s?.nombre ?? "Sugerencia",
      descripcion: s?.descripcion ?? s?.description ?? s?.detalle ?? "",
      impacto: normalizaImpacto(s?.impacto ?? s?.impact ?? s?.prioridad ?? s?.priority),
      guion_etv: s?.guion_etv ?? s?.guion ?? undefined,
    };
  });

  if (!evaluacion || sugerencias.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
        <h3 className="font-display text-lg font-semibold">¡Parrilla impecable!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No tenemos sugerencias accionables ahora mismo. Sigue así.
        </p>
        <Link to="/proyectos/$id/evaluacion" params={{ id }}>
          <Button variant="outline" className="mt-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver a la evaluación
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Próximos pasos</div>
          <h2 className="font-display text-2xl font-bold">Sugerencias accionables</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Mejoras priorizadas con guiones ETV listos para producir.
          </p>
        </div>
        <Link to="/proyectos/$id/evaluacion" params={{ id }} search={{ evalId: evalId ?? evaluacion.id }}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Ver evaluación
          </Button>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {sugerencias.map((s, i) => (
          <div key={i} className="group relative rounded-xl bg-card border border-border p-6 hover:border-primary/50 transition overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/5 blur-2xl opacity-0 group-hover:opacity-100 transition" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="w-9 h-9 rounded-lg gradient-primary glow-primary flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <Badge className={`text-[10px] uppercase tracking-wider border ${impactoStyles(s.impacto)}`}>
                  Impacto {s.impacto}
                </Badge>
              </div>
              <h3 className="font-display font-semibold text-lg mt-4 leading-tight">{s.titulo}</h3>
              <p className="text-sm text-muted-foreground mt-2">{s.descripcion}</p>

              {s.guion_etv && (
                <div className="mt-5 rounded-lg border border-border/70 bg-background/40 p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
                    <Film className="h-3 w-3" /> Guion ETV
                  </div>
                  <p className="text-xs text-foreground/80 mt-2 leading-relaxed">{s.guion_etv}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
