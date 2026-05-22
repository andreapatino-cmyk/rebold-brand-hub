import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/proyectos/$id/parrilla")({
  component: ParrillaPage,
});

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["L","M","X","J","V","S","D"];
const TIPOS = ["Post","Reel","Story","Carrusel","Video"];
const REDES = ["Instagram","TikTok","LinkedIn","X","Facebook","YouTube"];

function pad(n: number) { return n.toString().padStart(2, "0"); }

function ParrillaPage() {
  const { id: proyectoId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });

  // Get or create parrilla for this month
  const { data: parrilla } = useQuery({
    queryKey: ["parrilla", proyectoId, view.y, view.m],
    queryFn: async () => {
      const { data } = await supabase.from("parrillas")
        .select("*")
        .eq("proyecto_id", proyectoId)
        .eq("anio", view.y)
        .eq("mes", view.m + 1)
        .maybeSingle();
      if (data) return data;
      const { data: created, error } = await supabase.from("parrillas")
        .insert({ proyecto_id: proyectoId, anio: view.y, mes: view.m + 1, estado: "borrador" })
        .select().single();
      if (error) throw error;
      return created;
    },
  });

  const { data: publicaciones = [], isLoading } = useQuery({
    queryKey: ["publicaciones", parrilla?.id],
    enabled: !!parrilla?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publicaciones")
        .select("*")
        .eq("parrilla_id", parrilla!.id)
        .order("fecha");
      if (error) throw error;
      return data;
    },
  });

  const days = useMemo(() => buildCalendar(view.y, view.m), [view]);
  const byDate = useMemo(() => {
    const m: Record<string, typeof publicaciones> = {};
    for (const p of publicaciones) (m[p.fecha] ||= []).push(p);
    return m;
  }, [publicaciones]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fecha: "", red: "Instagram", tipo: "Post", titulo: "", copy: "" });

  const openNew = (fecha: string) => {
    setForm({ fecha, red: "Instagram", tipo: "Post", titulo: "", copy: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!parrilla) return;
    if (!form.titulo.trim()) return toast.error("Añade un título");
    const { error } = await supabase.from("publicaciones").insert({
      parrilla_id: parrilla.id,
      proyecto_id: proyectoId,
      fecha: form.fecha,
      red: form.red,
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      copy: form.copy.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Publicación añadida");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["publicaciones", parrilla.id] });
  };

  const [evaluando, setEvaluando] = useState(false);

  const evaluar = async () => {
    if (!parrilla) return;
    if (publicaciones.length === 0) {
      return toast.error("Añade al menos una publicación antes de evaluar");
    }
    setEvaluando(true);

    try {
      const { data: proyecto } = await supabase
        .from("proyectos")
        .select("*")
        .eq("id", proyectoId)
        .maybeSingle();

      const { data: memoriaRows } = await supabase
        .from("memoria_cliente")
        .select("clave, valor")
        .eq("proyecto_id", proyectoId);

      const memoria = {
        preferencias: (memoriaRows ?? []).filter((m) => m.clave === "preferencia").map((m) => m.valor),
        vetos: (memoriaRows ?? []).filter((m) => m.clave === "veto").map((m) => m.valor),
        aprendizajes: (memoriaRows ?? []).filter((m) => m.clave === "aprendizaje").map((m) => m.valor),
      };

      const payload = {
        proyecto: {
          id: proyecto?.id ?? proyectoId,
          nombre_marca: proyecto?.nombre ?? "",
          pais: proyecto?.pais ?? "",
          redes_activas: proyecto?.redes ?? [],
          tono_de_voz: "",
          pilares: [],
        },
        parrilla: { id: parrilla.id, mes: parrilla.mes, anio: parrilla.anio },
        publicaciones,
        memoria,
        temporalidades: [],
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let res: Response;
      try {
        res = await fetch("https://rebold.app.n8n.cloud/webhook/evaluar-parrilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          throw new Error("La evaluación tardó más de 60 segundos. Inténtalo de nuevo.");
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) throw new Error(`El webhook respondió con estado ${res.status}`);

      const raw = await res.json().catch(() => null);
      if (!raw) throw new Error("El webhook no devolvió datos");
      const r0 = Array.isArray(raw) ? raw[0] ?? {} : raw;
      // Nuevo formato: { evaluacion: {...}, proyecto_id, parrilla_id }
      const r = r0.evaluacion ?? r0;

      const globalRaw = r.puntuacion_global ?? r.global;
      const criteriosRaw = r.criterios ?? [];
      const sugerencias = r.sugerencias ?? [];

      // criterios puede venir como objeto { nombre: { score, descripcion } } o como array
      const criterios = Array.isArray(criteriosRaw)
        ? criteriosRaw
        : Object.entries(criteriosRaw as Record<string, any>).map(([nombre, v]) => ({
            nombre,
            score: Math.round(Number(v?.puntaje ?? v?.score ?? 0)) * 10,
            descripcion: v?.observacion ?? v?.descripcion ?? v?.detalle ?? undefined,
          }));

      if (globalRaw === undefined || globalRaw === null || (criterios.length === 0 && (!Array.isArray(sugerencias) || sugerencias.length === 0))) {
        throw new Error("La respuesta del webhook no contiene resultados válidos");
      }

      const global = Math.round(Number(globalRaw));

      const { data: evalRow, error } = await supabase.from("evaluaciones").insert({
        parrilla_id: parrilla.id,
        puntuacion_global: global,
        criterios,
        sugerencias,
      }).select().single();

      if (error) throw error;

      await supabase.from("proyectos").update({
        estado_ultima_parrilla: global >= 75 ? "aprobada" : "en_revision",
        updated_at: new Date().toISOString(),
      }).eq("id", proyectoId);


      setEvaluando(false);
      navigate({
        to: "/proyectos/$id/evaluacion",
        params: { id: proyectoId },
        search: { evalId: evalRow!.id },
      });
    } catch (e: any) {
      setEvaluando(false);
      toast.error(e?.message ?? "Error al evaluar la parrilla");
    }
  };

  const monthLabel = `${MESES[view.m]} ${view.y}`;

  return (
    <div>
      {evaluando && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl border border-border bg-card shadow-lg max-w-sm text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div>
              <div className="font-display text-lg font-bold">Evaluando parrilla…</div>
              <div className="text-sm text-muted-foreground mt-1">
                Estamos analizando tus publicaciones con IA. Esto puede tardar hasta 60 segundos.
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setView(prevMonth(view))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-display text-xl font-bold min-w-[180px] text-center capitalize">
            {monthLabel}
          </div>
          <Button variant="outline" size="icon" onClick={() => setView(nextMonth(view))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {publicaciones.length} publicación{publicaciones.length === 1 ? "" : "es"}
          </span>
          <Button onClick={evaluar} disabled={evaluando} className="gradient-primary glow-primary">
            {evaluando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Evaluar parrilla
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {DIAS.map((d) => (
            <div key={d} className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((d, i) => {
            const dateStr = d ? `${view.y}-${pad(view.m + 1)}-${pad(d)}` : "";
            const items = dateStr ? byDate[dateStr] ?? [] : [];
            const isToday = d && view.y === today.getFullYear() && view.m === today.getMonth() && d === today.getDate();
            return (
              <div
                key={i}
                className={`min-h-[110px] p-2 border-r border-b border-border/60 last:border-r-0 ${
                  d ? "bg-card hover:bg-muted/30 transition cursor-pointer" : "bg-background/40"
                }`}
                onClick={() => d && openNew(dateStr)}
              >
                {d && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {d}
                      </span>
                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className="mt-1 space-y-1">
                      {items.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className="text-[10px] leading-tight px-1.5 py-1 rounded bg-primary/15 text-primary border-l-2 border-primary truncate"
                          title={p.titulo ?? ""}
                        >
                          <span className="font-semibold uppercase tracking-wider mr-1">{p.red.slice(0,2)}</span>
                          {p.titulo}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">+{items.length - 3} más</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground mt-3">Cargando publicaciones…</div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva publicación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Red</Label>
                <Select value={form.red} onValueChange={(v) => setForm({ ...form, red: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REDES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Lanzamiento colección verano" />
            </div>
            <div className="space-y-2">
              <Label>Copy</Label>
              <Textarea rows={4} value={form.copy} onChange={(e) => setForm({ ...form, copy: e.target.value })} placeholder="Texto que acompaña la publicación…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} className="gradient-primary">
              <Plus className="h-4 w-4 mr-2" /> Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildCalendar(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function prevMonth(v: { y: number; m: number }) {
  return v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 };
}
function nextMonth(v: { y: number; m: number }) {
  return v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 };
}

function buildSugerencias(
  criterios: { nombre: string; score: number }[],
  ctx: { total: number; redesUnicas: number; tiposUnicos: number }
) {
  const items: any[] = [];
  for (const c of criterios) {
    if (c.score >= 80) continue;
    if (c.nombre.includes("Frecuencia")) {
      items.push({
        titulo: "Aumenta la cadencia semanal",
        descripcion: `Estás publicando ${ctx.total} piezas al mes. Apunta a 12–16 para mantener visibilidad sostenida.`,
        impacto: "Alto",
        guion_etv: "ETV — Gancho (3s): muestra un beneficio inesperado del producto. Desarrollo (15s): 2 demos rápidas en contexto real. Cierre (5s): CTA suave invitando a guardar el post.",
      });
    }
    if (c.nombre.includes("Diversidad")) {
      items.push({
        titulo: "Activa una red secundaria",
        descripcion: `Solo cubres ${ctx.redesUnicas} canal(es). Replica 1 contenido fuerte adaptándolo a otra red.`,
        impacto: "Medio",
        guion_etv: "ETV — Abre con un dato concreto del sector. Demuestra cómo el cliente lo resuelve. Cierra con prueba social en 5 segundos.",
      });
    }
    if (c.nombre.includes("formatos")) {
      items.push({
        titulo: "Introduce más video corto",
        descripcion: `Tienes ${ctx.tiposUnicos} tipo(s) de formato. Añadir Reels acelera el alcance.`,
        impacto: "Alto",
        guion_etv: "ETV — Hook visual fuerte (0-2s): cambia de plano cada segundo. Beat central (3-12s): muestra antes/después. CTA final (12-15s): pregunta directa al espectador.",
      });
    }
    if (c.nombre.includes("Distribución")) {
      items.push({
        titulo: "Reparte las fechas",
        descripcion: "Hay días con varias publicaciones y otros vacíos. Reequilibra para evitar saturar.",
        impacto: "Medio",
        guion_etv: "ETV — Estructura modular: 3 micro-piezas (5s c/u) que se publican en días distintos pero con misma identidad visual.",
      });
    }
    if (c.nombre.includes("copys")) {
      items.push({
        titulo: "Trabaja los copys",
        descripcion: "Hay publicaciones sin copy desarrollado. Añade gancho, valor y CTA en cada pieza.",
        impacto: "Medio",
        guion_etv: "ETV — Voz en off de 20s con tono cercano: contexto del problema, solución, invitación. Subtítulos siempre activos.",
      });
    }
  }
  return items.slice(0, 6);
}
