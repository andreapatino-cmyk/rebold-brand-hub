// Client-safe parsing helpers for the feedback-semanal webhook response.

export function parseRaw(text: string): any {
  let t = (text ?? "").trim().replace(/^=+\s*/, "");
  for (let i = 0; i < 3; i++) {
    try {
      const p = JSON.parse(t);
      if (typeof p === "string") {
        t = p.trim().replace(/^=+\s*/, "");
        continue;
      }
      return p;
    } catch {
      return null;
    }
  }
  return null;
}

export function findResultados(node: any, depth = 0): any[] {
  if (!node || depth > 6) return [];
  if (Array.isArray(node)) {
    if (node.some((x) => x && typeof x === "object" && ("clasificaciones" in x || "proyecto_id" in x))) {
      return node;
    }
    for (const item of node) {
      const found = findResultados(item, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (typeof node === "object") {
    if (Array.isArray((node as any).resultados)) return findResultados((node as any).resultados, depth + 1);
    for (const v of Object.values(node)) {
      const found = findResultados(v, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

export type MemoriaRowInput = {
  proyecto_id: string;
  clave: string;
  valor: string;
  fuente: string;
  community_manager: string;
};

/** Turns the webhook payload into memoria_cliente rows. */
export function buildMemoriaRows(
  raw: string,
  opts: { community_manager: string; proyectoIds: string[] },
): MemoriaRowInput[] {
  const parsed = parseRaw(raw);
  console.log("[feedback-semanal] parsed:", parsed);
  const resultados = findResultados(parsed);
  console.log("[feedback-semanal] resultados:", resultados);
  const allowed = new Set(opts.proyectoIds);
  const rows: MemoriaRowInput[] = [];
  for (const r of resultados) {
    const pid = String(r?.proyecto_id ?? "");
    if (!allowed.has(pid)) continue;
    const clasificaciones = Array.isArray(r?.clasificaciones) ? r.clasificaciones : [];
    for (const c of clasificaciones) {
      const clave = String(c?.clave ?? "").trim().toLowerCase();
      const valor = String(c?.valor ?? "").trim();
      if (!clave || !valor) continue;
      rows.push({
        proyecto_id: pid,
        clave,
        valor,
        fuente: "feedback-semanal",
        community_manager: opts.community_manager,
      });
    }
  }
  console.log("[feedback-semanal] filas a insertar:", rows);
  return rows;
}
