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
