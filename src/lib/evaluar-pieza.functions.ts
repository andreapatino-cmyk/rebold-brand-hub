import { createServerFn } from "@tanstack/react-start";

const WEBHOOK_URL = "https://rebold2.app.n8n.cloud/webhook/evaluar-pieza";

export const evaluarPiezaProxy = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Webhook ${res.status}: ${text.slice(0, 200)}`);
    }
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { data: parsed };
  });
