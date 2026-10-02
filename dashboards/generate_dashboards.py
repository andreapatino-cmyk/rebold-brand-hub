"""
Rebold Email Intelligence — Dashboard Generator v2
Genera 4 dashboards HTML para Granite, Ayoba, Brooklyn Biltong y Beg & Barker
"""
import requests
import json
import os
from datetime import datetime, timedelta
from typing import Optional

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
        "category": "Biltong & droëwors · USA",
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
        {"id": "winback", "name": "Reactivacion 60 dias", "desc": "Para compradores inactivos. Alto impacto.", "tags": ["3 emails", "Alto impacto"]},
        {"id": "upsell", "name": "Upsell post-compra", "desc": "Ofrecer producto complementario.", "tags": ["2 emails", "LTV"]},
        {"id": "educativo", "name": "Educativo post-primera compra", "desc": "4 emails de valor para nuevos clientes.", "tags": ["4 emails", "28 dias"]},
        {"id": "abandono", "name": "Abandono de carrito optimizado", "desc": "Reemplazar flujo actual con 0% conversion.", "tags": ["3 emails", "Urgente"]},
        {"id": "vip", "name": "VIP Fidelizacion recurrentes", "desc": "Para clientes con 3+ compras.", "tags": ["3 emails", "Retencion"]},
    ],
    "ayoba": [
        {"id": "winback", "name": "Win-Back Reactivacion 45 dias", "desc": "Para clientes sin reorden.", "tags": ["3 emails", "45-60 dias"]},
        {"id": "replenishment", "name": "Replenishment Reabastecimiento", "desc": "Recordatorio de reorden.", "tags": ["2 emails", "Recurrencia"]},
        {"id": "bundle", "name": "Bundle education", "desc": "Educar sobre combinar biltong + droewors.", "tags": ["2 emails", "AOV"]},
    ],
    "brooklyn": [
        {"id": "welcome", "name": "Welcome Series", "desc": "Bienvenida con historia vs jerky.", "tags": ["3 emails", "7 dias"]},
        {"id": "winback", "name": "Win-Back Reactivacion", "desc": "Para clientes inactivos 60+ dias.", "tags": ["3 emails", "60-90 dias"]},
        {"id": "educativo", "name": "Biltong 101", "desc": "Educar al cliente americano sobre biltong.", "tags": ["3 emails", "Educational"]},
    ],
    "beg": [
        {"id": "welcome", "name": "Welcome para duenos de mascota", "desc": "Guia de snacks saludables.", "tags": ["3 emails", "7 dias"]},
        {"id": "replenishment", "name": "Reabastecimiento de snacks", "desc": "Recordatorio por tamano del perro.", "tags": ["2 emails", "21-30 dias"]},
        {"id": "upsell", "name": "Upsell por tamano de perro", "desc": "Recomendar tamano/sabor segun perfil.", "tags": ["2 emails", "Post-compra"]},
    ],
}

REVISION = "2025-01-15"
BASE_URL = "https://a.klaviyo.com/api"


class KlaviyoClient:
    def __init__(self, api_key):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Klaviyo-API-Key {api_key}",
            "revision": REVISION,
            "Content-Type": "application/json",
        }

    def get(self, endpoint, params=None):
        url = f"{BASE_URL}/{endpoint}"
        try:
            r = requests.get(url, headers=self.headers, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  Error GET {endpoint}: {e}")
            return {}

    def post(self, endpoint, body):
        url = f"{BASE_URL}/{endpoint}"
        try:
            r = requests.post(url, headers=self.headers, json=body, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  Error POST {endpoint}: {e}")
            return {}

    def get_conversion_metric_id(self):
        data = self.get("metrics/")
        for item in data.get("data", []):
            name = item.get("attributes", {}).get("name", "").lower()
            if "placed order" in name:
                return item["id"]
        return None

    def get_campaigns(self):
        data = self.get("campaigns/", {
            "filter": 'equals(messages.channel,"email")',
            "sort": "-updated_at",
        })
        return data.get("data", [])

    def get_campaign_report(self, conv_metric_id, start_date, end_date):
        body = {
            "data": {
                "type": "campaign-values-report",
                "attributes": {
                    "timeframe": {"start": start_date, "end": end_date},
                    "conversion_metric_id": conv_metric_id,
                    "filter": 'equals(messages.channel,"email")',
                    "statistics": ["recipients", "opens_unique", "clicks_unique",
                                   "open_rate", "click_rate", "conversion_rate",
                                   "conversion_uniques", "unsubscribes", "unsubscribe_rate"],
                    "group_by": ["campaign_id", "campaign_name"],
                },
            }
        }
        return self.post("campaign-values-reports/", body)

    def get_flows(self):
        data = self.get("flows/", {"sort": "-updated_at"})
        return data.get("data", [])

    def get_flow_report(self, conv_metric_id, start_date, end_date):
        body = {
            "data": {
                "type": "flow-values-report",
                "attributes": {
                    "timeframe": {"start": start_date, "end": end_date},
                    "conversion_metric_id": conv_metric_id,
                    "filter": 'equals(send_channel,"email")',
                    "statistics": ["recipients", "opens_unique", "clicks_unique",
                                   "open_rate", "click_rate", "conversion_rate"],
                    "group_by": ["flow_id", "flow_name"],
                },
            }
        }
        return self.post("flow-values-reports/", body)


def fetch_brand_data(brand_config):
    print(f"\nLeyendo {brand_config['name']}...")
    client = KlaviyoClient(brand_config["api_key"])

    end = datetime.utcnow()
    start = end - timedelta(days=30)
    start_str = start.strftime("%Y-%m-%dT00:00:00+00:00")
    end_str = end.strftime("%Y-%m-%dT23:59:59+00:00")

    conv_metric_id = brand_config.get("conversion_metric_id") or ""
    if not conv_metric_id:
        print("  Buscando metric ID...")
        conv_metric_id = client.get_conversion_metric_id() or ""
        if conv_metric_id:
            print(f"  Metric ID: {conv_metric_id}")

    campaigns_raw = client.get_campaigns()
    print(f"  Campanas: {len(campaigns_raw)}")

    campaign_report = {}
    if conv_metric_id and campaigns_raw:
        report_data = client.get_campaign_report(conv_metric_id, start_str, end_str)
        for item in report_data.get("data", []):
            attrs = item.get("attributes", {})
            cid = attrs.get("campaign_id", "")
            campaign_report[cid] = attrs

    flows_raw = client.get_flows()
    print(f"  Flujos: {len(flows_raw)}")

    flow_report = {}
    if conv_metric_id and flows_raw:
        report_data = client.get_flow_report(conv_metric_id, start_str, end_str)
        for item in report_data.get("data", []):
            attrs = item.get("attributes", {})
            fid = attrs.get("flow_id", "")
            flow_report[fid] = attrs

    campaigns = []
    for c in campaigns_raw[:20]:
        attrs = c.get("attributes", {})
        send_time = attrs.get("send_time", "") or attrs.get("scheduled_at", "")
        cid = c.get("id", "")
        report = campaign_report.get(cid, {})
        stats = report.get("statistics", {})
        date_str = ""
        if send_time:
            try:
                dt = datetime.fromisoformat(send_time.replace("Z", "+00:00"))
                date_str = dt.strftime("%Y-%m-%d")
            except:
                date_str = send_time[:10]
        campaigns.append({
            "id": cid,
            "name": attrs.get("name", "Sin nombre"),
            "date": date_str,
            "status": attrs.get("status", ""),
            "open_rate": float(stats.get("open_rate") or 0),
            "click_rate": float(stats.get("click_rate") or 0),
            "conv_rate": float(stats.get("conversion_rate") or 0),
            "conv_value": float(stats.get("conversion_value") or 0),
            "rpr": float(stats.get("revenue_per_recipient") or 0),
            "recipients": int(stats.get("recipients") or 0),
        })

    flows = []
    for f in flows_raw[:10]:
        attrs = f.get("attributes", {})
        fid = f.get("id", "")
        report = flow_report.get(fid, {})
        stats = report.get("statistics", {})
        flows.append({
            "id": fid,
            "name": attrs.get("name", "Sin nombre"),
            "trigger": attrs.get("trigger_type", ""),
            "status": attrs.get("status", "live"),
            "open_rate": float(stats.get("open_rate") or 0),
            "click_rate": float(stats.get("click_rate") or 0),
            "conv_rate": float(stats.get("conversion_rate") or 0),
            "conv_value": float(stats.get("conversion_value") or 0),
            "rpr": float(stats.get("revenue_per_recipient") or 0),
            "recipients": int(stats.get("recipients") or 0),
        })

    sent = [c for c in campaigns if c["status"].lower() in ["sent", "sending"]]
    total_camp_rev = sum(c["conv_value"] for c in sent)
    total_flow_rev = sum(f["conv_value"] for f in flows)
    avg_open = sum(c["open_rate"] for c in sent) / max(len(sent), 1)
    avg_click = sum(c["click_rate"] for c in sent) / max(len(sent), 1)
    avg_conv = sum(c["conv_rate"] for c in sent) / max(len(sent), 1)

    return {
        "brand": brand_config,
        "campaigns": campaigns,
        "flows": flows,
        "kpis": {
            "total_revenue": total_camp_rev + total_flow_rev,
            "campaign_revenue": total_camp_rev,
            "flow_revenue": total_flow_rev,
            "avg_open_rate": avg_open,
            "avg_click_rate": avg_click,
            "avg_conv_rate": avg_conv,
            "campaign_count": len(sent),
            "flow_count": len(flows),
        },
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "period_start": (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d"),
        "period_end": datetime.utcnow().strftime("%Y-%m-%d"),
    }


def generate_html(data):
    brand = data["brand"]
    color = brand["color"]
    color_dim = brand["color_dim"]
    name = brand["name"]
    emoji = brand["emoji"]
    category = brand["category"]
    brand_key = brand["brand_key"]
    generated_at = data["generated_at"]

    campaigns_json = json.dumps(data["campaigns"], ensure_ascii=False)
    flows_json = json.dumps(data["flows"], ensure_ascii=False)
    flujos_json = json.dumps(FLUJOS_POR_MARCA.get(brand_key, []), ensure_ascii=False)

    # HTML usando concatenacion en lugar de f-string para evitar conflictos con JS
    html_parts = []
    html_parts.append("""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>""")
    html_parts.append(name)
    html_parts.append(""" — Email Intelligence</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0D0F0E;--s1:#151918;--s2:#1C201F;--b:#252B29;
  --ac:""")
    html_parts.append(color)
    html_parts.append(""";--acd:""")
    html_parts.append(color_dim)
    html_parts.append(""";
  --red:#FF4D4D;--redd:rgba(255,77,77,.12);
  --amb:#F2A93D;--ambd:rgba(242,169,61,.12);
  --blue:#3DA8F2;
  --tx:#E8EDE8;--tx2:#8A9490;--tx3:#5A6460;
  box-sizing:border-box;
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
}
*{box-sizing:inherit;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:'Inter',sans-serif;font-size:14px;min-height:100vh}
.topbar{padding:14px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;position:sticky;top:0;background:var(--bg);z-index:100}
.brand-name{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--ac)}
.brand-sub{font-size:11px;color:var(--tx3);margin-top:2px}
.updated{font-size:11px;color:var(--tx3);background:var(--s2);padding:4px 10px;border-radius:6px;border:1px solid var(--b)}
.controls{padding:12px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--s1)}
.dl{font-size:11px;color:var(--tx3);font-weight:500}
.di{background:var(--s2);border:1px solid var(--b);color:var(--tx);font-family:'Inter',sans-serif;font-size:12px;padding:6px 10px;border-radius:7px;outline:none;transition:border .2s}
.di:focus,.di:hover{border-color:var(--ac)}
.qb{padding:5px 11px;font-size:11px;font-weight:500;border-radius:6px;cursor:pointer;border:1px solid var(--b);background:none;color:var(--tx3);font-family:'Inter',sans-serif;transition:all .2s}
.qb:hover{border-color:var(--ac);color:var(--ac)}.qb.active{background:var(--acd);border-color:var(--ac);color:var(--ac)}
.btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;border:none;display:inline-flex;align-items:center;gap:5px;transition:all .2s}
.btn-opt{background:var(--redd);color:var(--red);border:1px solid rgba(255,77,77,.25)}
.btn-flu{background:rgba(61,168,242,.12);color:#3DA8F2;border:1px solid rgba(61,168,242,.25)}
.tabs{display:flex;border-bottom:1px solid var(--b);padding:0 24px}
.tab{padding:10px 16px;font-size:13px;font-weight:500;color:var(--tx3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .2s;white-space:nowrap}
.tab:hover{color:var(--tx2)}.tab.active{color:var(--ac);border-bottom-color:var(--ac)}
.main{padding:20px 24px;max-width:1300px}
.kpig{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.kc{background:var(--s1);border:1px solid var(--b);border-radius:11px;padding:15px;position:relative;overflow:hidden}
.kc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.kc.g::before{background:var(--ac)}.kc.r::before{background:var(--red)}.kc.a::before{background:var(--amb)}.kc.b::before{background:var(--blue)}
.kl{font-size:10px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.kv{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;line-height:1;margin-bottom:2px}
.ks{font-size:11px;color:var(--tx3)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.card{background:var(--s1);border:1px solid var(--b);border-radius:11px;overflow:hidden}
.ch{padding:13px 16px 10px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between}
.ct{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600}
.cb{padding:14px 16px}
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-size:10px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:7px 10px;text-align:left;border-bottom:1px solid var(--b)}
.tbl td{padding:9px 10px;font-size:12px;color:var(--tx2);border-bottom:1px solid rgba(37,43,41,.4)}
.tbl tr:last-child td{border-bottom:none}.tbl tr:hover td{background:var(--s2)}
.cn{color:var(--tx);font-weight:500;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{display:inline-block;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}
.ph{background:var(--acd);color:var(--ac)}.pm{background:var(--ambd);color:var(--amb)}.pl{background:var(--redd);color:var(--red)}
.ins{background:var(--acd);border:1px solid rgba(181,242,61,.15);border-radius:8px;padding:11px 13px;margin-bottom:14px;font-size:12px;color:var(--tx2);line-height:1.6}
.ins strong{color:var(--ac)}
.fi{padding:11px 0;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between}
.fi:last-child{border-bottom:none}
.fn{font-weight:500;color:var(--tx);font-size:12px}.ft{font-size:10px;color:var(--tx3);margin-top:2px}
.frev{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--ac);text-align:right}
.oi{padding:12px;background:var(--s2);border-radius:7px;margin-bottom:9px;border-left:3px solid}
.oi.cr{border-color:var(--red)}.oi.wa{border-color:var(--amb)}.oi.ok{border-color:var(--ac)}
.otag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.oi.cr .otag{color:var(--red)}.oi.wa .otag{color:var(--amb)}.oi.ok .otag{color:var(--ac)}
.ott{font-weight:600;color:var(--tx);font-size:12px;margin-bottom:3px}.odd{color:var(--tx2);font-size:11px;line-height:1.5}
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:none;align-items:center;justify-content:center;padding:20px}
.modal-ov.open{display:flex}
.modal{background:var(--s1);border:1px solid var(--b);border-radius:14px;width:100%;max-width:700px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column}
.mh{padding:15px 18px;border-bottom:1px solid var(--b);display:flex;align-items:center;justify-content:space-between}
.mt{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600}
.mc{padding:18px;overflow-y:auto;flex:1;font-size:13px;color:var(--tx2);line-height:1.7;white-space:pre-wrap}
.mf{padding:12px 18px;border-top:1px solid var(--b);display:flex;gap:8px;justify-content:flex-end}
.cbtn{background:none;border:none;color:var(--tx3);cursor:pointer;font-size:18px}
.fsel{background:var(--s2);border:1px solid var(--b);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;transition:all .2s}
.fsel:hover,.fsel.sel{border-color:var(--ac);background:var(--acd)}
.fsn{font-weight:600;color:var(--tx);font-size:13px;margin-bottom:3px}.fsd{font-size:12px;color:var(--tx2)}
.ftag{display:inline-block;background:rgba(61,168,242,.12);color:#3DA8F2;font-size:10px;padding:2px 6px;border-radius:4px;margin:3px 2px 0 0}
.spin{width:22px;height:22px;border:2px solid var(--b);border-top-color:var(--ac);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.lrow{display:flex;align-items:center;gap:10px;color:var(--tx3);padding:24px;justify-content:center}
@media(max-width:900px){.kpig{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}.main{padding:14px}.topbar,.controls{padding:12px 14px}}
</style>
</head>
<body>
<div class="topbar">
  <div>
    <div class="brand-name">""")
    html_parts.append(emoji + " " + name.upper())
    html_parts.append("""</div>
    <div class="brand-sub">""")
    html_parts.append(category)
    html_parts.append(""" &middot; Email Intelligence &middot; Alicia Prieto</div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <div class="updated">Actualizado: """)
    html_parts.append(generated_at)
    html_parts.append("""</div>
    <button class="btn btn-opt" onclick="openOpt()">&#9889; Ejecutar optimizacion</button>
    <button class="btn btn-flu" onclick="openFlujo()">+ Crear flujo</button>
  </div>
</div>
<div class="controls">
  <span class="dl">Desde</span>
  <input type="date" class="di" id="df" onchange="applyD()">
  <span style="color:var(--tx3);font-size:12px">&#8594;</span>
  <input type="date" class="di" id="dt" onchange="applyD()">
  <button class="qb" onclick="sq(7,this)">7 dias</button>
  <button class="qb active" onclick="sq(30,this)">30 dias</button>
  <button class="qb" onclick="sq(90,this)">3 meses</button>
  <button class="qb" onclick="sq('mes',this)">Este mes</button>
  <button class="qb" onclick="sq('lastmes',this)">Mes anterior</button>
  <span style="margin-left:auto;font-size:11px;color:var(--tx3)" id="dlabel"></span>
</div>
<div class="tabs">
  <div class="tab active" onclick="showT('resultados',this)">Resultados</div>
  <div class="tab" onclick="showT('flujos',this)">Flujos</div>
  <div class="tab" onclick="showT('optimizaciones',this)">Optimizaciones</div>
</div>
<div class="main">
  <div id="t-resultados"></div>
  <div id="t-flujos" style="display:none"></div>
  <div id="t-optimizaciones" style="display:none"></div>
</div>
<div class="modal-ov" id="m-opt">
  <div class="modal">
    <div class="mh"><div class="mt">&#9889; Plan de optimizacion</div><button class="cbtn" onclick="cm('m-opt')">&#10005;</button></div>
    <div class="mc" id="m-opt-body"></div>
    <div class="mf">
      <button class="btn" style="background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="cm('m-opt')">Cerrar</button>
      <button class="btn" style="background:var(--acd);color:var(--ac);border:1px solid rgba(181,242,61,.2)" onclick="dlTxt('opt')">&#8595; Descargar</button>
    </div>
  </div>
</div>
<div class="modal-ov" id="m-flu">
  <div class="modal">
    <div class="mh"><div class="mt">+ Crear flujo en Klaviyo</div><button class="cbtn" onclick="cm('m-flu')">&#10005;</button></div>
    <div class="mc" id="m-flu-body" style="white-space:normal">
      <p style="margin-bottom:12px;color:var(--tx2)">Selecciona el flujo. Recibiras el paso a paso completo para subirlo a Klaviyo.</p>
      <div id="f-opts"></div>
      <div id="f-gen" style="display:none"><div class="lrow"><div class="spin"></div>Generando guia...</div></div>
      <div id="f-res" style="display:none;white-space:pre-wrap;font-size:12px;line-height:1.7;color:var(--tx2)"></div>
    </div>
    <div class="mf">
      <button class="btn" id="f-back" style="display:none;background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="backF()">&#8592; Volver</button>
      <button class="btn" style="background:var(--s2);border:1px solid var(--b);color:var(--tx2)" onclick="cm('m-flu')">Cerrar</button>
      <button class="btn" id="f-dl" style="display:none;background:var(--acd);color:var(--ac);border:1px solid rgba(181,242,61,.2)" onclick="dlTxt('flu')">&#8595; Descargar paso a paso</button>
    </div>
  </div>
</div>
<script>
const ALL_CAMPS = """)
    html_parts.append(campaigns_json)
    html_parts.append(""";
const ALL_FLOWS = """)
    html_parts.append(flows_json)
    html_parts.append(""";
const FLUJOS = """)
    html_parts.append(flujos_json)
    html_parts.append(""";
const BRAND_NAME = \"""")
    html_parts.append(name)
    html_parts.append("""\";
const GENERATED = \"""")
    html_parts.append(generated_at)
    html_parts.append("""\";

let df=null,dt=null,optTxt='',fluTxt='',selFlu='';

function fmt8(d){return d.toISOString().split('T')[0]}
function fmtU(n){return'$'+Number(n||0).toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',')}
function fmtP(n){return(Number(n||0)*100).toFixed(1)+'%'}
function pc(v,h,m){return v>=h?'ph':v>=m?'pm':'pl'}
function cm(id){document.getElementById(id).classList.remove('open')}
function showT(id,el){
  ['resultados','flujos','optimizaciones'].forEach(function(t){document.getElementById('t-'+t).style.display='none'});
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
  document.getElementById('t-'+id).style.display='block';
  el.classList.add('active');
}
function initD(){
  var today=new Date();
  var from=new Date(today);from.setDate(from.getDate()-30);
  dt=today;df=from;
  document.getElementById('dt').value=fmt8(today);
  document.getElementById('df').value=fmt8(from);
  updLabel();
}
function sq(n,btn){
  document.querySelectorAll('.qb').forEach(function(b){b.classList.remove('active')});btn.classList.add('active');
  var today=new Date();var from=new Date(today);
  if(n==='mes'){from=new Date(today.getFullYear(),today.getMonth(),1);}
  else if(n==='lastmes'){from=new Date(today.getFullYear(),today.getMonth()-1,1);dt=new Date(today.getFullYear(),today.getMonth(),0);document.getElementById('dt').value=fmt8(dt);}
  else{from.setDate(from.getDate()-n);dt=today;document.getElementById('dt').value=fmt8(today);}
  df=from;document.getElementById('df').value=fmt8(from);
  updLabel();render();
}
function applyD(){
  document.querySelectorAll('.qb').forEach(function(b){b.classList.remove('active')});
  var f=document.getElementById('df').value,t=document.getElementById('dt').value;
  if(f)df=new Date(f);if(t)dt=new Date(t);
  updLabel();render();
}
function updLabel(){
  var ops={day:'2-digit',month:'short',year:'numeric'};
  var f=df?df.toLocaleDateString('es',ops):'--';
  var t=dt?dt.toLocaleDateString('es',ops):'--';
  document.getElementById('dlabel').textContent=f+' > '+t;
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
  var sent=camps.filter(function(c){return['sent','sending'].indexOf(c.status.toLowerCase())>-1});
  var campRev=sent.reduce(function(s,c){return s+c.conv_value},0);
  var flowRev=ALL_FLOWS.reduce(function(s,f){return s+f.conv_value},0);
  var totalRev=campRev+flowRev;
  var avgOr=sent.length?sent.reduce(function(s,c){return s+c.open_rate},0)/sent.length:0;
  var avgCr=sent.length?sent.reduce(function(s,c){return s+c.click_rate},0)/sent.length:0;
  var avgCvr=sent.length?sent.reduce(function(s,c){return s+c.conv_rate},0)/sent.length:0;
  var sortRev=sent.slice().sort(function(a,b){return b.conv_value-a.conv_value});
  var best=sortRev[0];
  var worst=sortRev[sortRev.length-1];

  var campsHTML='';
  if(camps.length){
    camps.forEach(function(c){
      var isQueued=c.status.toLowerCase()==='queued';
      campsHTML+='<tr><td><div class="cn">'+c.name+'</div><div style="font-size:10px;color:var(--tx3)">'+c.date+' &middot; '+c.status+'</div></td>';
      campsHTML+='<td>'+(isQueued||!c.open_rate?'--':'<span class="pill '+pc(c.open_rate,.65,.4)+'">'+fmtP(c.open_rate)+'</span>')+'</td>';
      campsHTML+='<td>'+(isQueued||!c.click_rate?'--':'<span class="pill '+pc(c.click_rate,.005,.002)+'">'+fmtP(c.click_rate)+'</span>')+'</td>';
      campsHTML+='<td style="font-weight:600;color:var(--tx)">'+fmtU(c.conv_value)+'</td></tr>';
    });
  } else {
    campsHTML='<tr><td colspan="4" style="text-align:center;color:var(--tx3);padding:20px">Sin campanas en el periodo</td></tr>';
  }

  var bestHTML='';
  if(best){
    bestHTML='<div class="card" style="margin-bottom:14px"><div class="ch"><div class="ct">Mejor campana</div></div><div class="cb">';
    bestHTML+='<div style="font-size:13px;font-weight:600;color:var(--ac);margin-bottom:10px">'+best.name+'</div>';
    bestHTML+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">';
    bestHTML+='<div><div style="font-size:10px;color:var(--tx3)">Revenue</div><div style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700">'+fmtU(best.conv_value)+'</div></div>';
    bestHTML+='<div><div style="font-size:10px;color:var(--tx3)">Apertura</div><div style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700">'+fmtP(best.open_rate)+'</div></div>';
    bestHTML+='<div><div style="font-size:10px;color:var(--tx3)">Conv.</div><div style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700">'+fmtP(best.conv_rate)+'</div></div>';
    bestHTML+='</div><div style="font-size:12px;color:var(--tx2)">Mayor revenue del periodo. Replicar asunto y segmento.</div></div></div>';
  }
  var worstHTML='';
  if(worst&&worst!==best){
    worstHTML='<div class="card"><div class="ch"><div class="ct">A revisar</div></div><div class="cb">';
    worstHTML+='<div style="font-size:13px;font-weight:600;color:var(--red);margin-bottom:10px">'+worst.name+'</div>';
    worstHTML+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">';
    worstHTML+='<div><div style="font-size:10px;color:var(--tx3)">Revenue</div><div style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700;color:var(--red)">'+fmtU(worst.conv_value)+'</div></div>';
    worstHTML+='<div><div style="font-size:10px;color:var(--tx3)">Apertura</div><div style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700">'+fmtP(worst.open_rate)+'</div></div>';
    worstHTML+='<div><div style="font-size:10px;color:var(--tx3)">Conv.</div><div style="font-family:Space Grotesk,sans-serif;font-size:18px;font-weight:700">'+fmtP(worst.conv_rate)+'</div></div>';
    worstHTML+='</div><div style="font-size:12px;color:var(--tx2)">Menor conversion. Revisar segmento y asunto.</div></div></div>';
  }

  document.getElementById('t-resultados').innerHTML=
    '<div class="kpig" style="margin-top:18px">'+
    '<div class="kc g"><div class="kl">Revenue total</div><div class="kv">'+fmtU(totalRev)+'</div><div class="ks">Campanas '+fmtU(campRev)+' + Flujos '+fmtU(flowRev)+'</div></div>'+
    '<div class="kc g"><div class="kl">Apertura promedio</div><div class="kv">'+fmtP(avgOr)+'</div><div class="ks">Industria 35-45%</div></div>'+
    '<div class="kc a"><div class="kl">Clics promedio</div><div class="kv">'+fmtP(avgCr)+'</div><div class="ks">'+(avgCr<.015?'Por debajo del objetivo':'En rango objetivo')+'</div></div>'+
    '<div class="kc b"><div class="kl">Conversion</div><div class="kv">'+fmtP(avgCvr)+'</div><div class="ks">'+sent.length+' campanas enviadas</div></div>'+
    '</div>'+
    '<div class="ins"><strong>Resumen:</strong> Revenue email: <strong>'+fmtU(totalRev)+'</strong>. Apertura: <strong>'+fmtP(avgOr)+'</strong>. '+sent.length+' campanas y '+ALL_FLOWS.length+' flujos activos.</div>'+
    '<div class="two">'+
    '<div class="card"><div class="ch"><div class="ct">Campanas del periodo</div><div style="font-size:11px;color:var(--tx3)">'+camps.length+' campanas</div></div>'+
    '<table class="tbl"><thead><tr><th>Campana</th><th>Apertura</th><th>Clics</th><th>Revenue</th></tr></thead><tbody>'+campsHTML+'</tbody></table></div>'+
    '<div>'+bestHTML+worstHTML+'</div>'+
    '</div>';

  var flowsHTML='';
  if(ALL_FLOWS.length){
    ALL_FLOWS.forEach(function(f){
      flowsHTML+='<tr><td class="cn">'+f.name+'</td><td style="font-size:11px;color:var(--tx3)">'+f.trigger+'</td>';
      flowsHTML+='<td><span class="pill '+pc(f.open_rate,.5,.4)+'">'+fmtP(f.open_rate)+'</span></td>';
      flowsHTML+='<td><span class="pill '+pc(f.conv_rate,.05,.01)+'">'+fmtP(f.conv_rate)+'</span></td>';
      flowsHTML+='<td style="font-weight:600;color:var(--tx)">'+fmtU(f.conv_value)+'</td>';
      flowsHTML+='<td>'+fmtU(f.rpr)+'</td></tr>';
    });
  } else {
    flowsHTML='<tr><td colspan="6" style="text-align:center;color:var(--tx3);padding:20px">Sin flujos activos</td></tr>';
  }
  document.getElementById('t-flujos').innerHTML=
    '<div style="margin-top:18px" class="card"><div class="ch"><div class="ct">Flujos activos</div></div>'+
    '<table class="tbl"><thead><tr><th>Flujo</th><th>Trigger</th><th>Apertura</th><th>Conv.</th><th>Revenue</th><th>RPR</th></tr></thead>'+
    '<tbody>'+flowsHTML+'</tbody></table></div>';

  document.getElementById('t-optimizaciones').innerHTML=
    '<div style="margin-top:18px">'+
    '<div style="font-size:13px;color:var(--tx2);margin-bottom:14px">Basado en '+sent.length+' campanas y '+ALL_FLOWS.length+' flujos. Usa Ejecutar optimizacion para el plan completo.</div>'+
    (avgCr<.015?'<div class="oi wa"><div class="otag">Importante</div><div class="ott">Tasa de clics '+fmtP(avgCr)+' por debajo del objetivo 1.5%</div><div class="odd">A/B testear CTAs mas especificos y agregar segundo boton en el cuerpo del email.</div></div>':'')+
    (ALL_FLOWS.some(function(f){return f.conv_rate===0})?'<div class="oi cr"><div class="otag">Critico</div><div class="ott">Flujo con 0% conversion detectado</div><div class="odd">Revisar trigger y configuracion. Puede estar mal configurado.</div></div>':'')+
    '<div class="oi ok"><div class="otag">Accion</div><div class="ott">Ejecuta el analisis IA para el plan completo</div><div class="odd">Haz clic en Ejecutar optimizacion para todos los pasos de accion de esta semana y el proximo mes.</div></div>'+
    '</div>';
}

function openOpt(){
  document.getElementById('m-opt').classList.add('open');
  var camps=fCamps().filter(function(c){return['sent','sending'].indexOf(c.status.toLowerCase())>-1});
  var flowRev=ALL_FLOWS.reduce(function(s,f){return s+f.conv_value},0);
  var campRev=camps.reduce(function(s,c){return s+c.conv_value},0);
  var avgOr=camps.length?camps.reduce(function(s,c){return s+c.open_rate},0)/camps.length:0;
  var avgCr=camps.length?camps.reduce(function(s,c){return s+c.click_rate},0)/camps.length:0;
  var avgCvr=camps.length?camps.reduce(function(s,c){return s+c.conv_rate},0)/camps.length:0;
  var sortRev=camps.slice().sort(function(a,b){return b.conv_value-a.conv_value});
  var best=sortRev[0];

  var plan='PLAN DE OPTIMIZACION -- '+BRAND_NAME.toUpperCase()+'\\n';
  plan+='Periodo: '+document.getElementById('dlabel').textContent+'\\n';
  plan+='Actualizado: '+GENERATED+'\\n\\n';
  plan+='DIAGNOSTICO RAPIDO\\n';
  plan+='Revenue email total: '+fmtU(campRev+flowRev)+'\\n';
  plan+='  Campanas: '+fmtU(campRev)+' ('+camps.length+' enviadas)\\n';
  plan+='  Flujos: '+fmtU(flowRev)+' ('+ALL_FLOWS.length+' activos)\\n';
  plan+='Apertura promedio: '+fmtP(avgOr)+'\\n';
  plan+='Clics promedio: '+fmtP(avgCr)+'\\n';
  plan+='Conversion promedio: '+fmtP(avgCvr)+'\\n';
  if(best)plan+='Mejor campana: "'+best.name+'" con '+fmtU(best.conv_value)+'\\n';
  plan+='\\nACCIONES INMEDIATAS -- ESTA SEMANA\\n\\n';
  plan+='1. SEGMENTACION\\n';
  plan+='   Revisar segmentos de las ultimas 3 campanas\\n';
  plan+='   Usar solo contactos activos (ultimos 60-90 dias)\\n';
  plan+='   Excluir compradores recientes de campanas promocionales\\n';
  plan+='   Como: Klaviyo > Segments > revisar condiciones\\n\\n';
  plan+='2. TASA DE CLICS\\n';
  plan+='   A/B testear CTA principal con accion especifica\\n';
  plan+='   Ejemplo: "Ver oferta" > "Comprar [producto] con 15% OFF"\\n';
  plan+='   Agregar segundo boton a mitad del email\\n';
  plan+='   Como: Klaviyo > Campaigns > New Campaign > A/B Test\\n\\n';
  plan+='3. FLUJOS ACTIVOS\\n';
  plan+='   Revisar flujo con menor conversion\\n';
  plan+='   Verificar que el trigger este disparando correctamente\\n';
  plan+='   Revisar primer email del Welcome Series\\n';
  plan+='   Como: Klaviyo > Flows > seleccionar flujo > Analytics\\n\\n';
  plan+='ACCIONES PROXIMO MES\\n\\n';
  plan+='1. NUEVO FLUJO -- REACTIVACION\\n';
  plan+='   Crear flujo Win-Back para contactos sin compra en 60+ dias\\n';
  plan+='   Secuencia: reconexion > oferta personalizada > urgencia\\n';
  plan+='   Impacto esperado: recuperar 5-10% de clientes dormidos\\n\\n';
  plan+='2. CONTENIDO EDUCATIVO\\n';
  plan+='   Intercalar 1 email educativo por cada 2 promocionales\\n';
  plan+='   El contenido educativo genera CTR mas alto sin descuento\\n\\n';
  plan+='3. OPTIMIZACION DE DESCUENTOS\\n';
  plan+='   Probar descuentos intermedios (10-15%) con urgencia real\\n';
  plan+='   Usar countdown de 48 horas\\n\\n';
  plan+='KPIS A MONITOREAR\\n';
  plan+='Apertura: objetivo >45%\\n';
  plan+='Clics: objetivo 1.5-2.5%\\n';
  plan+='Conversion: objetivo >0.3% por campana\\n';
  plan+='Revenue por recipient (RPR): objetivo >$0.10\\n';
  plan+='Tasa de baja: mantener <0.2% por envio\\n';

  optTxt=plan;
  document.getElementById('m-opt-body').textContent=plan;
}

function openFlujo(){
  document.getElementById('m-flu').classList.add('open');
  backF();
  var html='';
  FLUJOS.forEach(function(f){
    html+='<div class="fsel" onclick="selFlujo(\''+f.id+'\',\''+f.name+'\',this)">';
    html+='<div class="fsn">'+f.name+'</div>';
    html+='<div class="fsd">'+f.desc+'</div>';
    html+='<div style="margin-top:6px">';
    f.tags.forEach(function(t){html+='<span class="ftag">'+t+'</span>'});
    html+='</div></div>';
  });
  document.getElementById('f-opts').innerHTML=html;
}

function selFlujo(id,nombre,el){
  selFlu=id;
  document.querySelectorAll('.fsel').forEach(function(f){f.classList.remove('sel')});
  el.classList.add('sel');
  setTimeout(function(){genFlujo(id,nombre)},300);
}

function genFlujo(id,nombre){
  document.getElementById('f-opts').style.display='none';
  document.getElementById('f-gen').style.display='flex';
  document.getElementById('f-res').style.display='none';
  document.getElementById('f-back').style.display='none';
  document.getElementById('f-dl').style.display='none';

  var guias={
    winback:'FLUJO: WIN-BACK -- REACTIVACION\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nMetric > Placed Order\\nCondicion: Sin compra en ultimos 60 dias\\nY: Ha comprado al menos 1 vez (all time)\\n\\nFILTRO DE FLUJO:\\nNo incluir si compro en ultimos 60 dias\\nNo incluir si recibio este flujo en ultimos 90 dias\\n\\nEMAIL 1 -- DIA 0 (RECONEXION)\\nAsunto A: "Te echamos de menos, {{ first_name }}"\\nAsunto B: "Como va tu progreso?"\\nPreheader: "Ha pasado un tiempo desde tu ultimo pedido"\\nObjetivo: Reconexion emocional. SIN descuento.\\nContenido:\\n  1. Saludo personalizado\\n  2. Reconocer que ha pasado tiempo\\n  3. Recordar el producto que compro\\n  4. CTA suave: "Ver mis productos favoritos"\\n\\nEMAIL 2 -- DIA 5 (OFERTA)\\nAsunto A: "Tu proximo pedido con 15% OFF"\\nAsunto B: "Exclusivo para ti: 15% en tu reorden"\\nPreheader: "Codigo: VUELVE15 -- valido 72 horas"\\nObjetivo: Conversion con descuento moderado.\\nContenido:\\n  1. Beneficios del producto\\n  2. Oferta: 15% OFF codigo VUELVE15\\n  3. Countdown 72 horas\\n  4. CTA: "Usar mi descuento ahora"\\n  5. Testimonios (1-2 reviews)\\n\\nEMAIL 3 -- DIA 12 (URGENCIA FINAL)\\nAsunto A: "Ultima oportunidad -- descuento vence hoy"\\nAsunto B: "{{ first_name }}, tu oferta expira a medianoche"\\nPreheader: "Solo quedan horas"\\nObjetivo: Urgencia maxima.\\nContenido:\\n  1. "Tu descuento vence HOY"\\n  2. Resumen rapido de la oferta\\n  3. CTA prominente\\n  4. Si no convierte > mover a segmento inactivo\\n\\nKPIS ESPERADOS (30 dias):\\nEmail 1: Apertura >45%, Clics >2%\\nEmail 2: Conversion >3%\\nEmail 3: Conversion >1.5%',

    upsell:'FLUJO: UPSELL POST-COMPRA\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nMetric > Placed Order\\nDelay: 3 dias post-compra\\nCondicion: No ha comprado el producto complementario\\n\\nEMAIL 1 -- DIA 3 (EDUCATIVO)\\nAsunto: "Tu pedido llego -- ahora el siguiente nivel"\\nPreheader: "Descubre como potenciar tus resultados"\\nObjetivo: Educar sobre el complemento. SIN precio agresivo.\\nContenido:\\n  1. Confirmar recepcion del pedido\\n  2. Introducir producto complementario\\n  3. Por que la combinacion es superior\\n  4. Testimonios\\n  5. CTA suave: "Descubrir el combo"\\n\\nEMAIL 2 -- DIA 10 (OFERTA)\\nAsunto: "10% OFF esta semana en [complemento]"\\nPreheader: "Porque ya sabes lo que funciona"\\nContenido:\\n  1. Reforzar beneficios del combo\\n  2. Oferta 10% OFF\\n  3. CTA: "Agregar al proximo pedido"\\n\\nKPIS ESPERADOS:\\nEmail 1: Apertura >40%, Clics >3%\\nEmail 2: Conversion >2%, AOV incremento >15%',

    educativo:'FLUJO: EDUCATIVO POST-PRIMERA COMPRA\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nAdded to List > Lista de Buyers (compradores)\\nCondicion: Primera compra solamente\\n\\nEMAIL 1 -- DIA 7\\nAsunto: "Como usar [producto] para maximos resultados"\\nObjetivo: Valor puro. Sin venta.\\nContenido: Guia de uso, timing, dosis, tips.\\n\\nEMAIL 2 -- DIA 14\\nAsunto: "La ciencia detras de [ingrediente/proceso]"\\nObjetivo: Posicionar a la marca como experta.\\nContenido: Articulo educativo sobre ingrediente clave.\\n\\nEMAIL 3 -- DIA 21\\nAsunto: "Tu rutina optimizada con [producto]"\\nObjetivo: Integrar el producto en el habito del cliente.\\nContenido: Plan semanal con el producto.\\n\\nEMAIL 4 -- DIA 28\\nAsunto: "Listo para el siguiente nivel? 10% OFF"\\nObjetivo: Conversion despues de 4 semanas de valor.\\nCTA: "Hacer mi segundo pedido"\\n\\nKPIS ESPERADOS:\\nTasa de recompra: >25% en 60 dias\\nApertura promedio: >45%',

    abandono:'FLUJO: ABANDONO DE CARRITO OPTIMIZADO\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nMetric > Started Checkout\\nFILTRO CRITICO: Has NOT done Placed Order in last 4 hours\\n\\nEMAIL 1 -- 1 HORA (RECORDATORIO)\\nAsunto: "Olvidaste algo en tu carrito, {{ first_name }}"\\nPreheader: "Tu seleccion te esta esperando"\\nObjetivo: Recordatorio suave. Sin descuento.\\nContenido:\\n  1. Productos del carrito (dynamic content)\\n  2. CTA: "Volver a mi carrito"\\n\\nEMAIL 2 -- 24 HORAS (SOCIAL PROOF)\\nAsunto: "Miles de clientes ya lo eligieron"\\nContenido:\\n  1. Reviews de los productos\\n  2. Garantia/politica devolucion\\n  3. CTA: "Completar mi pedido"\\n\\nEMAIL 3 -- 72 HORAS (OFERTA FINAL)\\nAsunto: "10% OFF solo por las proximas 24 horas"\\nContenido:\\n  1. Codigo descuento valido 24h\\n  2. Productos del carrito visibles\\n  3. CTA prominente: "Usar mi descuento"\\n\\nKPIS ESPERADOS:\\nRecuperacion total: 10-15% de carritos abandonados',

    vip:'FLUJO: VIP FIDELIZACION\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nMetric > Placed Order\\nFiltro: Ha hecho exactamente 3 pedidos (tercera compra)\\n\\nEMAIL 1 -- DIA 0 (BIENVENIDA VIP)\\nAsunto: "{{ first_name }}, eres parte de nuestro circulo VIP"\\nObjetivo: Reconocimiento y sorpresa positiva.\\nContenido:\\n  1. Anuncio de estatus VIP\\n  2. Beneficios: descuento permanente, acceso anticipado\\n  3. Sin CTA de compra -- email de reconocimiento\\n\\nEMAIL 2 -- DIA 3 (ACCESO ANTICIPADO)\\nAsunto: "Acceso anticipado: nuevo producto antes que nadie"\\nContenido:\\n  1. Nuevo producto o temporada\\n  2. Codigo de acceso anticipado\\n  3. CTA: "Ser el primero en probarlo"\\n\\nEMAIL 3 -- DIA 10 (DESCUENTO EXCLUSIVO)\\nAsunto: "Tu descuento VIP del mes: 20% en todo"\\nContenido:\\n  1. Descuento VIP mensual\\n  2. Productos recomendados por historial\\n  3. CTA: "Usar mi descuento VIP"\\n\\nKPIS ESPERADOS:\\nRetencion VIPs: >85% compra en 60 dias\\nAOV VIP vs normal: >30% mayor',

    welcome:'FLUJO: WELCOME SERIES\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nAdded to List > Lista principal de suscriptores\\n\\nBIFURCACION:\\nConditional Split: Ha hecho Placed Order\\nRama SI > cliente existente\\nRama NO > prospecto nuevo\\n\\nEMAIL 1 -- INMEDIATO\\nAsunto: "Bienvenido a '+BRAND_NAME+'"\\nObjetivo: Primera impresion. Voz de la marca.\\nContenido:\\n  1. Historia de la marca en 3 lineas\\n  2. Que hace diferente al producto\\n  3. Que esperar de los proximos emails\\n  4. CTA suave: "Descubrir nuestra historia"\\n\\nEMAIL 2 -- DIA 3\\nAsunto: "Sabes que hace diferente a [producto]?"\\nObjetivo: Educar y generar deseo.\\nContenido: Proceso, ingredientes, origen.\\n\\nEMAIL 3 -- DIA 7\\nAsunto: "Tu primera compra con 15% OFF"\\nObjetivo: Conversion con incentivo bienvenida.\\nCodigo: BIENVENIDO15 (valido 7 dias)\\n\\nKPIS ESPERADOS:\\nEmail 1: Apertura >55%\\nEmail 3: Conversion >4%',

    replenishment:'FLUJO: REABASTECIMIENTO\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nMetric > Placed Order\\nDelay: [X] dias segun tiempo de consumo estimado del producto\\n\\nEMAIL 1 -- DIA [X-5] (RECORDATORIO)\\nAsunto: "Tu [producto] se esta acabando pronto"\\nPreheader: "Asegura tu proximo pedido"\\nObjetivo: Recordatorio anticipado sin urgencia.\\nContenido:\\n  1. Aviso amigable de que el producto se acaba\\n  2. Boton de reorden con 1 clic\\n  3. Sin descuento -- solo conveniencia\\n\\nEMAIL 2 -- DIA [X] (URGENCIA)\\nAsunto: "Ya te quedaste sin [producto]?"\\nPreheader: "10% OFF en tu reorden de hoy"\\nContenido:\\n  1. Urgencia de quedarse sin producto\\n  2. Descuento 10% para reorden inmediato\\n  3. CTA: "Reordenar ahora"\\n\\nKPIS ESPERADOS:\\nTasa de reorden: >30%\\nRPR: >$0.80',

    bundle:'FLUJO: BUNDLE EDUCATION\\nMarca: '+BRAND_NAME+'\\n\\nTRIGGER:\\nPlaced Order de producto A\\nCondicion: No ha comprado producto B\\nObjetivo: Aumentar AOV\\n\\nEMAIL 1 -- DIA 4\\nAsunto: "El combo perfecto para [beneficio]"\\nObjetivo: Educar sobre la combinacion sin vender.\\nContenido: Por que A + B juntos son superiores.\\n\\nEMAIL 2 -- DIA 10\\nAsunto: "Bundle A + B -- ahorra 15% comprando juntos"\\nObjetivo: Conversion con descuento en el bundle.\\nCTA: "Comprar el combo"\\n\\nKPIS ESPERADOS:\\nAdopcion del bundle: >10%\\nAOV incremento: >25%'
  };

  var guia=guias[id]||'Guia no disponible para este flujo.';
  fluTxt=guia;

  setTimeout(function(){
    document.getElementById('f-gen').style.display='none';
    document.getElementById('f-res').textContent=fluTxt;
    document.getElementById('f-res').style.display='block';
    document.getElementById('f-back').style.display='inline-flex';
    document.getElementById('f-dl').style.display='inline-flex';
  },800);
}

function backF(){
  document.getElementById('f-opts').style.display='block';
  document.getElementById('f-gen').style.display='none';
  document.getElementById('f-res').style.display='none';
  document.getElementById('f-back').style.display='none';
  document.getElementById('f-dl').style.display='none';
  document.querySelectorAll('.fsel').forEach(function(f){f.classList.remove('sel')});
  fluTxt='';
}

function dlTxt(t){
  var txt=t==='opt'?optTxt:fluTxt;
  if(!txt)return;
  var a=document.createElement('a');
  a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(txt);
  a.download=BRAND_NAME.toLowerCase().replace(/ /g,'_')+'_'+(t==='opt'?'optimizacion':'flujo_'+selFlu)+'.txt';
  a.click();
}

initD();render();
</script>
</body>
</html>""")

    return "".join(html_parts)


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
            output_path = os.path.join(output_dir, brand_config["output_file"])
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"OK: {brand_config['name']} > {output_path}")
        except Exception as e:
            print(f"ERROR {brand_config['name']}: {e}")

    print("Listo.")


if __name__ == "__main__":
    main()
