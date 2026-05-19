import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, LayoutGrid, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/proyectos/$id")({
  component: ProyectoLayout,
});

function ProyectoLayout() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const { data: proyecto } = useQuery({
    queryKey: ["proyecto", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const path = location.pathname;
  const tabs = [
    { to: "/proyectos/$id/parrilla" as const, label: "Parrilla", icon: Calendar, key: "parrilla" },
    { to: "/proyectos/$id/piezas" as const, label: "Piezas", icon: LayoutGrid, key: "piezas" },
  ];

  const isActive = (key: string) => {
    if (key === "parrilla") return path.endsWith("/parrilla") || path === `/proyectos/${id}` || path === `/proyectos/${id}/` || path.endsWith("/evaluacion") || path.endsWith("/sugerencias");
    return path.endsWith(`/${key}`);
  };

  return (
    <AppShell>
      <div className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-6 pt-6">
          <Link to="/proyectos" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3 mr-1" /> Proyectos
          </Link>
          <div className="mt-3 flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold">{proyecto?.nombre ?? "Cargando…"}</h1>
              <div className="flex items-center gap-3 mt-2">
                {proyecto?.pais && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" /> {proyecto.pais}
                  </span>
                )}
                <div className="flex gap-1.5">
                  {(proyecto?.redes ?? []).map((r: string) => (
                    <Badge key={r} variant="secondary" className="text-[10px] uppercase tracking-wider">{r}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <nav className="flex gap-1 mt-6 -mb-px">
            {tabs.map((t) => {
              const active = isActive(t.key);
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  params={{ id }}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </div>
    </AppShell>
  );
}
