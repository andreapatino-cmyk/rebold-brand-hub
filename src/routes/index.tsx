import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { RLogo } from "@/components/RLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rebold — Marketing OS para agencias" },
      { name: "description", content: "Plataforma para gestionar parrillas, evaluaciones, piezas y email marketing." },
      { property: "og:title", content: "Rebold — Marketing OS para agencias" },
      { name: "twitter:title", content: "Rebold — Marketing OS para agencias" },
      { property: "og:description", content: "Plataforma para gestionar parrillas, evaluaciones, piezas y email marketing." },
      { name: "twitter:description", content: "Plataforma para gestionar parrillas, evaluaciones, piezas y email marketing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/proyectos" : "/login", replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <RLogo size={56} />
        <p className="text-sm text-muted-foreground">Cargando Rebold…</p>
      </div>
    </div>
  );
}
