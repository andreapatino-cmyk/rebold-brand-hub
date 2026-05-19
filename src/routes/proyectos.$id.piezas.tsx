import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/proyectos/$id/piezas")({
  component: PiezasPage,
});

function PiezasPage() {
  const { id } = Route.useParams();
  const { data: publicaciones = [], isLoading } = useQuery({
    queryKey: ["piezas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publicaciones").select("*")
        .eq("proyecto_id", id)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando piezas…</div>;
  }

  if (publicaciones.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-display text-lg font-semibold">Sin piezas todavía</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Las publicaciones que añadas a la parrilla aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {publicaciones.map((p) => (
        <div key={p.id} className="rounded-xl bg-card border border-border p-5 hover:border-primary/40 transition">
          <div className="flex items-center justify-between mb-3">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{p.red}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(p.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
            </span>
          </div>
          <h3 className="font-display font-semibold leading-tight">{p.titulo}</h3>
          {p.tipo && (
            <div className="text-xs text-primary uppercase tracking-wider font-medium mt-1">{p.tipo}</div>
          )}
          {p.copy && (
            <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{p.copy}</p>
          )}
        </div>
      ))}
    </div>
  );
}
