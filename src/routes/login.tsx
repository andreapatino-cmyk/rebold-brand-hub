import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RLogo } from "@/components/RLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Inicia sesión — Rebold" },
      { name: "description", content: "Accede a Rebold para gestionar tus proyectos y parrillas de marketing." },
      { property: "og:title", content: "Inicia sesión — Rebold" },
      { name: "twitter:title", content: "Inicia sesión — Rebold" },
      { property: "og:description", content: "Accede a Rebold para gestionar tus proyectos y parrillas de marketing." },
      { name: "twitter:description", content: "Accede a Rebold para gestionar tus proyectos y parrillas de marketing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/proyectos", replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenido de vuelta");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Ya puedes empezar.");
      }
      navigate({ to: "/proyectos" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-card border-r border-border">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ background: "radial-gradient(60% 50% at 20% 20%, var(--primary) 0%, transparent 60%)" }} />
        <div className="relative flex items-center gap-3">
          <RLogo size={40} />
          <div>
            <div className="font-display font-bold text-xl">Rebold</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Marketing OS</div>
          </div>
        </div>
        <div className="relative">
          <h1 className="font-display text-4xl xl:text-5xl font-bold leading-tight">
            Planifica, evalúa y eleva <span className="text-primary">cada parrilla</span>.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-md">
            La plataforma todo-en-uno para agencias que quieren entregar contenido de marca con criterio,
            consistencia y resultados medibles.
          </p>
        </div>
        <div className="relative text-xs text-muted-foreground">© Rebold {new Date().getFullYear()}</div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <RLogo size={36} />
            <div className="font-display font-bold text-xl">Rebold</div>
          </div>

          <h2 className="font-display text-2xl font-bold">
            {mode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login"
              ? "Accede a tus proyectos y parrillas."
              : "Empieza a gestionar tus marcas en minutos."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@agencia.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>¿No tienes cuenta?{" "}
                <button onClick={() => setMode("signup")} className="text-primary font-medium hover:underline">
                  Regístrate
                </button>
              </>
            ) : (
              <>¿Ya tienes cuenta?{" "}
                <button onClick={() => setMode("login")} className="text-primary font-medium hover:underline">
                  Inicia sesión
                </button>
              </>
            )}
          </div>

          <div className="mt-8 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              Volver
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
