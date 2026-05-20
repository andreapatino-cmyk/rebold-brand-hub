import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Globe, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { TeamDialog } from "@/components/TeamDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/proyectos/")({
  component: ProyectosPage,
});

const REDES = ["Instagram", "TikTok", "LinkedIn", "X", "Facebook", "YouTube"];

function estadoStyles(estado: string | null) {
  switch (estado) {
    case "aprobada": return "bg-primary/15 text-primary border-primary/30";
    case "en_revision": return "bg-warning/15 text-[color:var(--warning)] border-[color:var(--warning)]/30";
    case "pendiente":
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function estadoLabel(e: string | null) {
  return ({ aprobada: "Aprobada", en_revision: "En revisión", pendiente: "Pendiente" } as any)[e ?? "pendiente"] ?? "Pendiente";
}

function ProyectosPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const { data: workspaceId } = useQuery({
    queryKey: ["my-workspace", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.workspace_id ?? null;
    },
  });

  const { data: proyectos = [], isLoading } = useQuery({
    queryKey: ["proyectos"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [pais, setPais] = useState("");
  const [selRedes, setSelRedes] = useState<string[]>(["Instagram"]);
  const [saving, setSaving] = useState(false);

  const toggle = (r: string) =>
    setSelRedes((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);

  const create = async () => {
    if (!nombre.trim()) return toast.error("El nombre es obligatorio");
    if (!workspaceId) return toast.error("No se encontró tu workspace");
    setSaving(true);
    const { error } = await supabase.from("proyectos").insert({
      user_id: user!.id,
      workspace_id: workspaceId,
      nombre: nombre.trim(),
      pais: pais.trim() || null,
      redes: selRedes,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Proyecto creado");
    setOpen(false);
    setNombre(""); setPais(""); setSelRedes(["Instagram"]);
    qc.invalidateQueries({ queryKey: ["proyectos"] });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Workspace</div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Proyectos de marca</h1>
            <p className="text-muted-foreground mt-1">Gestiona las parrillas y piezas de cada cliente.</p>
          </div>
          <div className="flex items-center gap-2">
            {user && workspaceId && <TeamDialog workspaceId={workspaceId} currentUserId={user.id} />}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary glow-primary">
                  <Plus className="h-4 w-4 mr-2" /> Nuevo proyecto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo proyecto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nombre de la marca</Label>
                    <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Acme Co." />
                  </div>
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Input value={pais} onChange={(e) => setPais(e.target.value)} placeholder="España" />
                  </div>
                  <div className="space-y-2">
                    <Label>Redes activas</Label>
                    <div className="flex flex-wrap gap-2">
                      {REDES.map((r) => {
                        const active = selRedes.includes(r);
                        return (
                          <button
                            type="button"
                            key={r}
                            onClick={() => toggle(r)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={create} disabled={saving} className="gradient-primary">
                    {saving ? "Creando…" : "Crear proyecto"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>


        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : proyectos.length === 0 ? (
          <EmptyState onCreate={() => setOpen(true)} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {proyectos.map((p) => (
              <Link
                key={p.id}
                to="/proyectos/$id"
                params={{ id: p.id }}
                className="group relative rounded-xl bg-card border border-border p-5 hover:border-primary/60 transition overflow-hidden"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/10 blur-2xl opacity-0 group-hover:opacity-100 transition" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-semibold text-lg leading-tight">{p.nombre}</h3>
                      {p.pais && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <Globe className="h-3 w-3" /> {p.pais}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {(p.redes ?? []).map((r: string) => (
                      <Badge key={r} variant="secondary" className="text-[10px] uppercase tracking-wider">
                        {r}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Última parrilla</span>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full border ${estadoStyles(p.estado_ultima_parrilla)}`}>
                      {estadoLabel(p.estado_ultima_parrilla)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl gradient-primary glow-primary flex items-center justify-center mb-4">
        <Sparkles className="h-6 w-6 text-primary-foreground" />
      </div>
      <h3 className="font-display text-xl font-semibold">Aún no hay proyectos</h3>
      <p className="text-muted-foreground mt-1 text-sm">Crea tu primera marca para empezar a planificar.</p>
      <Button onClick={onCreate} className="mt-6 gradient-primary">
        <Plus className="h-4 w-4 mr-2" /> Crear proyecto
      </Button>
    </div>
  );
}
