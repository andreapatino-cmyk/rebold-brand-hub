import { createServerFn } from "@tanstack/react-start";

const ALLOWED = new Set([
  "evaluar-parrilla-email",
  "email-marketing",
  "generar-flujos-email",
  "generar-cuerpo-email",
  "klaviyo-metricas",
]);

export const callN8nWebhook = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as { path?: string; payload?: unknown };
    if (!d?.path || !ALLOWED.has(d.path)) {
      throw new Error(`Webhook no permitido: ${d?.path}`);
    }
    return { path: d.path, payload: d.payload ?? {} };
  })
  .handler(async ({ data }) => {
    const res = await fetch(`https://n8n-m0b3.onrender.com/webhook/${data.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data.payload),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
    return { raw: text };
  });
