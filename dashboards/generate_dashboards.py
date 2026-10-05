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
        "category": "Biltong & droewors · USA",
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
            print(f"  GET {endpoint} {r.status_code}: {r.text[:500]}")
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

    def get_campaign_messages(self, campaign_id):
        """Obtiene los message IDs de una campaña"""
        data = self.get(f"campaigns/{campaign_id}/campaign-messages/")
        return [m.get("id", "") for m in data.get("data", [])]

    def get_campaign_by_id(self, campaign_id):
        """Obtiene datos de una campaña por su ID"""
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

    def get_campaigns_with_messages(self):
        """Obtiene campañas — retorna dicts vacíos, se llena después por ID"""
        return {}, {}

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
        results = []
        if isinstance(resp.get("data"), dict):
            results = resp["data"].get("attributes", {}).get("results", [])
        return results

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
        results = []
        if isinstance(resp.get("data"), dict):
            results = resp["data"].get("attributes", {}).get("results", [])
        return results

    def get_flows(self):
        data = self.get("flows/", {"sort": "-updated", "fields[flow]": "id,name,status,trigger_type"})
        return data.get("data", [])


def generate_optimizations_groq(brand_name, category, campaigns, flows):
    """Genera optimizaciones reales usando Groq con datos de Klaviyo"""
    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_api_key:
        return "Configura GROQ_API_KEY para generar optimizaciones con IA."

    with_data = [c for c in campaigns if c.get("recipients", 0) > 0 or c.get("open_rate", 0) > 0]
    use_camps = with_data if with_data else campaigns
    if not use_camps:
        return "Sin datos suficientes para generar optimizaciones."

    avg_open = sum(c["open_rate"] for c in use_camps) / len(use_camps)
    avg_click = sum(c["click_rate"] for c in use_camps) / len(use_camps)
    total_rev = sum(c["conv_value"] for c in use_camps) + sum(f["conv_value"] for f in flows)
    best = sorted(use_camps, key=lambda x: x["conv_value"], reverse=True)[0]
    worst = sorted(use_camps, key=lambda x: x["conv_value"])[0]
    zero_flows = [f for f in flows if f.get("recipients", 0) > 0 and f.get("conv_rate", 0) == 0]

    camps_txt = "\n".join([
        f"- {c['name']} | {c['date']} | Apertura: {c['open_rate']*100:.1f}% | Clics: {c['click_rate']*100:.2f}% | Revenue: ${c['conv_value']:.0f}"
        for c in use_camps[:15]
    ])
    flows_txt = "\n".join([
        f"- {f['name']} | Conv: {f['conv_rate']*100:.1f}% | Revenue: ${f['conv_value']:.0f} | RPR: ${f['rpr']:.2f}"
        for f in flows[:8]
    ])

    prompt = f"""Eres un estratega experto en email marketing DTC para marcas en USA.

MARCA: {brand_name} ({category})
PERIODO: Últimos 30 días
COMMUNITY MANAGER: Alicia Prieto

CAMPAÑAS ENVIADAS ({len(sent)}):
{camps_txt}

PROMEDIO: {avg_open*100:.1f}% apertura | {avg_click*100:.2f}% clics | Revenue total: ${total_rev:.0f}

FLUJOS ACTIVOS:
{flows_txt}

{f'MEJOR CAMPAÑA: {best["name"]} con ${best["conv_value"]:.0f}' if best else ''}
{f'CAMPAÑA A REVISAR: {worst["name"]} con ${worst["conv_value"]:.0f}' if worst else ''}
{f'FLUJOS CON 0% CONVERSIÓN: {", ".join(f["name"] for f in zero_flows)}' if zero_flows else ''}

Genera un análisis de optimización EN ESPAÑOL con:

1. DIAGNÓSTICO (2-3 oraciones con números reales)
2. TOP 3 ACCIONES ESTA SEMANA (muy específicas para Alicia, con pasos exactos en Klaviyo)
3. TOP 3 ACCIONES PRÓXIMO MES
4. RECOMENDACIÓN DE ASUNTO basada en patrones exitosos
5. KPIs A MONITOREAR

Sé muy específico. Usa los datos reales. No seas genérico."""

    openai_key = os.environ.get("OPENAI_API_KEY", "")
    print(f"  OpenAI key presente: {bool(openai_key)} ({len(openai_key)} chars)")
    if not openai_key:
        return "Configura OPENAI_API_KEY para generar optimizaciones."
    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 1500,
                "temperature": 0.7,
            },
            timeout=60,
        )
        if r.ok:
            return r.json()["choices"][0]["message"]["content"]
        else:
            print(f"  OpenAI error {r.status_code}: {r.text[:400]}")
            return f"Error OpenAI {r.status_code}: {r.text[:200]}"
    except Exception as e:
        import traceback
        print(f"  OpenAI exception: {e}")
        print(traceback.format_exc())
        return f"Error: {e}"


def fetch_brand_data(brand_config):
    print(f"\nLeyendo {brand_config['name']}...")
    client = KlaviyoClient(brand_config["api_key"])

    end = datetime.utcnow()
    start = end - timedelta(days=90)
    start_str = start.strftime("%Y-%m-%dT00:00:00+00:00")
    end_str = end.strftime("%Y-%m-%dT23:59:59+00:00")

    # Metric ID
    conv_metric_id = brand_config.get("conversion_metric_id") or ""
    if not conv_metric_id:
        conv_metric_id = client.get_conversion_metric_id() or ""
        if conv_metric_id:
            print(f"  Metric ID auto: {conv_metric_id}")

    # Report de valores de campanas
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
            # Obtener nombre directamente por ID
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

    # Flujos
    flows_raw = client.get_flows()
    print(f"  Flujos: {len(flows_raw)}")
    flows = []
    if conv_metric_id and flows_raw:
        flow_results = client.get_flow_values(conv_metric_id, start_str, end_str)
        flows_by_id = {f.get("id", ""): f for f in flows_raw}
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

    # Generar optimizaciones con Groq
    print(f"  Generando optimizaciones con IA...")
    optimizations = generate_optimizations_groq(
        brand_config["name"], brand_config["category"], campaigns, flows
    )
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
    optimizations = data.get("optimizations", "Sin optimizaciones disponibles.")
    optimizations_json = json.dumps(optimizations, ensure_ascii=False)

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
    p.append('.oi{padding:12px;background:var(--s2);border-radius:7px;margin-bottom:9px;border-left:3px solid}.oi.cr{border-color:var(--red)}.oi.wa{border-color:var(--amb)}.oi.ok{border-color:var(--ac)}')
    p.append('.otag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}.oi.cr .otag{color:var(--red)}.oi.wa .otag{color:var(--amb)}.oi.ok .otag{color:var(--ac)}')
    p.append('.ott{font-weight:600;color:var(--tx);font-size:12px;margin-bottom:3px}.odd{color:var(--tx2);font-size:11px;line-height:1.5}')
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
    p.append('<button class="btn btn-opt" onclick="openOpt()">&#9889; Ejecutar optimizacion</button>')
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
    p.append('<div class="tab" onclick="showT(\'optimizaciones\',this)">Optimizaciones</div>')
    p.append('</div>')

    p.append('<div class="main">')
    p.append('<div id="t-resultados"></div>')
    p.append('<div id="t-flujos" style="display:none"></div>')
    p.append('<div id="t-optimizaciones" style="display:none"></div>')
    p.append('</div>')

    # Modal optimizacion
    p.append('<div class="modal-ov" id="m-opt"><div class="modal">')
    p.append(f'<div class="mh"><div class="mt">&#9889; Plan de optimizacion — {name}</div><button class="cbtn" onclick="cm(\'m-opt\')">&#10005;</button></div>')
    p.append('<div class="mc" id="m-opt-body"></div>')
    p.append('<div class="mf"><button class="btn" style="background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="cm(\'m-opt\')">Cerrar</button>')
    p.append('<button class="btn" style="background:var(--acd);color:var(--ac);border:1px solid rgba(181,242,61,.2)" onclick="dlTxt(\'opt\')">&#8595; Descargar</button></div>')
    p.append('</div></div>')

    # Modal flujos
    p.append('<div class="modal-ov" id="m-flu"><div class="modal">')
    p.append(f'<div class="mh"><div class="mt">+ Crear flujo — {name}</div><button class="cbtn" onclick="cm(\'m-flu\')">&#10005;</button></div>')
    p.append('<div class="mc" id="m-flu-body" style="white-space:normal">')
    p.append('<p style="margin-bottom:12px;color:var(--tx2)">Selecciona el flujo. Recibiras el paso a paso completo para Klaviyo.</p>')
    p.append('<div id="f-opts"></div>')
    p.append('<div id="f-res" style="display:none;white-space:pre-wrap;font-size:12px;line-height:1.7;color:var(--tx2)"></div>')
    p.append('</div>')
    p.append('<div class="mf"><button class="btn" id="f-back" style="display:none;background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="backF()">&#8592; Volver</button>')
    p.append('<button class="btn" style="background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="cm(\'m-flu\')">Cerrar</button>')
    p.append('<button class="btn" id="f-dl" style="display:none;background:var(--acd);color:var(--ac);border:1px solid rgba(181,242,61,.2)" onclick="dlTxt(\'flu\')">&#8595; Descargar</button>')
    p.append('</div></div></div>')

    # Script
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
  ["resultados","flujos","optimizaciones"].forEach(function(t){
    document.getElementById("t-"+t).style.display="none";
  });
  document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active")});
  document.getElementById("t-"+id).style.display="block";
  el.classList.add("active");
}
function initD(){
  var today=new Date();
  var from=new Date(today);
  from.setDate(from.getDate()-30);
  dt=today;df=from;
  document.getElementById("dt").value=fmt8(today);
  document.getElementById("df").value=fmt8(from);
  updLabel();
}
function sq(n,btn){
  document.querySelectorAll(".qb").forEach(function(b){b.classList.remove("active")});
  btn.classList.add("active");
  var today=new Date();
  var from=new Date(today);
  if(n==="mes"){
    from=new Date(today.getFullYear(),today.getMonth(),1);
  } else if(n==="lastmes"){
    from=new Date(today.getFullYear(),today.getMonth()-1,1);
    dt=new Date(today.getFullYear(),today.getMonth(),0);
    document.getElementById("dt").value=fmt8(dt);
  } else {
    from.setDate(from.getDate()-n);
    dt=today;
    document.getElementById("dt").value=fmt8(today);
  }
  df=from;
  document.getElementById("df").value=fmt8(from);
  updLabel();
  render();
}
function applyD(){
  document.querySelectorAll(".qb").forEach(function(b){b.classList.remove("active")});
  var f=document.getElementById("df").value;
  var t=document.getElementById("dt").value;
  if(f)df=new Date(f);
  if(t)dt=new Date(t);
  updLabel();
  render();
}
function updLabel(){
  var ops={day:"2-digit",month:"short",year:"numeric"};
  var f=df?df.toLocaleDateString("es",ops):"--";
  var t=dt?dt.toLocaleDateString("es",ops):"--";
  document.getElementById("dlabel").textContent=f+" > "+t;
}
function fCamps(){
  return ALL_CAMPS.filter(function(c){
    if(!c.date)return true;
    var d=new Date(c.date);
    return(!df||d>=df)&&(!dt||d<=dt);
  });
}
function render(){
  var camps=fCamps();
  var withData=camps.filter(function(c){return c.recipients>0});
  var campRev=withData.reduce(function(s,c){return s+c.conv_value},0);
  var flowRev=ALL_FLOWS.reduce(function(s,f){return s+f.conv_value},0);
  var totalRev=campRev+flowRev;
  var avgOr=withData.length?withData.reduce(function(s,c){return s+c.open_rate},0)/withData.length:0;
  var avgCr=withData.length?withData.reduce(function(s,c){return s+c.click_rate},0)/withData.length:0;
  var avgCvr=withData.length?withData.reduce(function(s,c){return s+c.conv_rate},0)/withData.length:0;
  var sortRev=withData.slice().sort(function(a,b){return b.conv_value-a.conv_value});
  var best=sortRev[0];
  var worst=sortRev[sortRev.length-1];

  var campsHTML="";
  if(camps.length){
    camps.forEach(function(c){
      var noData=!c.recipients;
      campsHTML+="<tr><td><div class=\\"cn\\">"+c.name+"</div><div style=\\"font-size:10px;color:var(--tx3)\\">"+c.date+" &middot; "+c.status+"</div></td>";
      campsHTML+="<td>"+(noData?"--":"<span class=\\"pill "+pc(c.open_rate,.65,.4)+"\\">"+fmtP(c.open_rate)+"</span>")+"</td>";
      campsHTML+="<td>"+(noData?"--":"<span class=\\"pill "+pc(c.click_rate,.005,.002)+"\\">"+fmtP(c.click_rate)+"</span>")+"</td>";
      campsHTML+="<td style=\\"font-weight:600;color:var(--tx)\\">"+fmtU(c.conv_value)+"</td></tr>";
    });
  } else {
    campsHTML="<tr><td colspan=\\"4\\" style=\\"text-align:center;color:var(--tx3);padding:20px\\">Sin campanas en el periodo</td></tr>";
  }

  var bestHTML="";
  if(best){
    bestHTML="<div class=\\"card\\" style=\\"margin-bottom:14px\\"><div class=\\"ch\\"><div class=\\"ct\\">Mejor campana</div></div><div class=\\"cb\\">";
    bestHTML+="<div style=\\"font-size:13px;font-weight:600;color:var(--ac);margin-bottom:10px\\">"+best.name+"</div>";
    bestHTML+="<div style=\\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px\\">";
    bestHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Revenue</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtU(best.conv_value)+"</div></div>";
    bestHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Apertura</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(best.open_rate)+"</div></div>";
    bestHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Conv.</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(best.conv_rate)+"</div></div>";
    bestHTML+="</div><div style=\\"font-size:12px;color:var(--tx2)\\">Mayor revenue del periodo. Replicar asunto y segmento.</div></div></div>";
  }
  var worstHTML="";
  if(worst&&worst!==best){
    worstHTML="<div class=\\"card\\"><div class=\\"ch\\"><div class=\\"ct\\">A revisar</div></div><div class=\\"cb\\">";
    worstHTML+="<div style=\\"font-size:13px;font-weight:600;color:var(--red);margin-bottom:10px\\">"+worst.name+"</div>";
    worstHTML+="<div style=\\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px\\">";
    worstHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Revenue</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700;color:var(--red)\\">"+fmtU(worst.conv_value)+"</div></div>";
    worstHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Apertura</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(worst.open_rate)+"</div></div>";
    worstHTML+="<div><div style=\\"font-size:10px;color:var(--tx3)\\">Conv.</div><div style=\\"font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700\\">"+fmtP(worst.conv_rate)+"</div></div>";
    worstHTML+="</div><div style=\\"font-size:12px;color:var(--tx2)\\">Menor conversion. Revisar segmento y asunto.</div></div></div>";
  }

  document.getElementById("t-resultados").innerHTML=
    "<div class=\\"kpig\\" style=\\"margin-top:18px\\">"+
    "<div class=\\"kc g\\"><div class=\\"kl\\">Revenue total</div><div class=\\"kv\\">"+fmtU(totalRev)+"</div><div class=\\"ks\\">Campanas "+fmtU(campRev)+" + Flujos "+fmtU(flowRev)+"</div></div>"+
    "<div class=\\"kc g\\"><div class=\\"kl\\">Apertura promedio</div><div class=\\"kv\\">"+fmtP(avgOr)+"</div><div class=\\"ks\\">Industria 35-45%</div></div>"+
    "<div class=\\"kc a\\"><div class=\\"kl\\">Clics promedio</div><div class=\\"kv\\">"+fmtP(avgCr)+"</div><div class=\\"ks\\">"+(avgCr<.015?"Por debajo del objetivo":"En rango objetivo")+"</div></div>"+
    "<div class=\\"kc b\\"><div class=\\"kl\\">Conversion</div><div class=\\"kv\\">"+fmtP(avgCvr)+"</div><div class=\\"ks\\">"+withData.length+" campanas con datos</div></div>"+
    "</div>"+
    "<div class=\\"ins\\"><strong>Resumen:</strong> Revenue email: <strong>"+fmtU(totalRev)+"</strong>. Apertura: <strong>"+fmtP(avgOr)+"</strong>. "+withData.length+" campanas y "+ALL_FLOWS.length+" flujos en el periodo.</div>"+
    "<div class=\\"two\\">"+
    "<div class=\\"card\\"><div class=\\"ch\\"><div class=\\"ct\\">Campanas del periodo</div><div style=\\"font-size:11px;color:var(--tx3)\\">"+camps.length+" campanas</div></div>"+
    "<table class=\\"tbl\\"><thead><tr><th>Campana</th><th>Apertura</th><th>Clics</th><th>Revenue</th></tr></thead><tbody>"+campsHTML+"</tbody></table></div>"+
    "<div>"+bestHTML+worstHTML+"</div></div>";

  var flowsHTML="";
  if(ALL_FLOWS.length){
    ALL_FLOWS.forEach(function(f){
      flowsHTML+="<tr><td class=\\"cn\\">"+f.name+"</td><td style=\\"font-size:11px;color:var(--tx3)\\">"+f.trigger+"</td>";
      flowsHTML+="<td><span class=\\"pill "+pc(f.open_rate,.5,.4)+"\\">"+fmtP(f.open_rate)+"</span></td>";
      flowsHTML+="<td><span class=\\"pill "+pc(f.conv_rate,.05,.01)+"\\">"+fmtP(f.conv_rate)+"</span></td>";
      flowsHTML+="<td style=\\"font-weight:600;color:var(--tx)\\">"+fmtU(f.conv_value)+"</td>";
      flowsHTML+="<td>"+fmtU(f.rpr)+"</td></tr>";
    });
  } else {
    flowsHTML="<tr><td colspan=\\"6\\" style=\\"text-align:center;color:var(--tx3);padding:20px\\">Sin flujos activos</td></tr>";
  }
  document.getElementById("t-flujos").innerHTML=
    "<div style=\\"margin-top:18px\\" class=\\"card\\"><div class=\\"ch\\"><div class=\\"ct\\">Flujos activos</div></div>"+
    "<table class=\\"tbl\\"><thead><tr><th>Flujo</th><th>Trigger</th><th>Apertura</th><th>Conv.</th><th>Revenue</th><th>RPR</th></tr></thead>"+
    "<tbody>"+flowsHTML+"</tbody></table></div>";

  document.getElementById("t-optimizaciones").innerHTML=
    "<div style=\\"margin-top:18px\\">"+
    "<div style=\\"font-size:11px;color:var(--tx3);margin-bottom:14px;padding:8px 12px;background:var(--s2);border-radius:6px;border:1px solid var(--b)\\">Generado con IA el "+GENERATED+" · Basado en "+withData.length+" campanas y "+ALL_FLOWS.length+" flujos</div>"+
    "<div style=\\"white-space:pre-wrap;font-size:13px;line-height:1.8;color:var(--tx2);background:var(--s1);border:1px solid var(--b);border-radius:10px;padding:20px\\">"+OPTIMIZATIONS+"</div>"+
    "</div>";
}

function openOpt(){
  document.getElementById("m-opt").classList.add("open");
  optTxt=OPTIMIZATIONS;
  document.getElementById("m-opt-body").textContent=OPTIMIZATIONS;
}

function openFlujo(){
  document.getElementById("m-flu").classList.add("open");
  backF();
  var html="";
  FLUJOS.forEach(function(f){
    html+="<div class=\\"fsel\\" onclick=\\"selFlujo(\'"+f.id+"\',this)\\">";
    html+="<div class=\\"fsn\\">"+f.name+"</div><div class=\\"fsd\\">"+f.desc+"</div>";
    html+="<div style=\\"margin-top:6px\\">";
    f.tags.forEach(function(t){html+="<span class=\\"ftag\\">"+t+"</span>"});
    html+="</div></div>";
  });
  document.getElementById("f-opts").innerHTML=html;
}

function selFlujo(id,el){
  selFlu=id;
  document.querySelectorAll(".fsel").forEach(function(f){f.classList.remove("sel")});
  el.classList.add("sel");
  var guias={
    winback:"FLUJO WIN-BACK\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Metric > Placed Order\\nCondicion: Sin compra en ultimos 60 dias\\nY: Ha comprado al menos 1 vez\\n\\nFILTRO DE FLUJO:\\nNo compro en ultimos 60 dias\\nNo recibio este flujo en ultimos 90 dias\\n\\nEMAIL 1 - DIA 0 (RECONEXION)\\nAsunto A: \\"Te echamos de menos, {{ first_name }}\\"\\nAsunto B: \\"Como va tu progreso?\\"\\nPreheader: Ha pasado un tiempo desde tu ultimo pedido\\nContenido:\\n  1. Saludo personalizado\\n  2. Reconocer que ha pasado tiempo\\n  3. Recordar el producto que compro\\n  4. CTA: Ver mis productos favoritos\\n\\nEMAIL 2 - DIA 5 (OFERTA)\\nAsunto A: \\"Tu proximo pedido con 15% OFF\\"\\nPreheader: Codigo VUELVE15 valido 72 horas\\nContenido:\\n  1. Beneficios del producto\\n  2. 15% OFF con codigo VUELVE15\\n  3. Countdown 72h\\n  4. CTA: Usar mi descuento\\n  5. 2 testimonios\\n\\nEMAIL 3 - DIA 12 (URGENCIA)\\nAsunto: \\"Ultima oportunidad - descuento vence hoy\\"\\nContenido:\\n  1. Tu descuento vence HOY\\n  2. CTA prominente\\n  3. Si no convierte: mover a segmento inactivo\\n\\nKPIS 30 DIAS:\\nEmail 1: Apertura >45%, Clics >2%\\nEmail 2: Conversion >3%\\nEmail 3: Conversion >1.5%",
    upsell:"FLUJO UPSELL POST-COMPRA\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order\\nDelay: 3 dias post-compra\\nCondicion: No ha comprado el complementario\\n\\nEMAIL 1 - DIA 3 (EDUCATIVO)\\nAsunto: \\"Tu pedido llego - ahora el siguiente nivel\\"\\nContenido:\\n  1. Confirmar recepcion\\n  2. Introducir complementario\\n  3. Por que la combinacion es superior\\n  4. CTA suave: Descubrir el combo\\n\\nEMAIL 2 - DIA 10 (OFERTA)\\nAsunto: \\"10% OFF en [complemento] esta semana\\"\\nContenido: Oferta 10% + CTA: Agregar al proximo pedido\\n\\nKPIS: Apertura >40%, Conversion >2%, AOV +15%",
    educativo:"FLUJO EDUCATIVO POST-PRIMERA COMPRA\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Added to List (Buyers)\\nCondicion: Primera compra solamente\\n\\nEMAIL 1 - DIA 7\\nAsunto: Como usar [producto] para maximos resultados\\nContenido: Guia de uso, dosis, timing\\n\\nEMAIL 2 - DIA 14\\nAsunto: La ciencia detras de [ingrediente/proceso]\\nContenido: Articulo educativo\\n\\nEMAIL 3 - DIA 21\\nAsunto: Tu rutina optimizada con [producto]\\nContenido: Plan semanal\\n\\nEMAIL 4 - DIA 28\\nAsunto: Listo para el siguiente nivel? 10% OFF\\nContenido: Conversion con descuento\\n\\nKPIS: Recompra >25% en 60 dias",
    abandono:"FLUJO ABANDONO DE CARRITO\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Started Checkout\\nFILTRO CRITICO: NO Placed Order en ultimas 4 horas\\n\\nEMAIL 1 - 1 HORA\\nAsunto: Olvidaste algo en tu carrito, {{ first_name }}\\nContenido: Productos del carrito + CTA: Volver\\n\\nEMAIL 2 - 24 HORAS\\nAsunto: Miles de clientes ya lo eligieron\\nContenido: Reviews + garantia + CTA: Completar pedido\\n\\nEMAIL 3 - 72 HORAS\\nAsunto: 10% OFF solo por 24 horas\\nContenido: Codigo descuento + CTA prominente\\n\\nKPIS: Recuperacion total 10-15% carritos",
    vip:"FLUJO VIP FIDELIZACION\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order (exactamente 3ra compra)\\n\\nEMAIL 1 - DIA 0\\nAsunto: {{ first_name }}, eres parte de nuestro circulo VIP\\nContenido: Anuncio estatus VIP + beneficios\\n\\nEMAIL 2 - DIA 3\\nAsunto: Acceso anticipado: nuevo producto antes que nadie\\nContenido: Codigo acceso anticipado\\n\\nEMAIL 3 - DIA 10\\nAsunto: Tu descuento VIP del mes: 20% en todo\\nContenido: Descuento mensual VIP\\n\\nKPIS: Retencion >85% en 60 dias, AOV +30%",
    welcome:"FLUJO WELCOME SERIES\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Added to List (lista principal)\\n\\nBIFURCACION:\\nSi ya compro: email especial cliente existente\\nSi no ha comprado: secuencia educativa + oferta\\n\\nEMAIL 1 - INMEDIATO\\nAsunto: Bienvenido a "+BRAND_NAME+"\\nContenido: Historia marca + que esperar\\n\\nEMAIL 2 - DIA 3\\nAsunto: Sabes que hace diferente a [producto]?\\nContenido: Educativo + diferenciacion\\n\\nEMAIL 3 - DIA 7\\nAsunto: Tu primera compra con 15% OFF\\nCodigo: BIENVENIDO15 (7 dias)\\n\\nKPIS: Email 1 Apertura >55%, Email 3 Conversion >4%",
    replenishment:"FLUJO REABASTECIMIENTO\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order\\nDelay: [X] dias segun consumo del producto\\n\\nEMAIL 1 - DIA [X-5]\\nAsunto: Tu [producto] se esta acabando pronto\\nContenido: Recordatorio + boton reorden 1 clic\\n\\nEMAIL 2 - DIA [X]\\nAsunto: Ya te quedaste sin [producto]?\\nContenido: 10% OFF reorden inmediato\\n\\nKPIS: Reorden >30%, RPR >$0.80",
    bundle:"FLUJO BUNDLE EDUCATION\\nMarca: "+BRAND_NAME+"\\n\\nTRIGGER: Placed Order producto A\\nCondicion: No ha comprado producto B\\n\\nEMAIL 1 - DIA 4\\nAsunto: El combo perfecto para [beneficio]\\nContenido: Por que A+B son superiores juntos\\n\\nEMAIL 2 - DIA 10\\nAsunto: Bundle A+B - ahorra 15% comprando juntos\\nContenido: Descuento bundle\\n\\nKPIS: Adopcion >10%, AOV +25%"
  };
  var guia=guias[id]||"Guia no disponible.";
  fluTxt=guia;
  document.getElementById("f-res").textContent=guia;
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
  document.querySelectorAll(".fsel").forEach(function(f){f.classList.remove("sel")});
  fluTxt="";
}

function dlTxt(t){
  var txt=t==="opt"?optTxt:fluTxt;
  if(!txt)return;
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
