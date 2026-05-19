import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Sparkles, ArrowRight, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({ evalId: z.string().optional() });

export const Route = createFileRoute("/proyectos/$id/evaluacion")({
  validateSearch: searchSchema,
  component: EvaluacionPage,
});

interface Criterio { nombre: string; score: number; descripcion?: string }

function EvaluacionPage() {
  const { id } = Route.useParams();
  const { evalId } = Route.useSearch();

  const { data: evaluacion, isLoading } = useQuery({
    queryKey: ["evaluacion", id, evalId],
    queryFn: async () => {
      // get the parrilla(s) of proyecto, then the latest evaluacion (or by id)
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

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Calculando resultados…</div>;
  }

  if (!evaluacion) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
        <h3 className="font-display text-lg font-semibold">Sin evaluaciones aún</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Ve a la parrilla y pulsa "Evaluar parrilla" para generar la primera.
        </p>
        <Link to="/proyectos/$id/parrilla" params={{ id }}>
          <Button className="mt-6 gradient-primary">Ir a la parrilla</Button>
        </Link>
      </div>
    );
  }

  const global = Number(evaluacion.puntuacion_global);
  const criterios = (evaluacion.criterios as unknown as Criterio[]) ?? [];
  const tier = global >= 80 ? "Excelente" : global >= 60 ? "Sólida" : global >= 40 ? "Mejorable" : "Crítica";
  const tierColor =
    global >= 80 ? "text-primary" :
    global >= 60 ? "text-[color:var(--success)]" :
    global >= 40 ? "text-[color:var(--warning)]" : "text-destructive";

  return (
    <div className="space-y-8">
      {/* Score hero */}
      <div className="relative rounded-2xl border border-border bg-card p-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid md:grid-cols-[auto_1fr] gap-8 items-center">
          <ScoreRing score={global} />
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Resultado de la evaluación</div>
            <h2 className={`font-display text-3xl font-bold ${tierColor}`}>{tier}</h2>
            <p className="text-muted-foreground mt-2 max-w-lg">
              Análisis sintético de la parrilla en base a {criterios.length} criterios clave. Revisa las barras
              para identificar dónde apretar y consulta las sugerencias para próximos pasos.
            </p>
            <Link to="/proyectos/$id/sugerencias" params={{ id }} search={{ evalId: evaluacion.id }}>
              <Button className="mt-5 gradient-primary glow-primary">
                <Sparkles className="h-4 w-4 mr-2" />
                Ver sugerencias
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Criterios */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold">Desglose por criterio</h3>
        </div>
        <div className="space-y-5">
          {criterios.map((c) => (
            <div key={c.nombre}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div>
                  <div className="font-medium text-sm">{c.nombre}</div>
                  {c.descripcion && (
                    <div className="text-xs text-muted-foreground mt-0.5">{c.descripcion}</div>
                  )}
                </div>
                <div className="font-display font-bold tabular-nums">{c.score}<span className="text-muted-foreground text-xs">/100</span></div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${c.score}%`,
                    background: c.score >= 60 ? "linear-gradient(90deg, var(--primary), var(--primary-glow))" : "var(--muted-foreground)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative w-[140px] h-[140px]">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} stroke="var(--muted)" strokeWidth="10" fill="none" />
        <circle
          cx="70" cy="70" r={r}
          stroke="url(#g)" strokeWidth="10" fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 800ms ease" }}
        />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--primary-glow)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-4xl font-bold tabular-nums">{score}</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">de 100</div>
      </div>
    </div>
  );
}
