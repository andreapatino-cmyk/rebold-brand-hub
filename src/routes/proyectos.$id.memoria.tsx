import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Ban, Lightbulb, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/proyectos/$id/memoria")({
  component: MemoriaPage,
});

type Tipo = "preferencia" | "veto" | "aprendizaje";

const TIPOS: { value: Tipo; label: string; icon: typeof Heart; color: string; description: string }[] = [
  {
    value: "preferencia",
    label: "Preferencias",
    icon: Heart,
    color: "text-primary",
    description: "Lo que le gusta al cliente",
  },
  {
    value: "veto",
    label: "Vetos",
    icon: Ban,
    color: "text-destructive",
    description: "Lo que nunca se debe hacer",
  },
  {
    value: "aprendizaje",
    label: "Aprendizajes",
    icon: Lightbulb,
    color: "text-[color:var(--warning)]",
    description: "Notas y patrones detectados",
  },
];

interface MemoriaRow {
  id: string;
  proyecto_id: string;
  clave: string;
  valor: string | null;
  fuente: string | null;
  community_manager: string | null;
  created_at: string;
}

function MemoriaPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<Tipo>("preferencia");
  const [valor, setValor] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["memoria", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memoria_cliente")
        .select("*")
        .eq("proyecto_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MemoriaRow[];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const v = valor.trim();
      if (!v) throw new Error("Escribe un valor");
      const { error } = await supabase.from("memoria_cliente").insert({
        proyecto_id: id,
        clave: tipo,
        valor: v,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setValor("");
      qc.invalidateQueries({ queryKey: ["memoria", id] });
      toast.success("Añadido a la memoria");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("memoria_cliente").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memoria", id] });
      toast.success("Eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = (t: Tipo) => items.filter((x) => x.clave === t);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Conocimiento del cliente</div>
        <h2 className="font-display text-2xl font-bold">Memoria del cliente</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Preferencias, vetos y aprendizajes que guían cada parrilla y evaluación.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card/40 p-6">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider mb-4">Añadir entrada</h3>
        <div className="grid md:grid-cols-[180px_1fr_auto] gap-3 items-start">
          <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label.replace(/s$/, "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={
              tipo === "preferencia"
                ? "Ej: Usar tonos cálidos en fotografías de producto"
                : tipo === "veto"
                ? "Ej: No mencionar a la competencia"
                : "Ej: Los reels con voz en off rinden 2x mejor"
            }
            rows={2}
            maxLength={500}
          />
          <Button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !valor.trim()}
            className="md:self-stretch"
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Añadir
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {TIPOS.map((t) => {
          const Icon = t.icon;
          const rows = grouped(t.value);
          return (
            <div key={t.value} className="rounded-2xl border border-border bg-card/40 p-5">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-8 h-8 rounded-lg bg-background/60 border border-border flex items-center justify-center ${t.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-display font-semibold">{t.label}</h3>
                <span className="ml-auto text-xs text-muted-foreground">{rows.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{t.description}</p>

              {isLoading ? (
                <div className="text-xs text-muted-foreground">Cargando…</div>
              ) : rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                  Sin entradas aún
                </div>
              ) : (
                <ul className="space-y-2">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="group flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed break-words">{r.valor}</p>
                        {(r.fuente || r.community_manager) && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 flex flex-wrap gap-x-2">
                            {r.fuente && <span>Fuente: {r.fuente}</span>}
                            {r.community_manager && <span>CM: {r.community_manager}</span>}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => delMut.mutate(r.id)}
                        disabled={delMut.isPending}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
