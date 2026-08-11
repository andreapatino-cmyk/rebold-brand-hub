import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Loader2, Trash2,
  Mail, GitBranch, FileText, BarChart3, Download, Workflow, Users, Lightbulb,
  CheckCircle2, AlertTriangle,
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
  { value: "promocional",   label: "Promocional",   color: "bg-orange-500/15 text-orange-300 border-orange-500/40", dot: "bg-orange-500" },
  { value: "educativo",     label: "Educativo",     color: "bg-blue-500/15 text-blue-300 border-blue-500/40",       dot: "bg-blue-500" },
  { value: "relacional",    label: "Relacional",    color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-500" },
  { value: "reactivacion",  label: "Reactivación",  color: "bg-red-500/15 text-red-300 border-red-500/40",          dot: "bg-red-500" },
  { value: "transaccional", label: "Transaccional", color: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",       dot: "bg-zinc-500" },
];

const ESTADOS = ["borrador", "programado", "enviado"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["L","M","X","J","V","S","D"];

function pad(n: number) { return n.toString().padStart(2, "0"); }
function tipoColor(t: string) {
  return TIPOS_EMAIL.find((x) => x.value === t)?.color ?? "bg-muted text-muted-foreground border-border";
}
function tipoDot(t: string) {
  return TIPOS_EMAIL.find((x) => x.value === t)?.dot ?? "bg-muted-foreground";
}
function tipoLabel(t: string) {
  return TIPOS_EMAIL.find((x) => x.value === t)?.label ?? t;
}
function fmtNum(n: number) {
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("es-ES");
}
function fmtTasa(raw: any, total: number, parte: number) {
  if (typeof raw === "string" && raw.includes("%")) return raw;
  const n = Number(raw);
  if (Number.isFinite(n)) return `${(n * (n <= 1 ? 100 : 1)).toFixed(2)}%`;
  if (total > 0 && parte >= 0) return `${((parte / total) * 100).toFixed(2)}%`;
  return "—";
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
          <MetricasEmail proyectoId={proyectoId} />
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
  razon: string | null;
  estado: string;
}

function ParrillaEmail({ proyectoId }: { proyectoId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
      return (data ?? []) as unknown as Campana[];
    },
  });

  const upsertMut = useMutation({
    mutationFn: async (c: Partial<Campana>) => {
      if (!c.fecha || !c.tipo || !c.asunto) throw new Error("Completa fecha, tipo y asunto");
      const payload: any = {
        proyecto_id: proyectoId,
        fecha: c.fecha,
        tipo: c.tipo,
        asunto: c.asunto,
        segmento: c.segmento ?? null,
        razon: c.razon ?? null,
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
      const [memoria, proyecto] = await Promise.all([leerMemoria(), leerProyecto()]);
      const body = {
        accion: "evaluar_parrilla",
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
        campanas,
      };
      const { raw } = await callWebhook({
        data: { path: "email-marketing", payload: body },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let parsed: any = null;
      try { parsed = JSON.parse(clean); } catch { /* noop */ }
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { /* noop */ }
      }
      const root = Array.isArray(parsed) ? parsed[0] : parsed;
      const evaluacion = root?.resultado ?? root?.evaluacion ?? root;

      if (!evaluacion || (evaluacion.puntuacion_global == null && !evaluacion.criterios)) {
        throw new Error("El webhook no devolvió una evaluación válida.");
      }

      const criteriosObj = evaluacion.criterios ?? {};
      const criteriosArr = Array.isArray(criteriosObj)
        ? criteriosObj.map((v: any) => ({
            nombre: v?.nombre ?? "",
            score: Math.round(Number(v?.score ?? v?.puntaje ?? 0) * (Number(v?.score ?? v?.puntaje ?? 0) <= 10 ? 10 : 1)),
            nivel: v?.nivel,
            descripcion: v?.observacion ?? v?.descripcion ?? "",
          }))
        : Object.entries(criteriosObj).map(([k, v]: [string, any]) => ({
            nombre: k,
            score: Math.round(Number(v?.puntaje ?? v?.score ?? 0) * (Number(v?.puntaje ?? v?.score ?? 0) <= 10 ? 10 : 1)),
            nivel: v?.nivel,
            descripcion: v?.observacion ?? v?.descripcion ?? "",
          }));

      const evalId = `local-${Date.now()}`;
      const evalPayload = {
        id: evalId,
        puntuacion_global: Number(evaluacion.puntuacion_global ?? 0),
        nivel_global: evaluacion.nivel_global,
        criterios: criteriosArr,
        alertas: evaluacion.alertas ?? [],
        sugerencias: evaluacion.sugerencias ?? [],
        resumen: evaluacion.resumen ?? "",
        proyecto_id: proyectoId,
      };
      sessionStorage.setItem(`evaluacion:${evalId}`, JSON.stringify(evalPayload));
      toast.success("Evaluación completada");
      navigate({
        to: "/proyectos/$id/evaluacion",
        params: { id: proyectoId },
        search: { evalId },
      });
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
        console.log("[email-marketing] primera campaña recibida:", items[0]);
        const rows = items
          .filter((x) => x && x.fecha && x.tipo && x.asunto)
          .map((x) => ({
            proyecto_id: proyectoId,
            fecha: String(x.fecha).slice(0, 10),
            tipo: String(x.tipo),
            asunto: String(x.asunto),
            segmento: x.segmento ?? x.audiencia ?? x.publico ?? x.target ?? null,
            razon: x.razon ?? null,

            estado: x.estado ?? "borrador",
          }));
        if (rows.length) {
          const { error } = await supabase.from("email_campanas").insert(rows as any);
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
    setEditing({ fecha, tipo: "promocional", asunto: "", segmento: "", razon: "", estado: "borrador" });
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
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wider">Leyenda:</span>
            {TIPOS_EMAIL.map((t) => (
              <span key={t.value} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                {t.label}
              </span>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {campanas.map((c) => (
              <div
                key={c.id}
                className={`relative rounded-2xl border bg-card/40 p-4 pl-5 overflow-hidden hover:bg-background/40 transition ${tipoColor(c.tipo).replace(/bg-[^\s]+/g, "").trim()}`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${tipoDot(c.tipo)}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tipoColor(c.tipo)}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${tipoDot(c.tipo)}`} />
                        {tipoLabel(c.tipo)}
                      </span>
                      <span className="text-xs text-muted-foreground">{c.fecha}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.estado}</Badge>
                    </div>
                    <button
                      className="block text-left font-semibold text-base leading-tight hover:underline"
                      onClick={() => openEdit(c)}
                    >
                      {c.asunto}
                    </button>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-start gap-2 text-sm">
                        <Users className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Audiencia</div>
                          <div className="text-foreground">{c.segmento || <span className="text-muted-foreground italic">Sin segmento definido</span>}</div>
                        </div>
                      </div>
                      {c.razon && (
                        <div className="flex items-start gap-2 text-sm">
                          <Lightbulb className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Razón estratégica</div>
                            <div className="text-muted-foreground">{c.razon}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => delMut.mutate(c.id)}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                  <Label className="text-xs">Segmento / Audiencia</Label>
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
              <div>
                <Label className="text-xs">Razón estratégica</Label>
                <Textarea
                  value={editing.razon ?? ""}
                  onChange={(e) => setEditing({ ...editing, razon: e.target.value })}
                  placeholder="¿Por qué este email en esta fecha?"
                  rows={3}
                />
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
  const [flujosNuevos, setFlujosNuevos] = useState<any[]>([]);
  const [flujosMejorar, setFlujosMejorar] = useState<any[]>([]);

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
      const rows = memData ?? [];
      const preferencias = rows.filter((r: any) => r.clave === "preferencia").map((r: any) => r.valor);
      const vetos = rows.filter((r: any) => r.clave === "veto").map((r: any) => r.valor);
      const get = (k: string) => rows.find((r: any) => r.clave === k)?.valor ?? "";
      const tono_de_voz = get("tono_de_voz") || get("tono");

      const { data: proyecto } = await supabase
        .from("proyectos").select("nombre,pais,pilares,klaviyo_api_key").eq("id", proyectoId).maybeSingle();

      // 1) Consultar Klaviyo para obtener los flujos activos
      let flujos_actuales: any = [];
      const klaviyoKey = (proyecto as any)?.klaviyo_api_key as string | null | undefined;
      if (klaviyoKey && klaviyoKey.trim().length > 0) {
        try {
          const { raw: rawK } = await callWebhook({
            data: {
              path: "klaviyo-metricas",
              payload: {
                klaviyo_api_key: klaviyoKey,
                proyecto_id: proyectoId,
                proyecto_nombre: proyecto?.nombre ?? "",
              },
            },
          });
          const cleanK = rawK.startsWith("=") ? rawK.slice(1) : rawK;
          let parsedK: any = null;
          try { parsedK = JSON.parse(cleanK); } catch { /* */ }
          if (typeof parsedK === "string") {
            try { parsedK = JSON.parse(parsedK); } catch { /* */ }
          }
          const rootK = Array.isArray(parsedK) ? parsedK[0] : parsedK;
          flujos_actuales =
            rootK?.flujos_actuales ??
            rootK?.resultado?.flujos_actuales ??
            rootK?.flujos ??
            rootK?.resultado?.flujos ??
            rootK?.resultado ??
            rootK ??
            [];
        } catch (e: any) {
          toast.warning(`No se pudieron leer los flujos de Klaviyo: ${e?.message ?? "error"}`);
        }
      } else {
        toast.info("Sin Klaviyo API key: se generarán flujos sin contexto actual.");
      }

      // 2) Generar flujos con el contexto de Klaviyo
      const body = {
        accion: "generar_flujos",
        proyecto: {
          nombre_marca: proyecto?.nombre ?? "",
          pais: proyecto?.pais ?? "",
          tono_de_voz,
          pilares: proyecto?.pilares ?? [],
          preferencias,
          vetos,
        },
        flujos_actuales,
        metricas: {},
      };

      const { raw } = await callWebhook({
        data: { path: "email-marketing", payload: body },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let data: any = null;
      try { data = JSON.parse(clean); } catch { /* */ }
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { /* */ }
      }
      const root = Array.isArray(data) ? data[0] : data;
      const resultado = root?.resultado ?? root ?? {};
      const nuevos: any[] = Array.isArray(resultado?.flujos_nuevos) ? resultado.flujos_nuevos : [];
      const mejorar: any[] = Array.isArray(resultado?.flujos_mejorar) ? resultado.flujos_mejorar : [];
      setFlujosNuevos(nuevos);
      setFlujosMejorar(mejorar);
      if (nuevos.length || mejorar.length) {
        toast.success(`${nuevos.length} nuevos · ${mejorar.length} a mejorar`);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          Flujos automatizados sugeridos para el proyecto.
        </p>
        <Button onClick={generarFlujos} disabled={generando}>
          {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar flujos
        </Button>
      </div>

      {(flujosNuevos.length > 0 || flujosMejorar.length > 0) && (
        <div className="space-y-6">
          {flujosNuevos.length > 0 && (
            <FlujosSuggestionSection
              title="Flujos nuevos sugeridos"
              accent="bg-emerald-500"
              items={flujosNuevos}
            />
          )}
          {flujosMejorar.length > 0 && (
            <FlujosSuggestionSection
              title="Flujos a mejorar"
              accent="bg-amber-500"
              items={flujosMejorar}
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Flujos guardados
        </h3>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : flujos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center">
            <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Aún no hay flujos guardados.</p>
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
    </div>
  );
}

function FlujosSuggestionSection({
  title, accent, items,
}: { title: string; accent: string; items: any[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider">{title}</h3>
        <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((f, idx) => {
          const secuencia: any[] = Array.isArray(f?.secuencia) ? f.secuencia : [];
          return (
            <div key={idx} className="relative rounded-2xl border border-border bg-card/40 p-5 pl-6 overflow-hidden">
              <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent}`} />
              <h4 className="font-display font-semibold">{f?.nombre ?? "Flujo"}</h4>
              {f?.trigger && (
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Trigger · <span className="text-foreground/80 normal-case tracking-normal">{f.trigger}</span>
                </div>
              )}
              {f?.descripcion && <p className="mt-2 text-sm text-muted-foreground">{f.descripcion}</p>}
              {f?.motivo && (
                <div className="mt-3 flex items-start gap-2 text-sm">
                  <Lightbulb className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Motivo</div>
                    <div className="text-muted-foreground">{f.motivo}</div>
                  </div>
                </div>
              )}
              {secuencia.length > 0 && (
                <ol className="space-y-2 mt-3">
                  {secuencia.map((s: any, i: number) => (
                    <li key={i} className="flex gap-3 items-start text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{s?.asunto ?? s?.nombre ?? `Paso ${i + 1}`}</div>
                        {s?.espera && <div className="text-xs text-muted-foreground">Espera: {s.espera}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------ CUERPO DEL EMAIL ------------------ */

function CuerpoEmail({ proyectoId }: { proyectoId: string }) {
  const callWebhook = useServerFn(callN8nWebhook);
  const [tipo, setTipo] = useState("promocional");
  const [idioma, setIdioma] = useState<"es" | "en">("es");
  const [objetivo, setObjetivo] = useState("");
  const [producto, setProducto] = useState("");
  const [segmento, setSegmento] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

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
      const get = (k: string) => (memData ?? []).find((r: any) => r.clave === k)?.valor ?? "";
      const tono_de_voz = get("tono_de_voz") || get("tono");

      const { data: proyecto } = await supabase
        .from("proyectos").select("nombre,pais").eq("id", proyectoId).maybeSingle();

      const { raw } = await callWebhook({
        data: {
          path: "email-marketing",
          payload: {
            accion: "generar_cuerpo",
            proyecto: {
              nombre_marca: proyecto?.nombre ?? "",
              pais: proyecto?.pais ?? "",
              tono_de_voz,
              preferencias,
              vetos,
            },
            email_data: { tipo, objetivo, producto, segmento, fecha, idioma },
          },
        },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let parsed: any = clean;
      try { parsed = JSON.parse(clean); } catch { /* texto plano */ }
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { /* noop */ }
      }
      const root = Array.isArray(parsed) ? parsed[0] : parsed;
      const res = root?.resultado ?? root ?? {};
      setResultado(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  function exportarHTML() {
    if (!resultado) return;
    const html = resultado.html ?? `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${resultado.asunto ?? "Email"}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;line-height:1.6;">
${[resultado.saludo, resultado.introduccion, resultado.cuerpo_principal, resultado.cta_texto, resultado.cierre, resultado.firma]
  .filter(Boolean)
  .map((l: string) => `<p>${String(l).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
  .join("\n")}
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `email-${Date.now()}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const sections: Array<[string, string | undefined]> = resultado
    ? [
        ["Saludo", resultado.saludo],
        ["Introducción", resultado.introduccion],
        ["Cuerpo principal", resultado.cuerpo_principal],
        ["CTA", resultado.cta_texto],
        ["Cierre", resultado.cierre],
        ["Firma", resultado.firma],
      ]
    : [];

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
          <Label className="text-xs">Idioma</Label>
          <Select value={idioma} onValueChange={(v) => setIdioma(v as "es" | "en")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="en">Inglés</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Objetivo</Label>
          <Textarea
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Ej: Anunciar el lanzamiento de la nueva colección"
            rows={3}
          />
        </div>
        <div>
          <Label className="text-xs">Producto</Label>
          <Input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Colección otoño" />
        </div>
        <div>
          <Label className="text-xs">Segmento</Label>
          <Input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ej: Clientas VIP" />
        </div>
        <div>
          <Label className="text-xs">Fecha</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
          <div className="space-y-4">
            {resultado.asunto && (
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Asunto</div>
                <div className="font-semibold">{resultado.asunto}</div>
              </div>
            )}
            {resultado.preheader && (
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Preheader</div>
                <div className="text-sm text-muted-foreground">{resultado.preheader}</div>
              </div>
            )}
            <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-4">
              {sections.map(([label, value]) =>
                value ? (
                  <div key={label}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{value}</div>
                  </div>
                ) : null,
              )}
            </div>
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

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === "") return [];
  return [v];
}
function itemText(x: any): string {
  if (typeof x === "string") return x;
  return x?.titulo ?? x?.nombre ?? x?.flujo ?? x?.recomendacion ?? x?.texto ?? JSON.stringify(x);
}
function itemDesc(x: any): string | null {
  if (typeof x === "string" || !x || typeof x !== "object") return null;
  return x?.descripcion ?? x?.razon ?? x?.detalle ?? null;
}


const CAMPOS_ANALISIS = [
  "resumen_flujos",
  "flujos_faltantes",
  "fortalezas",
  "debilidades",
  "recomendaciones",
  "conclusion",
];

function parseRawN8n(raw: string): any {
  const clean = String(raw ?? "").trim().replace(/^=+/, "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(clean); } catch { /* */ }
  let guard = 0;
  while (typeof parsed === "string" && guard++ < 3) {
    try { parsed = JSON.parse(parsed); } catch { break; }
  }
  return parsed;
}

// Busca en profundidad el objeto que contiene los campos del análisis
function extraerAnalisis(raw: string): any | null {
  const parsed = parseRawN8n(raw);
  const visto = new Set<any>();
  const stack: any[] = [parsed];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== "object" || visto.has(node)) continue;
    visto.add(node);
    if (!Array.isArray(node) && CAMPOS_ANALISIS.some((k) => node[k] != null)) return node;
    for (const v of Array.isArray(node) ? node : Object.values(node)) {
      if (v && typeof v === "object") stack.push(v);
      else if (typeof v === "string" && v.trim().startsWith("{")) {
        const inner = parseRawN8n(v);
        if (inner && typeof inner === "object") stack.push(inner);
      }
    }
  }
  return null;
}

function MetricasEmail({ proyectoId }: { proyectoId: string }) {

  const callWebhook = useServerFn(callN8nWebhook);
  const [cargando, setCargando] = useState(false);
  const [totalCampanas, setTotalCampanas] = useState<number | null>(null);
  const [campanas, setCampanas] = useState<any[]>([]);
  const [metricasCampanas, setMetricasCampanas] = useState<any[]>([]);
  const [flujos, setFlujos] = useState<any[]>([]);
  const [consultado, setConsultado] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<any | null>(null);

  async function verMetricas() {
    setCargando(true);
    try {
      const { data: proyecto } = await supabase
        .from("proyectos").select("nombre,klaviyo_api_key").eq("id", proyectoId).maybeSingle();
      const klaviyoKey = (proyecto as any)?.klaviyo_api_key as string | null | undefined;
      if (!klaviyoKey || klaviyoKey.trim().length === 0) {
        toast.error("Este proyecto no tiene Klaviyo API Key guardada.");
        return;
      }
      const { raw } = await callWebhook({
        data: {
          path: "klaviyo-metricas",
          payload: {
            klaviyo_api_key: klaviyoKey,
            proyecto_id: proyectoId,
            proyecto_nombre: proyecto?.nombre ?? "",
          },
        },
      });
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let parsed: any = null;
      try { parsed = JSON.parse(clean); } catch { /* */ }
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { /* */ }
      }
      const root = Array.isArray(parsed) ? parsed[0] : parsed;
      const res = root?.resultado ?? root ?? {};

      // eslint-disable-next-line no-console
      console.log("[klaviyo-metricas] raw:", raw);
      // eslint-disable-next-line no-console
      console.log("[klaviyo-metricas] parsed:", parsed);
      // eslint-disable-next-line no-console
      console.log("[klaviyo-metricas] keys root:", root && typeof root === "object" ? Object.keys(root) : root);
      // eslint-disable-next-line no-console
      console.log("[klaviyo-metricas] keys res:", res && typeof res === "object" ? Object.keys(res) : res);

      // Búsqueda recursiva de un array por nombres de clave candidatos
      const buscarArray = (obj: any, claves: string[], depth = 0): any[] => {
        if (!obj || typeof obj !== "object" || depth > 6) return [];
        for (const k of claves) {
          const v = (obj as any)[k];
          if (Array.isArray(v) && v.length > 0) return v;
        }
        for (const v of Object.values(obj)) {
          const found = buscarArray(v, claves, depth + 1);
          if (found.length > 0) return found;
        }
        return [];
      };

      const listaFlujos =
        res?.flujos_activos ?? res?.flujos_actuales ?? res?.flujos ??
        buscarArray(parsed, ["flujos_activos", "flujos_actuales", "flujos", "flows"]);
      const listaCampanas =
        res?.campanas_recientes ?? res?.campanas ??
        buscarArray(parsed, ["campanas_recientes", "campanas", "campaigns"]);
      const listaMetricas0 =
        res?.metricas_campanas ?? res?.metricas ?? root?.metricas_campanas;
      const listaMetricas =
        Array.isArray(listaMetricas0) && listaMetricas0.length > 0
          ? listaMetricas0
          : buscarArray(parsed, [
              "metricas_campanas",
              "metricas",
              "campaign_metrics",
              "metrics",
              "estadisticas",
            ]);
      // eslint-disable-next-line no-console
      console.log("[klaviyo-metricas] metricas_campanas detectadas:", listaMetricas);

      const total =
        res?.total_campanas ??
        res?.campanas_recientes_total ??
        (Array.isArray(listaCampanas) ? listaCampanas.length : null);

      setFlujos(Array.isArray(listaFlujos) ? listaFlujos : []);
      setCampanas(Array.isArray(listaCampanas) ? listaCampanas : []);
      setMetricasCampanas(Array.isArray(listaMetricas) ? listaMetricas : []);
      setTotalCampanas(typeof total === "number" ? total : null);
      setAnalisis(null);
      setConsultado(true);
      toast.success("Métricas de Klaviyo cargadas");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al consultar Klaviyo");
    } finally {
      setCargando(false);
    }
  }

  async function analizarConIA() {
    setAnalizando(true);
    try {
      const { data: proyecto } = await supabase
        .from("proyectos").select("nombre,pais").eq("id", proyectoId).maybeSingle();
      const { raw } = await callWebhook({
        data: {
          path: "email-marketing",
          payload: {
            accion: "analizar_metricas",
            proyecto: {
              nombre_marca: proyecto?.nombre ?? "",
              pais: proyecto?.pais ?? "",
              industria: (proyecto as any)?.industria ?? null,
            },
            flujos_activos: flujos,
            campanas_recientes: campanas,
            metricas_campanas: metricasCampanas,
          },
        },
      });
      const res = extraerAnalisis(raw);
      if (!res) {
        console.log("[analizar_metricas] raw sin campos reconocibles:", raw?.slice?.(0, 800));
        toast.error("El webhook respondió sin datos de análisis.");
        return;
      }
      setAnalisis(res);

      toast.success("Análisis generado");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al analizar con IA");
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 p-5">
        <div>
          <h3 className="font-display text-lg font-semibold">Klaviyo</h3>
          <p className="text-sm text-muted-foreground">
            Consulta las campañas recientes y los flujos activos de la cuenta conectada.
          </p>
        </div>
        <Button onClick={verMetricas} disabled={cargando} className="gradient-primary">
          {cargando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
          Ver métricas de Klaviyo
        </Button>
      </div>

      {consultado && (
        <>
          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Campañas recientes</div>
            <div className="font-display text-3xl font-bold mt-1">{totalCampanas ?? "—"}</div>
          </div>

          {campanas.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="h-4 w-4 text-primary" />
                <h4 className="font-display font-semibold">Campañas ({campanas.length})</h4>
              </div>
              <div className="space-y-3">
                {campanas.map((c: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-4">
                    <div className="font-medium">
                      {c?.nombre ?? c?.name ?? c?.asunto ?? c?.subject ?? `Campaña ${i + 1}`}
                    </div>
                    {(c?.fecha ?? c?.send_date ?? c?.date) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {c?.fecha ?? c?.send_date ?? c?.date}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {metricasCampanas.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h4 className="font-display font-semibold">Métricas detalladas</h4>
              </div>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="pb-3 font-medium">Campaña</th>
                      <th className="pb-3 font-medium">Fecha de envío</th>
                      <th className="pb-3 font-medium text-right">Enviados</th>
                      <th className="pb-3 font-medium text-right">Abiertos</th>
                      <th className="pb-3 font-medium text-right">Clics</th>
                      <th className="pb-3 font-medium text-right">Bajas</th>
                      <th className="pb-3 font-medium text-right">Tasa apertura</th>
                      <th className="pb-3 font-medium text-right">Tasa clics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {metricasCampanas.map((m: any, i: number) => {
                      const nombre = m?.campana_nombre ?? m?.campaña_nombre ?? m?.nombre_campana ?? m?.nombre ?? m?.name ?? m?.asunto ?? m?.subject ?? m?.campaign_name ?? `Campaña ${i + 1}`;
                      const fecha = m?.fecha_envio ?? m?.fecha_de_envio ?? m?.fecha ?? m?.send_date ?? m?.send_time ?? m?.date ?? m?.created ?? "—";
                      const enviados = Number(m?.enviados ?? m?.sent ?? m?.recipients ?? m?.send_count ?? 0);
                      const abiertos = Number(m?.abiertos ?? m?.opened ?? m?.open_count ?? m?.opens ?? 0);
                      const clics = Number(m?.clics ?? m?.clicks ?? m?.click_count ?? 0);
                      const bajas = Number(m?.bajas ?? m?.unsubscribed ?? m?.unsubscribes ?? m?.bounced ?? 0);
                      const tasaAperturaRaw = m?.tasa_apertura ?? m?.open_rate ?? m?.tasa_de_apertura;
                      const tasaClicsRaw = m?.tasa_clics ?? m?.click_rate ?? m?.tasa_de_clics;
                      const tasaApertura = fmtTasa(tasaAperturaRaw, enviados, abiertos);
                      const tasaClics = fmtTasa(tasaClicsRaw, enviados, clics);
                      return (
                        <tr key={i} className="hover:bg-background/30 transition-colors">
                          <td className="py-3 pr-4 font-medium">{nombre}</td>
                          <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{fecha}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(enviados)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(abiertos)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(clics)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{fmtNum(bajas)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{tasaApertura}</td>
                          <td className="py-3 text-right tabular-nums">{tasaClics}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Workflow className="h-4 w-4 text-primary" />
              <h4 className="font-display font-semibold">Flujos activos ({flujos.length})</h4>
            </div>
            {flujos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se encontraron flujos activos.</p>
            ) : (
              <div className="space-y-3">
                {flujos.map((f: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-4">
                    <div className="font-medium">{f?.nombre ?? f?.name ?? `Flujo ${i + 1}`}</div>
                    {(f?.trigger ?? f?.disparador) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Trigger: {f?.trigger ?? f?.disparador}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={analizarConIA} disabled={analizando} className="gradient-primary">
              {analizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {analizando ? "Analizando..." : "Analizar con IA"}
            </Button>
          </div>

          {analisis && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h4 className="font-display font-semibold">Análisis de métricas</h4>
              </div>

              {analisis?.resumen_flujos && (
                <div className="rounded-2xl border border-border bg-card/40 p-5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Resumen de flujos</div>
                  <p className="text-sm whitespace-pre-wrap">{analisis.resumen_flujos}</p>
                </div>
              )}

              {asArray(analisis?.flujos_faltantes).length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <h5 className="font-display font-semibold text-amber-300">Flujos faltantes</h5>
                  </div>
                  <ul className="space-y-2">
                    {asArray(analisis.flujos_faltantes).map((x: any, i: number) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium">{itemText(x)}</span>
                        {itemDesc(x) && <span className="text-muted-foreground"> — {itemDesc(x)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {asArray(analisis?.fortalezas).length > 0 && (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <h5 className="font-display font-semibold text-emerald-300">Fortalezas</h5>
                    </div>
                    <ul className="space-y-2">
                      {asArray(analisis.fortalezas).map((x: any, i: number) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{itemText(x)}</span>
                          {itemDesc(x) && <span className="text-muted-foreground"> — {itemDesc(x)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {asArray(analisis?.debilidades).length > 0 && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <h5 className="font-display font-semibold text-red-300">Debilidades</h5>
                    </div>
                    <ul className="space-y-2">
                      {asArray(analisis.debilidades).map((x: any, i: number) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{itemText(x)}</span>
                          {itemDesc(x) && <span className="text-muted-foreground"> — {itemDesc(x)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {asArray(analisis?.recomendaciones).length > 0 && (
                <div className="rounded-2xl border border-border bg-card/40 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    <h5 className="font-display font-semibold">Recomendaciones</h5>
                  </div>
                  <ul className="space-y-2">
                    {asArray(analisis.recomendaciones).map((x: any, i: number) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-primary font-semibold">{i + 1}.</span>
                        <span>
                          <span className="font-medium">{itemText(x)}</span>
                          {itemDesc(x) && <span className="text-muted-foreground"> — {itemDesc(x)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(analisis?.conclusion ?? analisis?.conclusión) && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Conclusión</div>
                  <p className="text-sm whitespace-pre-wrap">{analisis.conclusion ?? analisis.conclusión}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!consultado && !cargando && (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground">
          Pulsa “Ver métricas de Klaviyo” para cargar los datos.
        </div>
      )}
    </div>
  );
}
