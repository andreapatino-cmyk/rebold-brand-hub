import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Loader2, Trash2,
  Mail, GitBranch, FileText, BarChart3, Download, Workflow, Users, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { callN8nWebhook } from "@/lib/n8n-webhook.functions";

export const Route = createFileRoute("/proyectos/$id/email")({
  component: EmailPage,
});

const TIPOS_EMAIL = [
  { value: "promocional", label: "Promocional", color: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  { value: "educativo", label: "Educativo", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { value: "relacional", label: "Relacional", color: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  { value: "reactivacion", label: "Reactivación", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { value: "transaccional", label: "Transaccional", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
];

const ESTADOS = ["borrador", "programado", "enviado"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["L","M","X","J","V","S","D"];

function pad(n: number) { return n.toString().padStart(2, "0"); }
function tipoColor(t: string) {
  return TIPOS_EMAIL.find((x) => x.value === t)?.color ?? "bg-muted text-muted-foreground border-border";
}
function tipoLabel(t: string) {
  return TIPOS_EMAIL.find((x) => x.value === t)?.label ?? t;
}

function EmailPage() {
  const { id: proyectoId } = Route.useParams();
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Email Marketing</div>
        <h2 className="font-display text-2xl font-bold">Email</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Parrilla, flujos y generación de copy para tus campañas de email.
        </p>
      </div>

      <Tabs defaultValue="parrilla" className="w-full">
        <TabsList className="bg-card/40 border border-border h-auto p-1">
          <TabsTrigger value="parrilla" className="gap-2"><Mail className="h-4 w-4" /> Parrilla</TabsTrigger>
          <TabsTrigger value="flujos" className="gap-2"><GitBranch className="h-4 w-4" /> Flujos</TabsTrigger>
          <TabsTrigger value="cuerpo" className="gap-2"><FileText className="h-4 w-4" /> Cuerpo del email</TabsTrigger>
          <TabsTrigger value="metricas" className="gap-2"><BarChart3 className="h-4 w-4" /> Métricas</TabsTrigger>
        </TabsList>

        <TabsContent value="parrilla" className="mt-6">
          <ParrillaEmail proyectoId={proyectoId} />
        </TabsContent>
        <TabsContent value="flujos" className="mt-6">
          <FlujosEmail proyectoId={proyectoId} />
        </TabsContent>
        <TabsContent value="cuerpo" className="mt-6">
          <CuerpoEmail proyectoId={proyectoId} />
        </TabsContent>
        <TabsContent value="metricas" className="mt-6">
          <MetricasEmail />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------ PARRILLA ------------------ */

interface Campana {
  id: string;
  proyecto_id: string;
  fecha: string;
  tipo: string;
  asunto: string;
  segmento: string | null;
  estado: string;
}

function ParrillaEmail({ proyectoId }: { proyectoId: string }) {
  const qc = useQueryClient();
  const callWebhook = useServerFn(callN8nWebhook);
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Campana> | null>(null);
  const [evaluando, setEvaluando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const firstDay = new Date(view.y, view.m, 1);
  const lastDay = new Date(view.y, view.m + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;

  const { data: campanas = [] } = useQuery({
    queryKey: ["email_campanas", proyectoId, view.y, view.m],
    queryFn: async () => {
      const start = `${view.y}-${pad(view.m + 1)}-01`;
      const end = `${view.y}-${pad(view.m + 1)}-${pad(lastDay.getDate())}`;
      const { data, error } = await supabase
        .from("email_campanas")
        .select("*")
        .eq("proyecto_id", proyectoId)
        .gte("fecha", start)
        .lte("fecha", end)
        .order("fecha", { ascending: true });
      if (error) throw error;
      return data as Campana[];
    },
  });

  const upsertMut = useMutation({
    mutationFn: async (c: Partial<Campana>) => {
      if (!c.fecha || !c.tipo || !c.asunto) throw new Error("Completa fecha, tipo y asunto");
      const payload = {
        proyecto_id: proyectoId,
        fecha: c.fecha,
        tipo: c.tipo,
        asunto: c.asunto,
        segmento: c.segmento ?? null,
        estado: c.estado ?? "borrador",
      };
      if (c.id) {
        const { error } = await supabase.from("email_campanas").update(payload).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_campanas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email_campanas", proyectoId] });
      setOpen(false);
      setEditing(null);
      toast.success("Campaña guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campanas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email_campanas", proyectoId] });
      toast.success("Eliminada");
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<number, Campana[]>();
    for (const c of campanas) {
      const d = parseInt(c.fecha.slice(8, 10), 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(c);
    }
    return map;
  }, [campanas]);

  async function leerMemoria() {
    const { data } = await supabase
      .from("memoria_cliente")
      .select("clave,valor")
      .eq("proyecto_id", proyectoId);
    const rows = data ?? [];
    const preferencias = rows.filter((r: any) => r.clave === "preferencia").map((r: any) => r.valor);
    const vetos = rows.filter((r: any) => r.clave === "veto").map((r: any) => r.valor);
    const get = (k: string) => rows.find((r: any) => r.clave === k)?.valor ?? "";
    return {
      preferencias,
      vetos,
      industria: get("industria"),
      tono_de_voz: get("tono_de_voz") || get("tono"),
    };
  }

  async function leerProyecto() {
    const { data } = await supabase
      .from("proyectos")
      .select("nombre,pais,pilares")
      .eq("id", proyectoId)
      .maybeSingle();
    return data;
  }

  async function evaluarParrilla() {
    setEvaluando(true);
    try {
      const memoria = await leerMemoria();
      await callWebhook({
        data: {
          path: "evaluar-parrilla-email",
          payload: {
            proyecto_id: proyectoId,
            anio: view.y,
            mes: view.m + 1,
            campanas,
            memoria,
          },
        },
      });
      toast.success("Parrilla enviada a evaluación");
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setEvaluando(false);
    }
  }

  async function generarParrilla() {
    setGenerando(true);
    try {
      const [memoria, proyecto] = await Promise.all([leerMemoria(), leerProyecto()]);
      const body = {
        accion: "generar_parrilla",
        proyecto: {
          nombre_marca: proyecto?.nombre ?? "",
          pais: proyecto?.pais ?? "",
          industria: memoria.industria,
          tono_de_voz: memoria.tono_de_voz,
          pilares: proyecto?.pilares ?? [],
          preferencias: memoria.preferencias,
          vetos: memoria.vetos,
        },
        mes: view.m + 1,
        anio: view.y,
        flujos_actuales: [],
        metricas: {},
      };
      const { raw } = await callWebhook({
        data: { path: "email-marketing", payload: body },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let data: any = null;
      try { data = JSON.parse(clean); } catch { /* sin payload aprovechable */ }
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { /* noop */ }
      }
      const root = Array.isArray(data) ? data[0] : data;
      const items: any[] =
        (Array.isArray(root?.resultado?.campanas) && root.resultado.campanas) ||
        (Array.isArray(root?.campanas) && root.campanas) ||
        (Array.isArray(root) ? root : []);
      if (items.length) {
        const rows = items
          .filter((x) => x && x.fecha && x.tipo && x.asunto)
          .map((x) => ({
            proyecto_id: proyectoId,
            fecha: String(x.fecha).slice(0, 10),
            tipo: String(x.tipo),
            asunto: String(x.asunto),
            segmento: x.segmento ?? null,
            estado: x.estado ?? "borrador",
          }));
        if (rows.length) {
          const { error } = await supabase.from("email_campanas").insert(rows);
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ["email_campanas", proyectoId] });
          toast.success(`${rows.length} campañas generadas`);
        } else {
          toast.success("Solicitud enviada");
        }
      } else {
        toast.success("Solicitud enviada");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setGenerando(false);
    }
  }

  function openNew(day?: number) {
    const fecha = day
      ? `${view.y}-${pad(view.m + 1)}-${pad(day)}`
      : `${view.y}-${pad(view.m + 1)}-${pad(today.getDate())}`;
    setEditing({ fecha, tipo: "promocional", asunto: "", segmento: "", estado: "borrador" });
    setOpen(true);
  }

  function openEdit(c: Campana) {
    setEditing(c);
    setOpen(true);
  }

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null });
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push({ day: d });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setView((v) => v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-display text-lg font-semibold min-w-[180px] text-center">
            {MESES[view.m]} {view.y}
          </h3>
          <Button variant="outline" size="icon" onClick={() => setView((v) => v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={evaluarParrilla} disabled={evaluando || campanas.length === 0}>
            {evaluando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Evaluar parrilla
          </Button>
          <Button variant="outline" onClick={generarParrilla} disabled={generando}>
            {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
            Generar parrilla
          </Button>
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" /> Nueva campaña
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/40 p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DIAS.map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-wider text-muted-foreground text-center font-semibold">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, i) => {
            if (cell.day === null) return <div key={i} />;
            const items = byDay.get(cell.day) ?? [];
            const isToday =
              cell.day === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
            return (
              <button
                key={i}
                onClick={() => openNew(cell.day!)}
                className={`min-h-[96px] text-left rounded-lg border p-2 transition hover:bg-background/40 ${
                  isToday ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background/20"
                }`}
              >
                <div className="text-xs font-semibold text-muted-foreground mb-1">{cell.day}</div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((c) => (
                    <div
                      key={c.id}
                      onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                      className={`text-[10px] px-1.5 py-1 rounded border truncate ${tipoColor(c.tipo)}`}
                      title={c.asunto}
                    >
                      {c.asunto}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">+{items.length - 3} más</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {campanas.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Asunto</th>
                <th className="px-4 py-2">Segmento</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <tr key={c.id} className="border-t border-border/40 hover:bg-background/30">
                  <td className="px-4 py-2 whitespace-nowrap">{c.fecha}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tipoColor(c.tipo)}`}>
                      {tipoLabel(c.tipo)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button className="hover:underline text-left" onClick={() => openEdit(c)}>{c.asunto}</button>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{c.segmento || "—"}</td>
                  <td className="px-4 py-2"><Badge variant="secondary">{c.estado}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => delMut.mutate(c.id)}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha</Label>
                  <Input
                    type="date"
                    value={editing.fecha ?? ""}
                    onChange={(e) => setEditing({ ...editing, fecha: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={editing.tipo} onValueChange={(v) => setEditing({ ...editing, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_EMAIL.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Asunto</Label>
                <Input
                  value={editing.asunto ?? ""}
                  onChange={(e) => setEditing({ ...editing, asunto: e.target.value })}
                  placeholder="Asunto del email"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Segmento</Label>
                  <Input
                    value={editing.segmento ?? ""}
                    onChange={(e) => setEditing({ ...editing, segmento: e.target.value })}
                    placeholder="Ej: VIP, nuevos…"
                  />
                </div>
                <div>
                  <Label className="text-xs">Estado</Label>
                  <Select value={editing.estado} onValueChange={(v) => setEditing({ ...editing, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => editing && upsertMut.mutate(editing)} disabled={upsertMut.isPending}>
              {upsertMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------ FLUJOS ------------------ */

interface Flujo {
  id: string;
  proyecto_id: string;
  nombre: string;
  descripcion: string | null;
  trigger: string | null;
  secuencia: Array<{ asunto: string; espera?: string; cuerpo?: string }>;
}

function FlujosEmail({ proyectoId }: { proyectoId: string }) {
  const qc = useQueryClient();
  const callWebhook = useServerFn(callN8nWebhook);
  const [generando, setGenerando] = useState(false);

  const { data: flujos = [], isLoading } = useQuery({
    queryKey: ["email_flujos", proyectoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_flujos")
        .select("*")
        .eq("proyecto_id", proyectoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Flujo[];
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_flujos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email_flujos", proyectoId] });
      toast.success("Flujo eliminado");
    },
  });

  async function generarFlujos() {
    setGenerando(true);
    try {
      const { data: memData } = await supabase
        .from("memoria_cliente").select("clave,valor").eq("proyecto_id", proyectoId);
      const preferencias = (memData ?? []).filter((r: any) => r.clave === "preferencia").map((r: any) => r.valor);
      const vetos = (memData ?? []).filter((r: any) => r.clave === "veto").map((r: any) => r.valor);
      const { raw } = await callWebhook({
        data: {
          path: "generar-flujos-email",
          payload: { proyecto_id: proyectoId, memoria: { preferencias, vetos } },
        },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let data: any = null;
      try { data = JSON.parse(clean); } catch { /* */ }
      const items: any[] = Array.isArray(data?.flujos) ? data.flujos : Array.isArray(data) ? data : [];
      if (items.length) {
        const rows = items
          .filter((x) => x && x.nombre)
          .map((x) => ({
            proyecto_id: proyectoId,
            nombre: String(x.nombre),
            descripcion: x.descripcion ?? null,
            trigger: x.trigger ?? null,
            secuencia: Array.isArray(x.secuencia) ? x.secuencia : [],
          }));
        if (rows.length) {
          const { error } = await supabase.from("email_flujos").insert(rows);
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ["email_flujos", proyectoId] });
          toast.success(`${rows.length} flujos generados`);
        } else {
          toast.success("Solicitud enviada");
        }
      } else {
        toast.success("Solicitud enviada");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          Flujos automatizados sugeridos para el proyecto.
        </p>
        <Button onClick={generarFlujos} disabled={generando}>
          {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar flujos
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : flujos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
          <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Aún no hay flujos. Genera sugerencias basadas en el cliente.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {flujos.map((f) => (
            <div key={f.id} className="rounded-2xl border border-border bg-card/40 p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-display font-semibold">{f.nombre}</h4>
                  {f.trigger && (
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Trigger · <span className="text-foreground/80 normal-case tracking-normal">{f.trigger}</span>
                    </div>
                  )}
                </div>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => delMut.mutate(f.id)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {f.descripcion && <p className="text-sm text-muted-foreground">{f.descripcion}</p>}
              {f.secuencia?.length > 0 && (
                <ol className="space-y-2 mt-2">
                  {f.secuencia.map((s, i) => (
                    <li key={i} className="flex gap-3 items-start text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{s.asunto}</div>
                        {s.espera && <div className="text-xs text-muted-foreground">Espera: {s.espera}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------ CUERPO DEL EMAIL ------------------ */

function CuerpoEmail({ proyectoId }: { proyectoId: string }) {
  const callWebhook = useServerFn(callN8nWebhook);
  const [tipo, setTipo] = useState("promocional");
  const [objetivo, setObjetivo] = useState("");
  const [tono, setTono] = useState("cercano");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState("");

  async function generar() {
    if (!objetivo.trim()) {
      toast.error("Define el objetivo del email");
      return;
    }
    setLoading(true);
    try {
      const { data: memData } = await supabase
        .from("memoria_cliente").select("clave,valor").eq("proyecto_id", proyectoId);
      const preferencias = (memData ?? []).filter((r: any) => r.clave === "preferencia").map((r: any) => r.valor);
      const vetos = (memData ?? []).filter((r: any) => r.clave === "veto").map((r: any) => r.valor);
      const { raw } = await callWebhook({
        data: {
          path: "generar-cuerpo-email",
          payload: {
            proyecto_id: proyectoId,
            tipo, objetivo, tono,
            memoria: { preferencias, vetos },
          },
        },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let texto = clean;
      try {
        const parsed = JSON.parse(clean);
        texto = parsed?.texto ?? parsed?.cuerpo ?? parsed?.contenido ?? clean;
      } catch { /* texto plano */ }
      setResultado(typeof texto === "string" ? texto : JSON.stringify(texto, null, 2));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  function exportarHTML() {
    if (!resultado) return;
    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Email</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;line-height:1.6;">
${resultado.split("\n").map((l) => `<p>${l.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("\n")}
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `email-${Date.now()}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4 h-fit">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Parámetros</h3>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_EMAIL.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Objetivo</Label>
          <Textarea
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Ej: Anunciar el lanzamiento de la nueva colección"
            rows={4}
          />
        </div>
        <div>
          <Label className="text-xs">Tono</Label>
          <Select value={tono} onValueChange={setTono}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cercano">Cercano</SelectItem>
              <SelectItem value="profesional">Profesional</SelectItem>
              <SelectItem value="divertido">Divertido</SelectItem>
              <SelectItem value="inspirador">Inspirador</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={generar} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Resultado</h3>
          <Button variant="outline" size="sm" onClick={exportarHTML} disabled={!resultado}>
            <Download className="h-4 w-4" /> Exportar HTML
          </Button>
        </div>
        {resultado ? (
          <div className="rounded-lg bg-background/40 border border-border/60 p-4 whitespace-pre-wrap text-sm leading-relaxed min-h-[300px]">
            {resultado}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground min-h-[300px] flex items-center justify-center">
            El cuerpo generado aparecerá aquí.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------ MÉTRICAS ------------------ */

function MetricasEmail() {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center">
      <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
      <h3 className="font-display text-lg font-semibold">Conecta Klaviyo</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Próximamente podrás conectar tu cuenta de Klaviyo para ver aperturas, clics, conversiones y
        comparar el rendimiento de cada campaña directamente desde Rebold.
      </p>
      <Button variant="outline" className="mt-6" disabled>
        Conectar Klaviyo · Próximamente
      </Button>
    </div>
  );
}
