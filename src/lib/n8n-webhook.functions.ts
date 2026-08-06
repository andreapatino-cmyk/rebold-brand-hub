import { createServerFn } from "@tanstack/react-start";

const ALLOWED = new Set([
  "evaluar-parrilla-email",
  "email-marketing",
  "generar-flujos-email",
  "generar-cuerpo-email",
  "klaviyo-metricas",
]);

const BASE = "https://n8n-m0b3.onrender.com/webhook";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postWithRetry(path: string, payload: unknown, attempts = 3): Promise<string> {
  let lastStatus = 0;
  let lastText = "";

  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e: any) {
      // Red caída o timeout: reintentar si quedan intentos
      if (i < attempts - 1) {
        await sleep(4000 * (i + 1));
        continue;
      }
      throw new Error(`No se pudo conectar con n8n: ${e?.message ?? "timeout"}`);
    }

    const text = await res.text();
    if (res.ok) return text;

    lastStatus = res.status;
    lastText = text;

    // 503 = instancia dormida / "Database is not ready" (cold start en Render) → reintentar
    if (res.status === 503 && i < attempts - 1) {
      await sleep(5000 * (i + 1));
      continue;
    }
    break;
  }

  // Mensajes limpios según el tipo de fallo (sin HTML crudo)
  if (lastStatus === 404 && lastText.includes("Cannot")) {
    throw new Error(
      `El webhook "${path}" no está registrado en n8n (404). Abre el workflow en n8n, verifica que la ruta del nodo Webhook sea exactamente "${path}" y activa el workflow (toggle "Active").`
    );
  }
  if (lastStatus === 503) {
    throw new Error(
      "n8n se está despertando (cold start en Render). Espera 20-30 segundos y reintenta."
    );
  }
  const clean = lastText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  throw new Error(`Webhook ${lastStatus}: ${clean.slice(0, 180) || "Error desconocido"}`);
}

export const callN8nWebhook = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as { path?: string; payload?: unknown };
    if (!d?.path || !ALLOWED.has(d.path)) {
      throw new Error(`Webhook no permitido: ${d?.path}`);
    }
    return { path: d.path, payload: d.payload ?? {} };
  })
  .handler(async ({ data }) => {
    const raw = await postWithRetry(data.path, data.payload);
    return { raw };
  });
