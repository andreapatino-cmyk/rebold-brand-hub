import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Loader2, Upload, Trash2, X, Link as LinkIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ImportRow = {
  fecha: string;
  red: string;
  tipo: string;
  titulo: string;
  copy: string;
  _error?: string;
};

function parseFecha(raw: any, year: number, month: number): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  if (/^\d{1,2}$/.test(s)) return `${year}-${pad(month)}-${pad(+s)}`;
  return "";
}

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

  // --- Nueva publicación ---
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

  // --- Eliminar publicación ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePublicacion, setDeletePublicacion] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const openDeletePublicacion = (p: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletePublicacion(p);
    setDeleteOpen(true);
  };

  const confirmDeletePublicacion = async () => {
    if (!deletePublicacion || !parrilla) return;
    setDeleting(true);
    const { error } = await supabase.from("publicaciones").delete().eq("id", deletePublicacion.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Publicación eliminada");
    setDeleteOpen(false);
    qc.invalidateQueries({ queryKey: ["publicaciones", parrilla.id] });
  };

  // --- Editar publicación ---
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ fecha: "", red: "Instagram", tipo: "Post", titulo: "", copy: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditPublicacion = (p: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditId(p.id);
    setEditForm({
      fecha: p.fecha,
      red: p.red,
      tipo: p.tipo ?? "Post",
      titulo: p.titulo ?? "",
      copy: p.copy ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editId || !parrilla) return;
    if (!editForm.titulo.trim()) return toast.error("Añade un título");
    if (!editForm.fecha) return toast.error("Añade una fecha");
    setSavingEdit(true);
    const { error } = await supabase.from("publicaciones").update({
      fecha: editForm.fecha,
      red: editForm.red,
      tipo: editForm.tipo,
      titulo: editForm.titulo.trim(),
      copy: editForm.copy.trim() || null,
    }).eq("id", editId);
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    toast.success("Publicación actualizada");
    setEditOpen(false);
    setEditId(null);
    qc.invalidateQueries({ queryKey: ["publicaciones", parrilla.id] });
  };

  // --- Evaluación ---
  const [evaluando, setEvaluando] = useState(false);

  // --- Importar desde URL ---
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);

  const importarDesdeUrl = async () => {
    const url = urlValue.trim();
    if (!url) return toast.error("Pega una URL válida");
    try { new URL(url); } catch { return toast.error("URL no válida"); }

    setImportingUrl(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch("https://n8n-m0b3.onrender.com/webhook/scraping-parrilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`El webhook respondió con estado ${res.status}`);
      const raw = await res.text();
      if (!raw) throw new Error("El webhook devolvió una respuesta vacía.");
      const clean = raw.startsWith("=") ? raw.slice(1) : raw;
      let webhookJson: any;
      try { webhookJson = JSON.parse(clean); }
      catch (e) { throw new Error("No se pudo parsear la respuesta del webhook como JSON."); }
      // Algunos webhooks devuelven JSON doblemente serializado
      if (typeof webhookJson === "string") {
        try { webhookJson = JSON.parse(webhookJson); } catch { /* keep string */ }
      }

      let root = Array.isArray(webhookJson) ? webhookJson[0] : webhookJson;
      if (typeof root === "string") {
        try { root = JSON.parse(root); } catch { /* ignore */ }
      }
      const evaluacion = root?.evaluacion ?? root;
      if (!evaluacion || (evaluacion.puntuacion_global == null && !evaluacion.criterios)) {
        throw new Error("El webhook no devolvió una evaluación válida.");
      }

      const criteriosObj = evaluacion.criterios ?? {};
      const criteriosArr = Object.entries(criteriosObj).map(([k, v]: [string, any]) => ({
        nombre: k,
        score: Math.round(Number(v?.puntaje ?? v?.score ?? 0)) * 10,
        nivel: v?.nivel,
        descripcion: v?.observacion ?? v?.descripcion ?? "",
      }));

      const evalId = `local-${Date.now()}`;
      const evalPayload = {
        id: evalId,
        puntuacion_global: Number(evaluacion.puntuacion_global ?? root?.puntuacion_global ?? 0),
        nivel_global: evaluacion.nivel_global ?? root?.nivel_global,
        criterios: criteriosArr,
        alertas: evaluacion.alertas ?? root?.alertas ?? [],
        sugerencias: evaluacion.sugerencias ?? root?.sugerencias ?? [],
        resumen: evaluacion.resumen ?? root?.resumen ?? "",
        parrilla_id: parrilla?.id,
        proyecto_id: proyectoId,
        origen_url: url,
      };
      sessionStorage.setItem(`evaluacion:${evalId}`, JSON.stringify(evalPayload));

      setImportingUrl(false);
      setUrlOpen(false);
      setUrlValue("");
      navigate({
        to: "/proyectos/$id/evaluacion",
        params: { id: proyectoId },
        search: { evalId },
      });
    } catch (e: any) {
      setImportingUrl(false);
      if (e?.name === "AbortError") toast.error("El webhook tardó demasiado en responder.");
      else toast.error(e?.message ?? "Error al importar desde URL");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // --- Importar Excel ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
      if (!rows.length) { toast.error("El archivo está vacío"); return; }
      const norm = (k: string) => k.toString().trim().toLowerCase();
      const parsed: ImportRow[] = rows.map((r) => {
        const map: Record<string, any> = {};
        for (const k of Object.keys(r)) map[norm(k)] = r[k];
        const fecha = parseFecha(map["fecha"], view.y, view.m + 1);
        const redRaw = String(map["redes"] ?? map["red"] ?? "").trim();
        const red = redRaw.split(",")[0].trim();
        const tipo = String(map["formato"] ?? map["tipo"] ?? "").trim() || "Post";
        const titulo = String(map["concepto"] ?? map["hook"] ?? map["título"] ?? map["titulo"] ?? "").trim();
        const copy = String(map["copy corto"] ?? map["copy largo"] ?? map["copy"] ?? "").trim();
        let _error: string | undefined;
        if (!fecha) _error = "Fecha inválida";
        else if (!red) _error = "Falta Red";
        else if (!titulo) _error = "Falta Concepto";
        return { fecha, red, tipo, titulo, copy, _error };
      });
      setImportRows(parsed);
      setImportOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el archivo");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!parrilla) return;
    const validas = importRows.filter((r) => !r._error);
    if (!validas.length) return toast.error("No hay filas válidas para importar");
    setImporting(true);
    const { error } = await supabase.from("publicaciones").insert(
      validas.map((r) => ({
        parrilla_id: parrilla.id,
        proyecto_id: proyectoId,
        fecha: r.fecha,
        red: r.red,
        tipo: r.tipo,
        titulo: r.titulo,
        copy: r.copy || null,
      }))
    );
    setImporting(false);
    if (error) return toast.error(error.message);
    toast.success(`${validas.length} publicaciones importadas`);
    setImportOpen(false);
    setImportRows([]);
    qc.invalidateQueries({ queryKey: ["publicaciones", parrilla.id] });
  };

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
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      let webhookJson: any = null;
      try {
        const res = await fetch("https://n8n-m0b3.onrender.com/webhook/evaluar-parrilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`El webhook respondió con estado ${res.status}`);
        const text = await res.text();
        try { webhookJson = text ? JSON.parse(text) : null; } catch { webhookJson = null; }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          throw new Error("El webhook tardó demasiado en responder. Inténtalo de nuevo.");
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

      const root = Array.isArray(webhookJson) ? webhookJson[0] : webhookJson;
      const evaluacion = root?.evaluacion ?? root;

      if (!evaluacion || (evaluacion.puntuacion_global == null && !evaluacion.criterios)) {
        throw new Error("El webhook no devolvió una evaluación válida.");
      }

      const criteriosObj = evaluacion.criterios ?? {};
      const criteriosArr = Object.entries(criteriosObj).map(([k, v]: [string, any]) => ({
        nombre: k,
        score: Math.round(Number(v?.puntaje ?? v?.score ?? 0)) * 10,
        nivel: v?.nivel,
        descripcion: v?.observacion ?? v?.descripcion ?? "",
      }));

      const evalId = `local-${Date.now()}`;

      const evalPayload = {
        id: evalId,
        puntuacion_global: Number(evaluacion.puntuacion_global ?? root?.puntuacion_global ?? 0),
        nivel_global: evaluacion.nivel_global ?? root?.nivel_global,
        criterios: criteriosArr,
        alertas: evaluacion.alertas ?? root?.alertas ?? [],
        sugerencias: evaluacion.sugerencias ?? root?.sugerencias ?? [],
        resumen: evaluacion.resumen ?? root?.resumen ?? "",
        parrilla_id: parrilla.id,
        proyecto_id: proyectoId,
      };

      sessionStorage.setItem(`evaluacion:${evalId}`, JSON.stringify(evalPayload));

      await supabase.from("proyectos").update({
        estado_ultima_parrilla: evalPayload.puntuacion_global >= 75 ? "aprobada" : "en_revision",
        updated_at: new Date().toISOString(),
      }).eq("id", proyectoId);

      setEvaluando(false);
      navigate({
        to: "/proyectos/$id/evaluacion",
        params: { id: proyectoId },
        search: { evalId },
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importar Excel
          </Button>
          <Button variant="outline" onClick={() => setUrlOpen(true)}>
            <LinkIcon className="h-4 w-4 mr-2" />
            Importar desde URL
          </Button>
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
                          className="group/pub relative text-[10px] leading-tight px-1.5 py-1 rounded bg-primary/15 text-primary border-l-2 border-primary truncate cursor-pointer hover:bg-primary/25 transition"
                          title={`${p.titulo ?? ""} — clic para editar`}
                          onClick={(e) => openEditPublicacion(p, e)}
                        >
                          <span className="font-semibold uppercase tracking-wider mr-1">{p.red.slice(0,2)}</span>
                          {p.titulo}
                          {/* Botón eliminar — aparece al hacer hover */}
                          <button
                            className="absolute right-0.5 top-0.5 opacity-0 group-hover/pub:opacity-100 transition p-0.5 rounded hover:bg-destructive/20"
                            onClick={(e) => openDeletePublicacion(p, e)}
                            title="Eliminar publicación"
                          >
                            <X className="h-2.5 w-2.5 text-destructive" />
                          </button>
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

      {/* Dialog nueva publicación */}
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

      {/* Dialog importar Excel */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Previsualizar importación</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            {importRows.filter((r) => !r._error).length} válidas · {importRows.filter((r) => r._error).length} con errores · {importRows.length} totales
          </div>
          <div className="max-h-[420px] overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Red</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Título</th>
                  <th className="px-2 py-2">Copy</th>
                  <th className="px-2 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((r, i) => (
                  <tr key={i} className={`border-t border-border/60 ${r._error ? "bg-destructive/10" : ""}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.fecha || "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.red || "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.tipo}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.titulo}>{r.titulo || "—"}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.copy}>{r.copy}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r._error
                        ? <span className="text-destructive">{r._error}</span>
                        : <span className="text-primary">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancelar</Button>
            <Button onClick={confirmImport} disabled={importing} className="gradient-primary">
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Importar {importRows.filter((r) => !r._error).length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog importar desde URL */}
      <Dialog open={urlOpen} onOpenChange={(o) => { if (!importingUrl) setUrlOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar desde URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>URL pública</Label>
            <Input
              type="url"
              placeholder="https://ejemplo.com/parrilla"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              disabled={importingUrl}
              onKeyDown={(e) => { if (e.key === "Enter" && !importingUrl) importarDesdeUrl(); }}
            />
            <p className="text-xs text-muted-foreground">
              Analizaremos el contenido de la URL y generaremos una evaluación automática.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlOpen(false)} disabled={importingUrl}>Cancelar</Button>
            <Button onClick={importarDesdeUrl} disabled={importingUrl} className="gradient-primary">
              {importingUrl ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
              {importingUrl ? "Procesando…" : "Importar y evaluar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog eliminar publicación */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar publicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deletePublicacion?.titulo}</strong> del {deletePublicacion?.fecha}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePublicacion} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function buildCalendar(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7;
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
