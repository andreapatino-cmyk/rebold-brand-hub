import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Upload, Sparkles, Loader2, Trash2, Image as ImageIcon, Video, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { evaluarPiezaProxy } from "@/lib/evaluar-pieza.functions";

export const Route = createFileRoute("/proyectos/$id/piezas")({
  component: PiezasPage,
});

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4";


interface Pieza {
  id: string;
  proyecto_id: string;
  url: string;
  storage_path: string | null;
  tipo: string;
  mime_type: string | null;
  nombre: string | null;
  evaluacion: unknown;
  puntuacion_global: number | null;
  created_at: string;
}

interface Criterio { nombre: string; score: number; descripcion?: string }

function PiezasPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [openPieza, setOpenPieza] = useState<Pieza | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const { data: piezas = [], isLoading } = useQuery({
    queryKey: ["piezas-list", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piezas").select("*")
        .eq("proyecto_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pieza[];
    },
  });

  // Refresh signed URLs for private bucket files
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paths = piezas.map(p => p.storage_path).filter(Boolean) as string[];
      if (paths.length === 0) return;
      const { data, error } = await supabase.storage.from("piezas").createSignedUrls(paths, 60 * 60 * 6);
      if (error || cancelled || !data) return;
      const map: Record<string, string> = {};
      data.forEach((s, i) => { if (s.signedUrl) map[paths[i]] = s.signedUrl; });
      setSignedUrls(map);
    })();
    return () => { cancelled = true; };
  }, [piezas]);

  const { data: proyecto } = useQuery({
    queryKey: ["proyecto-info", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("proyectos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const deletePieza = useMutation({
    mutationFn: async (p: Pieza) => {
      if (p.storage_path) {
        await supabase.storage.from("piezas").remove([p.storage_path]);
      }
      const { error } = await supabase.from("piezas").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["piezas-list", id] });
      toast.success("Pieza eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("piezas")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("piezas").getPublicUrl(path);
        const tipo = file.type.startsWith("video") ? "video" : "image";
        const { error: insErr } = await supabase.from("piezas").insert({
          proyecto_id: id,
          url: pub.publicUrl,
          storage_path: path,
          tipo,
          mime_type: file.type,
          nombre: file.name,
        });
        if (insErr) throw insErr;
      }
      toast.success("Piezas subidas");
      qc.invalidateQueries({ queryKey: ["piezas-list", id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function evaluarPieza(p: Pieza) {
    setEvaluatingId(p.id);
    try {
      // Download file from storage and convert to base64
      let fileBase64 = "";
      if (p.storage_path) {
        const { data: blob, error: dlErr } = await supabase.storage.from("piezas").download(p.storage_path);
        if (dlErr) throw dlErr;
        fileBase64 = await blobToBase64(blob);
      }

      const payload = {
        pieza_id: p.id,
        proyecto: proyecto ? {
          id: proyecto.id,
          nombre: proyecto.nombre,
          pais: proyecto.pais,
          redes: proyecto.redes,
        } : { id },
        archivo: {
          nombre: p.nombre,
          tipo: p.tipo,
          mime_type: p.mime_type,
          base64: fileBase64,
        },
      };

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Webhook ${res.status}`);
      const raw = await res.text();
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
      const evalObj = normalizeEval(parsed);

      const { error: upErr } = await supabase.from("piezas")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ evaluacion: evalObj as any, puntuacion_global: evalObj.puntuacion_global ?? null })
        .eq("id", p.id);
      if (upErr) throw upErr;

      toast.success("Pieza evaluada");
      qc.invalidateQueries({ queryKey: ["piezas-list", id] });
      setOpenPieza({ ...p, evaluacion: evalObj, puntuacion_global: evalObj.puntuacion_global ?? null });
    } catch (e) {
      toast.error("No se pudo evaluar: " + (e as Error).message);
    } finally {
      setEvaluatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Piezas</h2>
          <p className="text-sm text-muted-foreground">Sube imágenes o vídeos y evalúalos con IA.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gradient-primary">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Subiendo…" : "Subir piezas"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando piezas…</div>
      ) : piezas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <LayoutGrid className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-display text-lg font-semibold">Sin piezas todavía</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Sube JPG, PNG, WEBP o MP4 para verlas aquí y evaluarlas con IA.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {piezas.map((p) => {
            const src = (p.storage_path && signedUrls[p.storage_path]) || p.url;
            const score = p.puntuacion_global != null ? Number(p.puntuacion_global) : null;
            return (
              <div key={p.id} className="group rounded-xl bg-card border border-border overflow-hidden hover:border-primary/40 transition">
                <div className="relative aspect-square bg-muted">
                  {p.tipo === "video" ? (
                    <video src={src} className="w-full h-full object-cover" controls preload="metadata" />
                  ) : (
                    <img src={src} alt={p.nombre ?? ""} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-background/80 backdrop-blur px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {p.tipo === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                    {p.tipo}
                  </div>
                  {score != null && (
                    <div className={`absolute top-2 right-2 rounded-md px-2 py-0.5 text-xs font-display font-bold bg-background/80 backdrop-blur ${
                      score >= 80 ? "text-primary" : score >= 60 ? "text-[color:var(--success)]" :
                      score >= 40 ? "text-[color:var(--warning)]" : "text-destructive"
                    }`}>{Math.round(score)}/100</div>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="text-xs text-muted-foreground truncate">{p.nombre ?? "Sin nombre"}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 gradient-primary"
                      onClick={() => evaluarPieza(p)}
                      disabled={evaluatingId === p.id}
                    >
                      {evaluatingId === p.id
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Evaluando…</>
                        : <><Sparkles className="h-3 w-3" /> {p.evaluacion ? "Re-evaluar" : "Evaluar"}</>}
                    </Button>
                    {p.evaluacion != null && (
                      <Button size="sm" variant="outline" onClick={() => setOpenPieza(p)}>Ver</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deletePieza.mutate(p)} title="Eliminar">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!openPieza} onOpenChange={(o) => !o && setOpenPieza(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Evaluación de pieza
            </DialogTitle>
          </DialogHeader>
          {openPieza && <EvalView pieza={openPieza} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EvalView({ pieza }: { pieza: Pieza }) {
  const evalObj = normalizeEval(pieza.evaluacion);
  const global = evalObj.puntuacion_global ?? 0;
  const tier = global >= 80 ? "Excelente" : global >= 60 ? "Sólida" : global >= 40 ? "Mejorable" : "Crítica";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl bg-muted/40 p-4">
        <div className="font-display text-4xl font-bold tabular-nums">{Math.round(global)}<span className="text-base text-muted-foreground">/100</span></div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Resultado</div>
          <div className="font-display text-lg font-semibold">{tier}</div>
        </div>
      </div>

      {evalObj.resumen && (
        <p className="text-sm text-muted-foreground">{evalObj.resumen}</p>
      )}

      <div className="space-y-4">
        {evalObj.criterios.map((c, i) => (
          <div key={i}>
            <div className="flex items-baseline justify-between mb-1">
              <div>
                <div className="font-medium text-sm">{c.nombre}</div>
                {c.descripcion && <div className="text-xs text-muted-foreground mt-0.5">{c.descripcion}</div>}
              </div>
              <div className="font-display font-bold tabular-nums">{c.score}<span className="text-muted-foreground text-xs">/100</span></div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{
                width: `${Math.max(0, Math.min(100, c.score))}%`,
                background: c.score >= 60 ? "linear-gradient(90deg, var(--primary), var(--primary-glow))" : "var(--muted-foreground)",
              }} />
            </div>
          </div>
        ))}
      </div>

      {evalObj.sugerencias.length > 0 && (
        <div>
          <h4 className="font-display font-semibold text-sm mb-2">Sugerencias</h4>
          <ul className="space-y-2">
            {evalObj.sugerencias.map((s, i) => (
              <li key={i} className="text-sm rounded-lg bg-muted/40 p-3">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- helpers ---

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip data:...;base64, prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface NormalizedEval {
  puntuacion_global: number | null;
  criterios: Criterio[];
  sugerencias: string[];
  resumen?: string;
}

const CRITERIOS_KEYS = [
  ["proporcion_texto_imagen", "Proporción texto/imagen"],
  ["exceso_ia_generativa", "Exceso de IA generativa"],
  ["jerarquia_visual", "Jerarquía visual"],
  ["coherencia_marca", "Coherencia con la marca"],
  ["adaptacion_formato", "Adaptación al formato"],
  ["calidad_copy", "Calidad del copy"],
] as const;

function normalizeEval(raw: unknown): NormalizedEval {
  let obj: any = raw;
  if (Array.isArray(obj)) obj = obj[0];
  if (typeof obj === "string") {
    try { obj = JSON.parse(obj); } catch { /* keep */ }
  }
  if (!obj || typeof obj !== "object") {
    return { puntuacion_global: null, criterios: [], sugerencias: [] };
  }

  // unwrap common containers
  if (obj.output) obj = obj.output;
  if (obj.data) obj = obj.data;
  if (obj.evaluacion && typeof obj.evaluacion === "object") obj = { ...obj, ...obj.evaluacion };

  let criterios: Criterio[] = [];
  if (Array.isArray(obj.criterios)) {
    criterios = obj.criterios.map((c: any) => ({
      nombre: c.nombre ?? c.name ?? c.criterio ?? "Criterio",
      score: Number(c.score ?? c.puntuacion ?? c.value ?? 0),
      descripcion: c.descripcion ?? c.description ?? c.comentario,
    }));
  } else {
    // try flat keys
    for (const [k, label] of CRITERIOS_KEYS) {
      const v = obj[k];
      if (v != null) {
        if (typeof v === "object") {
          criterios.push({ nombre: label, score: Number(v.score ?? v.puntuacion ?? 0), descripcion: v.descripcion ?? v.comentario });
        } else {
          criterios.push({ nombre: label, score: Number(v) });
        }
      }
    }
  }

  let sugerencias: string[] = [];
  const rawSug = obj.sugerencias ?? obj.recomendaciones ?? [];
  if (Array.isArray(rawSug)) {
    sugerencias = rawSug.map((s: any) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") return s.titulo ?? s.descripcion ?? s.text ?? JSON.stringify(s);
      return String(s);
    });
  }

  const puntuacion_global = obj.puntuacion_global ?? obj.score ?? obj.global ??
    (criterios.length ? criterios.reduce((a, c) => a + c.score, 0) / criterios.length : null);

  return {
    puntuacion_global: puntuacion_global != null ? Number(puntuacion_global) : null,
    criterios,
    sugerencias,
    resumen: obj.resumen ?? obj.summary,
  };
}
