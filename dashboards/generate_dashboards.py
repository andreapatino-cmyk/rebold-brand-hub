"""
Rebold Email Intelligence — Dashboard Generator v3
Lee campanas y flujos de Klaviyo y genera 4 dashboards HTML publicos
"""
import requests
import json
import os
import traceback
from datetime import datetime, timedelta

BRANDS = {
    "granite": {
        "name": "Granite Nutrition",
        "emoji": "🏋️",
        "category": "Suplementos deportivos · USA",
        "color": "#B5F23D",
        "color_dim": "rgba(181,242,61,0.12)",
        "api_key": os.environ.get("GRANITE_API_KEY", ""),
        "conversion_metric_id": os.environ.get("GRANITE_METRIC_ID", "T3ZNfY"),
        "output_file": "granite_dashboard.html",
        "brand_key": "granite",
    },
    "ayoba": {
        "name": "Ayoba",
        "emoji": "🥩",
        "category": "Biltong y droewors · USA",
        "color": "#F2A93D",
        "color_dim": "rgba(242,169,61,0.12)",
        "api_key": os.environ.get("AYOBA_API_KEY", ""),
        "conversion_metric_id": os.environ.get("AYOBA_METRIC_ID", "Q8VsyA"),
        "output_file": "ayoba_dashboard.html",
        "brand_key": "ayoba",
    },
    "brooklyn": {
        "name": "Brooklyn Biltong",
        "emoji": "🥩",
        "category": "Biltong artesanal · USA",
        "color": "#3DA8F2",
        "color_dim": "rgba(61,168,242,0.12)",
        "api_key": os.environ.get("BROOKLYN_API_KEY", ""),
        "conversion_metric_id": os.environ.get("BROOKLYN_METRIC_ID", "VDmt66"),
        "output_file": "brooklyn_dashboard.html",
        "brand_key": "brooklyn",
    },
    "beg": {
        "name": "Beg & Barker",
        "emoji": "🐾",
        "category": "Snacks para mascotas · USA",
        "color": "#A78BFA",
        "color_dim": "rgba(167,139,250,0.12)",
        "api_key": os.environ.get("BEG_API_KEY", ""),
        "conversion_metric_id": os.environ.get("BEG_METRIC_ID", "SJAjCL"),
        "output_file": "beg_dashboard.html",
        "brand_key": "beg",
    },
}

FLUJOS_POR_MARCA = {
    "granite": [
        {"id": "winback", "name": "Win-Back 60 dias", "desc": "Para compradores inactivos.", "tags": ["3 emails", "Alto impacto"]},
        {"id": "upsell", "name": "Upsell post-compra", "desc": "Producto complementario.", "tags": ["2 emails", "LTV"]},
        {"id": "educativo", "name": "Educativo post-primera compra", "desc": "4 emails de valor.", "tags": ["4 emails", "28 dias"]},
        {"id": "abandono", "name": "Abandono de carrito", "desc": "Reemplazar flujo con 0% conversion.", "tags": ["3 emails", "Urgente"]},
        {"id": "vip", "name": "VIP Fidelizacion", "desc": "Para clientes con 3+ compras.", "tags": ["3 emails", "Retencion"]},
    ],
    "ayoba": [
        {"id": "winback", "name": "Win-Back 45 dias", "desc": "Para clientes sin reorden.", "tags": ["3 emails", "45-60 dias"]},
        {"id": "replenishment", "name": "Reabastecimiento", "desc": "Recordatorio de reorden.", "tags": ["2 emails", "Recurrencia"]},
        {"id": "bundle", "name": "Bundle education", "desc": "Biltong + droewors juntos.", "tags": ["2 emails", "AOV"]},
    ],
    "brooklyn": [
        {"id": "welcome", "name": "Welcome Series", "desc": "Historia vs jerky americano.", "tags": ["3 emails", "7 dias"]},
        {"id": "winback", "name": "Win-Back", "desc": "Clientes inactivos 60+ dias.", "tags": ["3 emails", "60-90 dias"]},
        {"id": "educativo", "name": "Biltong 101", "desc": "Educar sobre biltong vs jerky.", "tags": ["3 emails", "Educational"]},
    ],
    "beg": [
        {"id": "welcome", "name": "Welcome duenos de mascota", "desc": "Guia de snacks saludables.", "tags": ["3 emails", "7 dias"]},
        {"id": "replenishment", "name": "Reabastecimiento", "desc": "Por tamano del perro.", "tags": ["2 emails", "21-30 dias"]},
        {"id": "upsell", "name": "Upsell por tamano", "desc": "Recomendar segun perfil.", "tags": ["2 emails", "Post-compra"]},
    ],
}

REVISION = "2025-01-15"
BASE_URL = "https://a.klaviyo.com/api"


class KlaviyoClient:
    def __init__(self, api_key):
        self.headers = {
            "Authorization": f"Klaviyo-API-Key {api_key}",
            "revision": REVISION,
            "Content-Type": "application/json",
        }

    def get(self, endpoint, params=None):
        r = requests.get(f"{BASE_URL}/{endpoint}", headers=self.headers, params=params, timeout=30)
        if not r.ok:
            print(f"  GET {endpoint} {r.status_code}: {r.text[:300]}")
            return {}
        return r.json()

    def post(self, endpoint, body):
        r = requests.post(f"{BASE_URL}/{endpoint}", headers=self.headers, json=body, timeout=30)
        if not r.ok:
            print(f"  POST {endpoint} {r.status_code}: {r.text[:200]}")
            return {}
        return r.json()

    def get_conversion_metric_id(self):
        data = self.get("metrics/")
        for item in data.get("data", []):
            if "placed order" in item.get("attributes", {}).get("name", "").lower():
                return item["id"]
        return None

    def get_campaign_by_id(self, campaign_id):
        data = self.get(f"campaigns/{campaign_id}/", {
            "fields[campaign]": "name,status,send_time,scheduled_at",
        })
        c = data.get("data", {})
        attrs = c.get("attributes", {})
        return {
            "id": campaign_id,
            "name": attrs.get("name", ""),
            "status": attrs.get("status", "Sent"),
            "send_time": attrs.get("send_time", "") or attrs.get("scheduled_at", ""),
        }

    def get_campaign_values(self, conv_metric_id, start_str, end_str):
        body = {
            "data": {
                "type": "campaign-values-report",
                "attributes": {
                    "timeframe": {"start": start_str, "end": end_str},
                    "conversion_metric_id": conv_metric_id,
                    "filter": 'equals(send_channel,"email")',
                    "statistics": ["recipients", "open_rate", "click_rate",
                                   "conversion_rate", "conversion_value", "revenue_per_recipient",
                                   "opens_unique", "clicks_unique", "unsubscribes"],
                    "group_by": ["campaign_id", "campaign_message_id"],
                },
            }
        }
        resp = self.post("campaign-values-reports/", body)
        if isinstance(resp.get("data"), dict):
            return resp["data"].get("attributes", {}).get("results", [])
        return []

    def get_flow_values(self, conv_metric_id, start_str, end_str):
        body = {
            "data": {
                "type": "flow-values-report",
                "attributes": {
                    "timeframe": {"start": start_str, "end": end_str},
                    "conversion_metric_id": conv_metric_id,
                    "filter": 'equals(send_channel,"email")',
                    "statistics": ["recipients", "open_rate", "click_rate",
                                   "conversion_rate", "conversion_value", "revenue_per_recipient"],
                    "group_by": ["flow_id", "flow_message_id"],
                },
            }
        }
        resp = self.post("flow-values-reports/", body)
        if isinstance(resp.get("data"), dict):
            return resp["data"].get("attributes", {}).get("results", [])
        return []

    def get_flows(self):
        data = self.get("flows/", {"sort": "-updated", "fields[flow]": "id,name,status,trigger_type"})
        return data.get("data", [])


def generate_optimizations(brand_name, category, campaigns, flows):
    use_camps = [c for c in campaigns if c.get("open_rate", 0) > 0 or c.get("recipients", 0) > 0]
    if not use_camps:
        use_camps = campaigns
    if not use_camps:
        return "Sin datos de campanas para analizar en este periodo."

    avg_open = sum(c["open_rate"] for c in use_camps) / len(use_camps)
    avg_click = sum(c["click_rate"] for c in use_camps) / len(use_camps)
    avg_conv = sum(c["conv_rate"] for c in use_camps) / len(use_camps)
    total_camp_rev = sum(c["conv_value"] for c in use_camps)
    total_flow_rev = sum(f["conv_value"] for f in flows)
    total_rev = total_camp_rev + total_flow_rev
    sorted_rev = sorted(use_camps, key=lambda x: x["conv_value"], reverse=True)
    best = sorted_rev[0]
    worst = sorted_rev[-1]
    zero_flows = [f for f in flows if f.get("recipients", 0) > 0 and f.get("conv_rate", 0) == 0]
    top_flows = sorted(flows, key=lambda x: x["conv_value"], reverse=True)[:3]
    date = datetime.utcnow().strftime("%d/%m/%Y")

    lines = []
    lines.append(f"ANALISIS DE EMAIL MARKETING — {brand_name.upper()}")
    lines.append(f"Generado: {date} | Periodo: ultimos 90 dias")
    lines.append("=" * 60)

    lines.append("\n1. DIAGNOSTICO RAPIDO")
    lines.append(f"Revenue total email: ${total_rev:,.0f} (campanas ${total_camp_rev:,.0f} + flujos ${total_flow_rev:,.0f})")
    lines.append(f"Apertura promedio: {avg_open*100:.1f}% {'(EXCEPCIONAL — 2-3x industria)' if avg_open > 0.6 else '(por debajo del objetivo >45%)' if avg_open < 0.45 else '(en rango industria)'}")
    lines.append(f"Clics promedio: {avg_click*100:.2f}% {'(por debajo del objetivo 1.5-2.5%)' if avg_click < 0.015 else '(en rango objetivo)'}")
    lines.append(f"Conversion promedio: {avg_conv*100:.3f}%")
    lines.append(f"Mejor campana: \"{best['name']}\" → ${best['conv_value']:,.0f} revenue")
    lines.append(f"Campana a revisar: \"{worst['name']}\" → ${worst['conv_value']:,.0f} revenue")
    if zero_flows:
        lines.append(f"ALERTA: {len(zero_flows)} flujo(s) con 0% conversion: {', '.join(f['name'] for f in zero_flows)}")

    lines.append("\n2. ACCIONES INMEDIATAS ESTA SEMANA")

    accion = 1
    if zero_flows:
        for f in zero_flows[:2]:
            lines.append(f"\n  {accion}. FLUJO SIN CONVERSION: \"{f['name']}\"")
            lines.append(f"     El flujo tiene {f['recipients']} recipients pero 0% conversion.")
            lines.append(f"     Accion: Klaviyo > Flows > \"{f['name']}\" > Analytics")
            lines.append(f"     Verificar que el trigger este configurado correctamente.")
            lines.append(f"     Revisar los filtros de entrada — pueden estar excluyendo a todos.")
            accion += 1

    if avg_click < 0.015 and accion <= 3:
        lines.append(f"\n  {accion}. MEJORAR TASA DE CLICS ({avg_click*100:.2f}% vs objetivo 1.5%)")
        lines.append(f"     Accion: En la proxima campana, A/B testear el CTA principal.")
        lines.append(f"     Version A: CTA generico actual")
        lines.append(f"     Version B: CTA especifico con producto y descuento")
        lines.append(f"     Ejemplo: 'Ver oferta' → 'Comprar [producto] con 15% OFF'")
        lines.append(f"     Klaviyo > Campaigns > Create > A/B Test > Content")
        accion += 1

    if best["conv_value"] > 0 and accion <= 3:
        lines.append(f"\n  {accion}. REPLICAR PATRON DE MEJOR CAMPANA")
        lines.append(f"     \"{best['name']}\" genero ${best['conv_value']:,.0f} con {best['open_rate']*100:.1f}% apertura.")
        lines.append(f"     Accion: Revisar el asunto, segmento y hora de envio de esta campana.")
        lines.append(f"     Crear la proxima campana siguiendo el mismo patron.")
        accion += 1

    if accion <= 3:
        lines.append(f"\n  {accion}. REVISAR SEGMENTACION DE CAMPANAS")
        lines.append(f"     Verificar que las campanas usen segmentos de contactos activos.")
        lines.append(f"     Klaviyo > Segments > usar 'Engaged last 90 days' como base.")
        lines.append(f"     Excluir compradores recientes de campanas promocionales.")

    lines.append("\n3. ACCIONES PROXIMO MES")

    if not any("win" in f["name"].lower() or "reactivat" in f["name"].lower() for f in flows):
        lines.append("\n  1. CREAR FLUJO WIN-BACK (mayor impacto potencial)")
        lines.append(f"     Segmento: compradores sin actividad en 60+ dias.")
        lines.append(f"     Secuencia: Email reconexion (dia 0) > Oferta 15% OFF (dia 5) > Urgencia (dia 12).")
        lines.append(f"     Impacto esperado: recuperar 5-10% de clientes inactivos.")
    else:
        lines.append("\n  1. OPTIMIZAR FLUJOS EXISTENTES")
        lines.append(f"     Revisar los emails del flujo con menor conversion.")
        lines.append(f"     A/B testear asuntos en el primer email de cada flujo.")

    lines.append("\n  2. CONTENIDO EDUCATIVO")
    lines.append(f"     Intercalar 1 email educativo por cada 2 promocionales.")
    lines.append(f"     El contenido de valor genera mayor CTR sin necesidad de descuento.")

    lines.append("\n  3. OPTIMIZACION DE DESCUENTOS")
    lines.append(f"     Testear descuentos intermedios (10-15%) vs descuentos agresivos.")
    lines.append(f"     Agregar countdown de 48-72h para generar urgencia real.")
    lines.append(f"     Descuentos moderados con urgencia generan mejor conversion que 30% OFF.")

    lines.append("\n4. RECOMENDACION DE ASUNTO")
    if best["open_rate"] > 0.5:
        lines.append(f"     Basado en la campana de mayor apertura ({best['open_rate']*100:.1f}%):")
        lines.append(f"     Replicar el estilo del asunto de \"{best['name']}\"")
    lines.append(f"     Patrones que funcionan en esta cuenta:")
    lines.append(f"     - Incluir el nombre del producto especifico")
    lines.append(f"     - Usar urgencia real con fecha limite")
    lines.append(f"     - Personalizar con {{{{ first_name }}}}")
    lines.append(f"     - Evitar palabras genericas como 'oferta especial'")

    lines.append("\n5. KPIS A MONITOREAR")
    lines.append(f"     Apertura: objetivo >{'65%' if avg_open > 0.6 else '45%'} (actual {avg_open*100:.1f}%)")
    lines.append(f"     Clics: objetivo >1.5% (actual {avg_click*100:.2f}%)")
    lines.append(f"     Conversion: objetivo >0.3% por campana (actual {avg_conv*100:.3f}%)")
    lines.append(f"     Revenue por recipient (RPR): objetivo >$0.10")
    lines.append(f"     Tasa de baja: mantener <0.2% por envio")
    if top_flows:
        lines.append(f"     Flujo con mejor RPR: \"{top_flows[0]['name']}\" (${top_flows[0]['rpr']:.2f})")

    return "\n".join(lines)


def fetch_brand_data(brand_config):
    print(f"\nLeyendo {brand_config['name']}...")
    client = KlaviyoClient(brand_config["api_key"])

    end = datetime.utcnow()
    start = end - timedelta(days=90)
    start_str = start.strftime("%Y-%m-%dT00:00:00+00:00")
    end_str = end.strftime("%Y-%m-%dT23:59:59+00:00")

    conv_metric_id = brand_config.get("conversion_metric_id") or ""
    if not conv_metric_id:
        conv_metric_id = client.get_conversion_metric_id() or ""
        if conv_metric_id:
            print(f"  Metric ID auto: {conv_metric_id}")

    campaigns = []
    if conv_metric_id:
        results = client.get_campaign_values(conv_metric_id, start_str, end_str)
        print(f"  Report results: {len(results)}")
        seen = set()
        for result in results:
            groupings = result.get("groupings", {})
            stats = result.get("statistics", {})
            cid = groupings.get("campaign_id", "")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            camp = client.get_campaign_by_id(cid)
            name = camp.get("name", cid)
            send_time = camp.get("send_time", "")
            date_str = ""
            if send_time:
                try:
                    dt_obj = datetime.fromisoformat(send_time.replace("Z", "+00:00"))
                    date_str = dt_obj.strftime("%Y-%m-%d")
                except:
                    date_str = send_time[:10]
            campaigns.append({
                "id": cid,
                "name": name,
                "date": date_str,
                "status": camp.get("status", "Sent"),
                "open_rate": float(stats.get("open_rate") or 0),
                "click_rate": float(stats.get("click_rate") or 0),
                "conv_rate": float(stats.get("conversion_rate") or 0),
                "conv_value": float(stats.get("conversion_value") or 0),
                "rpr": float(stats.get("revenue_per_recipient") or 0),
                "recipients": int(stats.get("recipients") or 0),
            })
        print(f"  Campanas con nombre: {sum(1 for c in campaigns if c['name'] != c['id'])}/{len(campaigns)}")

    flows_raw = client.get_flows()
    print(f"  Flujos: {len(flows_raw)}")
    flows = []
    if conv_metric_id and flows_raw:
        flow_results = client.get_flow_values(conv_metric_id, start_str, end_str)
        flow_stats = {}
        for result in flow_results:
            groupings = result.get("groupings", {})
            stats = result.get("statistics", {})
            fid = groupings.get("flow_id", "")
            if fid and fid not in flow_stats:
                flow_stats[fid] = stats
        for f in flows_raw[:15]:
            fid = f.get("id", "")
            attrs = f.get("attributes", {})
            stats = flow_stats.get(fid, {})
            flows.append({
                "id": fid,
                "name": attrs.get("name", ""),
                "trigger": attrs.get("trigger_type", ""),
                "status": attrs.get("status", ""),
                "open_rate": float(stats.get("open_rate") or 0),
                "click_rate": float(stats.get("click_rate") or 0),
                "conv_rate": float(stats.get("conversion_rate") or 0),
                "conv_value": float(stats.get("conversion_value") or 0),
                "rpr": float(stats.get("revenue_per_recipient") or 0),
                "recipients": int(stats.get("recipients") or 0),
            })

    sent = [c for c in campaigns if c.get("recipients", 0) > 0]
    total_camp_rev = sum(c["conv_value"] for c in sent)
    total_flow_rev = sum(f["conv_value"] for f in flows)
    avg_open = sum(c["open_rate"] for c in sent) / max(len(sent), 1)
    avg_click = sum(c["click_rate"] for c in sent) / max(len(sent), 1)
    avg_conv = sum(c["conv_rate"] for c in sent) / max(len(sent), 1)

    print(f"  Generando optimizaciones con IA...")
    optimizations = generate_optimizations(brand_config["name"], brand_config["category"], campaigns, flows)
    print(f"  Optimizaciones: {len(optimizations)} chars")

    return {
        "brand": brand_config,
        "campaigns": campaigns,
        "flows": flows,
        "optimizations": optimizations,
        "kpis": {
            "total_revenue": total_camp_rev + total_flow_rev,
            "campaign_revenue": total_camp_rev,
            "flow_revenue": total_flow_rev,
            "avg_open_rate": avg_open,
            "avg_click_rate": avg_click,
            "avg_conv_rate": avg_conv,
        },
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


def generate_html(data):
    brand = data["brand"]
    name = brand["name"]
    emoji = brand["emoji"]
    category = brand["category"]
    color = brand["color"]
    color_dim = brand["color_dim"]
    brand_key = brand["brand_key"]
    generated_at = data["generated_at"]
    campaigns_json = json.dumps(data["campaigns"], ensure_ascii=False)
    flows_json = json.dumps(data["flows"], ensure_ascii=False)
    flujos_json = json.dumps(FLUJOS_POR_MARCA.get(brand_key, []), ensure_ascii=False)
    optimizations_json = json.dumps(data.get("optimizations", ""), ensure_ascii=False)

    p = []
    p.append('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">')
    p.append('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">')
    p.append(f'<title>{name} — Email Intelligence</title>')
    p.append('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">')
    p.append('<style>')
    p.append(f':root{{--bg:#0D0F0E;--s1:#151918;--s2:#1C201F;--b:#252B29;--ac:{color};--acd:{color_dim};--red:#FF4D4D;--redd:rgba(255,77,77,.12);--amb:#F2A93D;--ambd:rgba(242,169,61,.12);--blue:#3DA8F2;--tx:#E8EDE8;--tx2:#8A9490;--tx3:#5A6460;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}')
    p.append('*{box-sizing:inherit;margin:0;padding:0}body{background:var(--bg);color:var(--tx);font-family:Inter,sans-serif;font-size:14px;min-height:100vh}')
    p.append('.topbar{padding:14px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;position:sticky;top:0;background:var(--bg);z-index:100}')
    p.append('.brand-name{font-family:"Space Grotesk",sans-serif;font-size:18px;font-weight:700;color:var(--ac)}.brand-sub{font-size:11px;color:var(--tx3);margin-top:2px}')
    p.append('.updated{font-size:11px;color:var(--tx3);background:var(--s2);padding:4px 10px;border-radius:6px;border:1px solid var(--b)}')
    p.append('.btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;border:none;display:inline-flex;align-items:center;gap:5px;transition:all .2s}')
    p.append('.btn-opt{background:var(--redd);color:var(--red);border:1px solid rgba(255,77,77,.25)}.btn-flu{background:rgba(61,168,242,.12);color:#3DA8F2;border:1px solid rgba(61,168,242,.25)}')
    p.append('.controls{padding:12px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--s1)}')
    p.append('.dl{font-size:11px;color:var(--tx3);font-weight:500}.di{background:var(--s2);border:1px solid var(--b);color:var(--tx);font-family:Inter,sans-serif;font-size:12px;padding:6px 10px;border-radius:7px;outline:none}')
    p.append('.di:focus,.di:hover{border-color:var(--ac)}.qb{padding:5px 11px;font-size:11px;font-weight:500;border-radius:6px;cursor:pointer;border:1px solid var(--b);background:none;color:var(--tx3);font-family:Inter,sans-serif;transition:all .2s}')
    p.append('.qb:hover{border-color:var(--ac);color:var(--ac)}.qb.active{background:var(--acd);border-color:var(--ac);color:var(--ac)}')
    p.append('.tabs{display:flex;border-bottom:1px solid var(--b);padding:0 24px;overflow-x:auto}')
    p.append('.tab{padding:10px 16px;font-size:13px;font-weight:500;color:var(--tx3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s;white-space:nowrap}.tab:hover{color:var(--tx2)}.tab.active{color:var(--ac);border-bottom-color:var(--ac)}')
    p.append('.main{padding:20px 24px;max-width:1300px}')
    p.append('.kpig{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}')
    p.append('.kc{background:var(--s1);border:1px solid var(--b);border-radius:11px;padding:15px;position:relative;overflow:hidden}.kc::before{content:"";position:absolute;top:0;left:0;right:0;height:2px}')
    p.append('.kc.g::before{background:var(--ac)}.kc.a::before{background:var(--amb)}.kc.b::before{background:var(--blue)}.kc.r::before{background:var(--red)}')
    p.append('.kl{font-size:10px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}.kv{font-family:"Space Grotesk",sans-serif;font-size:24px;font-weight:700;line-height:1;margin-bottom:2px}.ks{font-size:11px;color:var(--tx3)}')
    p.append('.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.card{background:var(--s1);border:1px solid var(--b);border-radius:11px;overflow:hidden}')
    p.append('.ch{padding:13px 16px 10px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between}.ct{font-family:"Space Grotesk",sans-serif;font-size:13px;font-weight:600}.cb{padding:14px 16px}')
    p.append('.tbl{width:100%;border-collapse:collapse}.tbl th{font-size:10px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:7px 10px;text-align:left;border-bottom:1px solid var(--b)}')
    p.append('.tbl td{padding:9px 10px;font-size:12px;color:var(--tx2);border-bottom:1px solid rgba(37,43,41,.4)}.tbl tr:last-child td{border-bottom:none}.tbl tr:hover td{background:var(--s2)}')
    p.append('.cn{color:var(--tx);font-weight:500;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}')
    p.append('.pill{display:inline-block;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}.ph{background:var(--acd);color:var(--ac)}.pm{background:var(--ambd);color:var(--amb)}.pl{background:var(--redd);color:var(--red)}')
    p.append('.ins{background:var(--acd);border:1px solid rgba(181,242,61,.15);border-radius:8px;padding:11px 13px;margin-bottom:14px;font-size:12px;color:var(--tx2);line-height:1.6}.ins strong{color:var(--ac)}')
    p.append('.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:none;align-items:center;justify-content:center;padding:20px}.modal-ov.open{display:flex}')
    p.append('.modal{background:var(--s1);border:1px solid var(--b);border-radius:14px;width:100%;max-width:700px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column}')
    p.append('.mh{padding:15px 18px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between}.mt{font-family:"Space Grotesk",sans-serif;font-size:14px;font-weight:600}')
    p.append('.mc{padding:18px;overflow-y:auto;flex:1;font-size:13px;color:var(--tx2);line-height:1.7;white-space:pre-wrap}.mf{padding:12px 18px;border-top:1px solid var(--b);display:flex;gap:8px;justify-content:flex-end}')
    p.append('.cbtn{background:none;border:none;color:var(--tx3);cursor:pointer;font-size:18px}.fsel{background:var(--s2);border:1px solid var(--b);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;transition:all .2s}')
    p.append('.fsel:hover,.fsel.sel{border-color:var(--ac);background:var(--acd)}.fsn{font-weight:600;color:var(--tx);font-size:13px;margin-bottom:3px}.fsd{font-size:12px;color:var(--tx2)}')
    p.append('.ftag{display:inline-block;background:rgba(61,168,242,.12);color:#3DA8F2;font-size:10px;padding:2px 6px;border-radius:4px;margin:3px 2px 0 0}')
    p.append('@media(max-width:900px){.kpig{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}.main{padding:14px}.topbar,.controls{padding:12px 14px}}')
    p.append('</style></head><body>')
    p.append('<div class="topbar"><div>')
    p.append(f'<div class="brand-name">{emoji} {name.upper()}</div>')
    p.append(f'<div class="brand-sub">{category} &middot; Email Intelligence &middot; Alicia Prieto</div>')
    p.append('</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">')
    p.append(f'<div class="updated">Actualizado: {generated_at}</div>')
    p.append('<button class="btn btn-opt" onclick="openOpt()">&#9889; Optimizacion IA</button>')
    p.append('<button class="btn btn-flu" onclick="openFlujo()">+ Crear flujo</button>')
    p.append('</div></div>')
    p.append('<div class="controls">')
    p.append('<span class="dl">Desde</span><input type="date" class="di" id="df" onchange="applyD()">')
    p.append('<span style="color:var(--tx3)">&#8594;</span><input type="date" class="di" id="dt" onchange="applyD()">')
    p.append('<button class="qb" onclick="sq(7,this)">7 dias</button>')
    p.append('<button class="qb active" onclick="sq(30,this)">30 dias</button>')
    p.append('<button class="qb" onclick="sq(90,this)">3 meses</button>')
    p.append('<button class="qb" onclick="sq(\'mes\',this)">Este mes</button>')
    p.append('<button class="qb" onclick="sq(\'lastmes\',this)">Mes anterior</button>')
    p.append('<span style="margin-left:auto;font-size:11px;color:var(--tx3)" id="dlabel"></span>')
    p.append('</div>')
    p.append('<div class="tabs">')
    p.append('<div class="tab active" onclick="showT(\'resultados\',this)">Resultados</div>')
    p.append('<div class="tab" onclick="showT(\'flujos\',this)">Flujos</div>')
    p.append('<div class="tab" onclick="showT(\'optimizaciones\',this)">Optimizaciones IA</div>')
    p.append('</div>')
    p.append('<div class="main"><div id="t-resultados"></div><div id="t-flujos" style="display:none"></div><div id="t-optimizaciones" style="display:none"></div></div>')
    p.append('<div class="modal-ov" id="m-opt"><div class="modal">')
    p.append(f'<div class="mh"><div class="mt">&#9889; Optimizacion IA — {name}</div><button class="cbtn" onclick="cm(\'m-opt\')">&#10005;</button></div>')
    p.append('<div class="mc" id="m-opt-body"></div>')
    p.append('<div class="mf"><button class="btn" style="background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="cm(\'m-opt\')">Cerrar</button>')
    p.append('<button class="btn" style="background:var(--acd);color:var(--ac);border:1px solid rgba(181,242,61,.2)" onclick="dlTxt(\'opt\')">&#8595; Descargar</button></div>')
    p.append('</div></div>')
    p.append('<div class="modal-ov" id="m-flu"><div class="modal">')
    p.append(f'<div class="mh"><div class="mt">+ Crear flujo — {name}</div><button class="cbtn" onclick="cm(\'m-flu\')">&#10005;</button></div>')
    p.append('<div class="mc" id="m-flu-body" style="white-space:normal">')
    p.append('<p style="margin-bottom:12px;color:var(--tx2)">Selecciona el flujo. Recibiras el paso a paso completo.</p>')
    p.append('<div id="f-opts"></div>')
    p.append('<div id="f-res" style="display:none;white-space:pre-wrap;font-size:12px;line-height:1.7;color:var(--tx2)"></div>')
    p.append('</div>')
    p.append('<div class="mf"><button class="btn" id="f-back" style="display:none;background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="backF()">&#8592; Volver</button>')
    p.append('<button class="btn" style="background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="cm(\'m-flu\')">Cerrar</button>')
    p.append('<button class="btn" id="f-dl" style="display:none;background:var(--acd);color:var(--ac);border:1px solid rgba(181,242,61,.2)" onclick="dlTxt(\'flu\')">&#8595; Descargar</button>')
    p.append('</div></div></div>')
    p.append('<script>')
    p.append(f'var ALL_CAMPS={campaigns_json};')
    p.append(f'var ALL_FLOWS={flows_json};')
    p.append(f'var FLUJOS={flujos_json};')
    p.append(f'var BRAND_NAME="{name}";')
    p.append(f'var GENERATED="{generated_at}";')
    p.append(f'var OPTIMIZATIONS={optimizations_json};')
    p.append('''
var df=null,dt=null,optTxt="",fluTxt="",selFlu="";
function fmt8(d){return d.toISOString().split("T")[0]}
function fmtU(n){return"$"+Number(n||0).toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g,",")}
function fmtP(n){return(Number(n||0)*100).toFixed(1)+"%"}
function pc(v,h,m){return v>=h?"ph":v>=m?"pm":"pl"}
function cm(id){document.getElementById(id).classList.remove("open")}
function showT(id,el){
  ["resultados","flujos","optimizaciones"].forEach(function(t){document.getElementById("t-"+t).style.display="none"});
  document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active")});
  document.getElementById("t-"+id).style.display="block";
  el.classList.add("active");
}
function initD(){
  var today=new Date();var from=new Date(today);from.setDate(from.getDate()-30);
  dt=today;df=from;
  document.getElementById("dt").value=fmt8(today);
  document.getElementById("df").value=fmt8(from);
  updLabel();
}
function sq(n,btn){
  document.querySelectorAll(".qb").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");
  var today=new Date();var from=new Date(today);
  if(n==="mes"){from=new Date(today.getFullYear(),today.getMonth(),1);}
  else if(n==="lastmes"){from=new Date(today.getFullYear(),today.getMonth()-1,1);dt=new Date(today.getFullYear(),today.getMonth(),0);document.getElementById("dt").value=fmt8(dt);}
  else{from.setDate(from.getDate()-n);dt=today;document.getElementById("dt").value=fmt8(today);}
  df=from;document.getElementById("df").value=fmt8(from);updLabel();render();
}
function applyD(){
  document.querySelectorAll(".qb").forEach(function(b){b.classList.remove("active")});
  var f=document.getElementById("df").value,t=document.getElementById("dt").value;
  if(f)df=new Date(f);if(t)dt=new Date(t);updLabel();render();
}
function updLabel(){
  var ops={day:"2-digit",month:"short",year:"numeric"};
  document.getElementById("dlabel").textContent=(df?df.toLocaleDateString("es",ops):"--")+" > "+(dt?dt.toLocaleDateString("es",ops):"--");
}
function fCamps(){
  return ALL_CAMPS.filter(function(c){
    if(!c.date)return true;
    var d=new Date(c.date);return(!df||d>=df)&&(!dt||d<=dt);
  });
}
function render(){
  var camps=fCamps();
  var wd=camps.filter(function(c){return c.recipients>0});
  var campRev=wd.reduce(function(s,c){return s+c.conv_value},0);
  var flowRev=ALL_FLOWS.reduce(function(s,f){return s+f.conv_value},0);
  var totalRev=campRev+flowRev;
  var avgOr=wd.length?wd.reduce(function(s,c){return s+c.open_rate},0)/wd.length:0;
  var avgCr=wd.length?wd.reduce(function(s,c){return s+c.click_rate},0)/wd.length:0;
  var avgCvr=wd.length?wd.reduce(function(s,c){return s+c.conv_rate},0)/wd.length:0;
  var sortRev=wd.slice().sort(function(a,b){return b.conv_value-a.conv_value});
  var best=sortRev[0],worst=sortRev[sortRev.length-1];
  var campsHTML="";
  if(camps.length){
    camps.forEach(function(c){
      var nd=!c.recipients;
      campsHTML+="<tr><td><div class=\\"cn\\">"+c.name+"</div><div style=\\"font-size:10px;color:var(--tx3)\\">"+c.date+" &middot; "+c.status+"</div></td>";
      campsHTML+="<td>"+(nd?"--":"<span class=\\"pill "+pc(c.open_rate,.65,.4)+"\\">"+fmtP(c.open_rate)+"</span>")+"</td>";
      campsHTML+="<td>"+(nd?"--":"<span class=\\"pill "+pc(c.click_rate,.005,.002)+"\\">"+fmtP(c.click_rate)+"</span>")+"</td>";
      campsHTML+="<td style=\\"font-weight:600;color:var(--tx)\\">"+fmtU(c.conv_value)+"</td></tr>";
    });
  }else{campsHTML="<tr><td colspan=\\"4\\" style=\\"text-align:center;color:var(--tx3);padding:20px\\">Sin campanas en el periodo</td></tr>";}
  var bestHTML="",worstHTML="";
  if(best){
    bestHTML="<div class=\\"card\\" style=\\"margin-bottom:14px\\"><div class=\\"ch\\"><div class=\\"ct\\">Mejor campana</div></div><div class=\\"cb\\">";
    bestHTML+="<div style=\\"font-size:13px;font-weight:600;color:var(--ac);margin-bottom:10px\\">"+best.name+"</div>";
    bestHTML+="<div style=\\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px\\"><div><div style=\\"font-size:10px;color:var(--tx3)\\">Revenue</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtU(best.conv_value)+"</div></div>";
    bestHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Apertura</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(best.open_rate)+"</div></div>";
    bestHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Conv.</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(best.conv_rate)+"</div></div></div></div></div>";
  }
  if(worst&&worst!==best){
    worstHTML="<div class=\\"card\\"><div class=\\"ch\\"><div class=\\"ct\\">A revisar</div></div><div class=\\"cb\\">";
    worstHTML+="<div style=\\"font-size:13px;font-weight:600;color:var(--red);margin-bottom:10px\\">"+worst.name+"</div>";
    worstHTML+="<div style=\\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px\\"><div><div style=\\"font-size:10px;color:var(--tx3)\\">Revenue</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700;color:var(--red)\\">"+fmtU(worst.conv_value)+"</div></div>";
    worstHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Apertura</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(worst.open_rate)+"</div></div>";
    worstHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Conv.</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(worst.conv_rate)+"</div></div></div></div></div>";
  }
  document.getElementById("t-resultados").innerHTML=
    "<div class=\\"kpig\\" style=\\"margin-top:18px\\">"+
    "<div class=\\"kc g\\"><div class=\\"kl\\">Revenue total</div><div class=\\"kv\\">"+fmtU(totalRev)+"</div><div class=\\"ks\\">Campanas "+fmtU(campRev)+" + Flujos "+fmtU(flowRev)+"</div></div>"+
    "<div class=\\"kc g\\"><div class=\\"kl\\">Apertura promedio</div><div class=\\"kv\\">"+fmtP(avgOr)+"</div><div class=\\"ks\\">Industria 35-45%</div></div>"+
    "<div class=\\"kc a\\"><div class=\\"kl\\">Clics promedio</div><div class=\\"kv\\">"+fmtP(avgCr)+"</div><div class=\\"ks\\">"+(avgCr<.015?"Por debajo del objetivo":"En rango")+"</div></div>"+
    "<div class=\\"kc b\\"><div class=\\"kl\\">Conversion</div><div class=\\"kv\\">"+fmtP(avgCvr)+"</div><div class=\\"ks\\">"+wd.length+" campanas con datos</div></div>"+
    "</div>"+
    "<div class=\\"ins\\"><strong>Resumen:</strong> Revenue: <strong>"+fmtU(totalRev)+"</strong> | Apertura: <strong>"+fmtP(avgOr)+"</strong> | "+wd.length+" campanas y "+ALL_FLOWS.length+" flujos.</div>"+
    "<div class=\\"two\\">"+
    "<div class=\\"card\\"><div class=\\"ch\\"><div class=\\"ct\\">Campanas</div><div style=\\"font-size:11px;color:var(--tx3)\\">"+camps.length+" campanas</div></div>"+
    "<table class=\\"tbl\\"><thead><tr><th>Campana</th><th>Apertura</th><th>Clics</th><th>Revenue</th></tr></thead><tbody>"+campsHTML+"</tbody></table></div>"+
    "<div>"+bestHTML+worstHTML+"</div></div>";
  var fHTML="";
  ALL_FLOWS.forEach(function(f){
    fHTML+="<tr><td class=\\"cn\\">"+f.name+"</td><td style=\\"font-size:11px;color:var(--tx3)\\">"+f.trigger+"</td>";
    fHTML+="<td><span class=\\"pill "+pc(f.open_rate,.5,.4)+"\\">"+fmtP(f.open_rate)+"</span></td>";
    fHTML+="<td><span class=\\"pill "+pc(f.conv_rate,.05,.01)+"\\">"+fmtP(f.conv_rate)+"</span></td>";
    fHTML+="<td style=\\"font-weight:600;color:var(--tx)\\">"+fmtU(f.conv_value)+"</td><td>"+fmtU(f.rpr)+"</td></tr>";
  });
  document.getElementById("t-flujos").innerHTML=
    "<div style=\\"margin-top:18px\\" class=\\"card\\"><div class=\\"ch\\"><div class=\\"ct\\">Flujos activos</div></div>"+
    "<table class=\\"tbl\\"><thead><tr><th>Flujo</th><th>Trigger</th><th>Apertura</th><th>Conv.</th><th>Revenue</th><th>RPR</th></tr></thead>"+
    "<tbody>"+(fHTML||"<tr><td colspan=\\"6\\" style=\\"text-align:center;color:var(--tx3);padding:20px\\">Sin flujos</td></tr>")+"</tbody></table></div>";
  document.getElementById("t-optimizaciones").innerHTML=
    "<div style=\\"margin-top:18px\\">"+
    "<div style=\\"font-size:11px;color:var(--tx3);margin-bottom:14px;padding:8px 12px;background:var(--s2);border-radius:6px;border:1px solid var(--b)\\">Generado con IA · "+GENERATED+"</div>"+
    "<div style=\\"white-space:pre-wrap;font-size:13px;line-height:1.8;color:var(--tx2);background:var(--s1);border:1px solid var(--b);border-radius:10px;padding:20px\\">"+OPTIMIZATIONS+"</div></div>";
}
function openOpt(){document.getElementById("m-opt").classList.add("open");optTxt=OPTIMIZATIONS;document.getElementById("m-opt-body").textContent=OPTIMIZATIONS;}
function openFlujo(){
  document.getElementById("m-flu").classList.add("open");backF();
  var html="";
  FLUJOS.forEach(function(f){
    html+="<div class=\\"fsel\\" onclick=\\"selFlujo(\'"+f.id+"\',this)\\"><div class=\\"fsn\\">"+f.name+"</div><div class=\\"fsd\\">"+f.desc+"</div><div style=\\"margin-top:6px\\">";
    f.tags.forEach(function(t){html+="<span class=\\"ftag\\">"+t+"</span>"});
    html+="</div></div>";
  });
  document.getElementById("f-opts").innerHTML=html;
}
function selFlujo(id,el){
  selFlu=id;document.querySelectorAll(".fsel").forEach(function(f){f.classList.remove("sel")});el.classList.add("sel");
  var guias={
    winback:"FLUJO WIN-BACK\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Metric > Placed Order\\nCondicion: Sin compra en ultimos 60 dias\\nY: Ha comprado al menos 1 vez\\n\\nFILTRO: No compro en 60 dias / No recibio este flujo en 90 dias\\n\\nEMAIL 1 - DIA 0\\nAsunto A: \\"Te echamos de menos, {{ first_name }}\\"\\nAsunto B: \\"Como va tu progreso?\\"\\nPreheader: Ha pasado un tiempo desde tu ultimo pedido\\nContenido: Saludo + recordar producto comprado + CTA suave\\n\\nEMAIL 2 - DIA 5\\nAsunto: \\"Tu proximo pedido con 15% OFF\\"\\nPreheader: Codigo VUELVE15 valido 72h\\nContenido: Beneficios + 15% OFF + countdown + 2 testimonios\\n\\nEMAIL 3 - DIA 12\\nAsunto: \\"Ultima oportunidad - descuento vence hoy\\"\\nContenido: Urgencia + CTA prominente\\nSi no convierte: mover a segmento inactivo\\n\\nKPIS: Email 1 Apertura >45% | Email 2 Conv >3% | Email 3 Conv >1.5%",
    upsell:"FLUJO UPSELL POST-COMPRA\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order\\nDelay: 3 dias\\nCondicion: No ha comprado el complementario\\n\\nEMAIL 1 - DIA 3\\nAsunto: \\"Tu pedido llego - ahora el siguiente nivel\\"\\nContenido: Confirmar recepcion + introducir complementario + CTA suave\\n\\nEMAIL 2 - DIA 10\\nAsunto: \\"10% OFF en [complemento] esta semana\\"\\nContenido: 10% OFF + CTA: Agregar al proximo pedido\\n\\nKPIS: Apertura >40% | Conv >2% | AOV +15%",
    educativo:"FLUJO EDUCATIVO POST-PRIMERA COMPRA\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Added to List (Buyers) - primera compra\\n\\nEMAIL 1 - DIA 7: Como usar [producto] para maximos resultados\\nEMAIL 2 - DIA 14: La ciencia detras de [ingrediente]\\nEMAIL 3 - DIA 21: Tu rutina optimizada con [producto]\\nEMAIL 4 - DIA 28: Listo para el siguiente nivel? 10% OFF\\n\\nKPIS: Recompra >25% en 60 dias | Apertura >45%",
    abandono:"FLUJO ABANDONO DE CARRITO\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Started Checkout\\nFILTRO CRITICO: NO Placed Order en ultimas 4 horas\\n\\nEMAIL 1 - 1 HORA: Recordatorio suave + productos del carrito\\nEMAIL 2 - 24 HORAS: Social proof + garantia\\nEMAIL 3 - 72 HORAS: 10% OFF codigo + urgencia\\n\\nKPIS: Recuperacion total 10-15%",
    vip:"FLUJO VIP\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order (exactamente 3ra compra)\\n\\nEMAIL 1 - DIA 0: Bienvenida VIP + beneficios\\nEMAIL 2 - DIA 3: Acceso anticipado nuevo producto\\nEMAIL 3 - DIA 10: Descuento VIP 20% mensual\\n\\nKPIS: Retencion >85% en 60 dias | AOV +30%",
    welcome:"FLUJO WELCOME SERIES\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Added to List (lista principal)\\n\\nEMAIL 1 - INMEDIATO: Bienvenida + historia marca\\nEMAIL 2 - DIA 3: Educativo + diferenciacion\\nEMAIL 3 - DIA 7: Primera compra 15% OFF (BIENVENIDO15)\\n\\nKPIS: Apertura Email 1 >55% | Conv Email 3 >4%",
    replenishment:"FLUJO REABASTECIMIENTO\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order\\nDelay: [X] dias segun consumo\\n\\nEMAIL 1 - DIA [X-5]: Recordatorio amigable + boton reorden\\nEMAIL 2 - DIA [X]: 10% OFF reorden inmediato\\n\\nKPIS: Reorden >30% | RPR >$0.80",
    bundle:"FLUJO BUNDLE EDUCATION\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order producto A (no ha comprado B)\\n\\nEMAIL 1 - DIA 4: Por que A+B son superiores juntos\\nEMAIL 2 - DIA 10: Bundle A+B - ahorra 15%\\n\\nKPIS: Adopcion >10% | AOV +25%"
  };
  fluTxt=guias[id]||"Guia no disponible.";
  document.getElementById("f-res").textContent=fluTxt;
  document.getElementById("f-opts").style.display="none";
  document.getElementById("f-res").style.display="block";
  document.getElementById("f-back").style.display="inline-flex";
  document.getElementById("f-dl").style.display="inline-flex";
}
function backF(){
  document.getElementById("f-opts").style.display="block";
  document.getElementById("f-res").style.display="none";
  document.getElementById("f-back").style.display="none";
  document.getElementById("f-dl").style.display="none";
  document.querySelectorAll(".fsel").forEach(function(f){f.classList.remove("sel")});fluTxt="";
}
function dlTxt(t){
  var txt=t==="opt"?optTxt:fluTxt;if(!txt)return;
  var a=document.createElement("a");
  a.href="data:text/plain;charset=utf-8,"+encodeURIComponent(txt);
  a.download=BRAND_NAME.toLowerCase().replace(/ /g,"_")+"_"+(t==="opt"?"optimizacion":"flujo_"+selFlu)+".txt";
  a.click();
}
initD();render();
''')
    p.append('</script></body></html>')
    return "".join(p)


def main():
    output_dir = os.environ.get("OUTPUT_DIR", "output")
    os.makedirs(output_dir, exist_ok=True)
    print("Rebold Dashboard Generator")
    print(f"Output: {output_dir}/")
    print(datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"))
    for brand_key, brand_config in BRANDS.items():
        try:
            data = fetch_brand_data(brand_config)
            html = generate_html(data)
            out = os.path.join(output_dir, brand_config["output_file"])
            with open(out, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"OK: {brand_config['name']} > {out}")
        except Exception as e:
            print(f"ERROR {brand_config['name']}: {e}")
            print(traceback.format_exc())
    print("Listo.")

if __name__ == "__main__":
    main()
