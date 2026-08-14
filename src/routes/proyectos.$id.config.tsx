import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/proyectos/$id/config")({
  head: () => ({
    meta: [
      { title: "Integraciones del proyecto — Rebold" },
      { name: "description", content: "Configura la API Key de Klaviyo y otras integraciones del proyecto." },
      { property: "og:title", content: "Integraciones del proyecto — Rebold" },
      { name: "twitter:title", content: "Integraciones del proyecto — Rebold" },
      { property: "og:description", content: "Configura la API Key de Klaviyo y otras integraciones del proyecto." },
      { name: "twitter:description", content: "Configura la API Key de Klaviyo y otras integraciones del proyecto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfigPage,
});

function ConfigPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);

  const { data: proyecto, isLoading } = useQuery({
    queryKey: ["proyecto", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setApiKey(proyecto?.klaviyo_api_key ?? "");
  }, [proyecto?.klaviyo_api_key]);

  const guardar = useMutation({
    mutationFn: async () => {
      const value = apiKey.trim();
      if (value.length > 300) throw new Error("La API Key es demasiado larga.");
      const { error } = await supabase
        .from("proyectos")
        .update({ klaviyo_api_key: value === "" ? null : value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Integraciones guardadas");
      queryClient.invalidateQueries({ queryKey: ["proyecto", id] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="font-display text-xl font-semibold">Integraciones</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cualquier miembro del workspace puede ver y actualizar estas credenciales.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Klaviyo</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Se usa en la pestaña Email para traer flujos y métricas reales de la cuenta.
        </p>
        <div className="space-y-2">
          <label htmlFor="klaviyo-key" className="text-xs font-medium text-muted-foreground">
            Klaviyo API Key (Private key)
          </label>
          <div className="flex gap-2">
            <Input
              id="klaviyo-key"
              type={visible ? "text" : "password"}
              placeholder="pk_..."
              autoComplete="off"
              maxLength={300}
              value={apiKey}
              disabled={isLoading}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={visible ? "Ocultar API Key" : "Mostrar API Key"}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || isLoading}>
            {guardar.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Guardar
          </Button>
          {proyecto?.klaviyo_api_key ? (
            <span className="text-xs text-muted-foreground">API Key configurada</span>
          ) : (
            <span className="text-xs text-muted-foreground">Sin API Key</span>
          )}
        </div>
      </div>
    </div>
  );
}
