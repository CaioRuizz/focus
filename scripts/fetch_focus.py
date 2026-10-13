"""Baixa as expectativas anuais do Relatório Focus (Banco Central) e grava site/data/<indicador>.json.

Fonte: API Olinda do BCB, serviço Expectativas, recurso ExpectativasMercadoAnuais.
Roda no deploy (GitHub Actions) e localmente: python3 scripts/fetch_focus.py
Só usa a biblioteca padrão.
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "data"
API = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
SINCE = "2012-01-01"  # data da pesquisa mais antiga (o Focus projeta até 4 anos à frente, então 2016 começa em 2012)
FIRST_YEAR = 2016  # ano de referência mais antigo que entra no site

SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados?formato=json&dataInicial=01/01/{start}&dataFinal=31/12/{end}"

# Valor realizado de cada ano, para comparar com o que o mercado esperava. Séries do SGS:
#   IPCA: 13522 (acumulado em 12 meses) em dezembro
#   Selic: 432 (meta) no último dia do ano
#   PIB: 7326 (variação real anual, IBGE; o valor mais recente, já com revisões)
#   Câmbio: 1 (PTAX de venda), média dos dias úteis de dezembro. É a definição que bate com as respostas do
#   Focus: na última semana de cada ano a mediana fica a cerca de um centavo dessa média, enquanto a PTAX do
#   último dia útil chega a diferir em mais de R$ 0,10.
REALIZED = {"ipca": 13522, "selic": 432, "pib": 7326, "cambio": 1}

# chave do arquivo -> nome do indicador na API
INDICATORS = {
    "ipca": "IPCA",
    "selic": "Selic",
    "pib": "PIB Total",
    "cambio": "Câmbio",
}


def fetch(indicator: str) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "$format": "json",
            "$top": "200000",
            "$select": "Data,DataReferencia,Mediana,Media,Minimo,Maximo,numeroRespondentes,baseCalculo",
            # baseCalculo 0: projeções enviadas nos últimos 30 dias, a mesma base do relatório semanal
            "$filter": f"Indicador eq '{indicator}' and baseCalculo eq 0 and Data ge '{SINCE}'",
        },
        quote_via=urllib.parse.quote,
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(f"{API}?{query}", timeout=120) as resp:
                rows = json.load(resp)["value"]
            break
        except Exception as exc:  # a API do BCB oscila; tenta de novo antes de desistir
            if attempt == 3:
                raise RuntimeError(f"{indicator}: {exc}") from exc
            time.sleep(2 ** (attempt + 1))
    if not rows:
        raise RuntimeError(f"{indicator}: nenhum dado")
    return rows


def realized(key: str) -> dict[str, float]:
    code = REALIZED.get(key)
    if code is None:
        return {}
    url = SGS.format(code=code, start=FIRST_YEAR, end=date.today().year - 1)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                rows = json.load(resp)
            break
        except Exception as exc:
            if attempt == 3:
                raise RuntimeError(f"SGS {code}: {exc}") from exc
            time.sleep(2 ** (attempt + 1))
    out = {}
    december: dict[str, list[float]] = {}
    for r in rows:
        d, m, y = r["data"].split("/")
        if key == "cambio":
            if m == "12":
                december.setdefault(y, []).append(float(r["valor"]))
        elif key == "pib" or (key == "ipca" and m == "12") or (key == "selic" and (d, m) == ("31", "12")):
            out[y] = float(r["valor"])
    for y, values in december.items():
        out[y] = round(sum(values) / len(values), 4)
    return out


def weekly(rows: list[dict]) -> dict:
    """Um ponto por semana e por ano de referência: o último dia com dado na semana (em geral a sexta-feira,
    que é a data de referência do relatório publicado na segunda seguinte)."""
    by_year: dict[str, dict[tuple, dict]] = {}
    for r in rows:
        year = r["DataReferencia"]
        if not year.isdigit() or int(year) < FIRST_YEAR:
            continue
        day = date.fromisoformat(r["Data"])
        week = day.isocalendar()[:2]
        current = by_year.setdefault(year, {}).get(week)
        if current is None or r["Data"] > current["Data"]:
            by_year[year][week] = r
    out = {}
    for year, weeks in sorted(by_year.items()):
        points = sorted(weeks.values(), key=lambda r: r["Data"])
        out[year] = {
            "d": [r["Data"] for r in points],
            "med": [round(r["Mediana"], 4) for r in points],
            "mean": [round(r["Media"], 4) for r in points],
            "min": [round(r["Minimo"], 4) for r in points],
            "max": [round(r["Maximo"], 4) for r in points],
            "n": [r["numeroRespondentes"] for r in points],
        }
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    updated = datetime.now(timezone.utc).isoformat(timespec="minutes")
    latest = []
    for key, name in INDICATORS.items():
        rows = fetch(name)
        years = weekly(rows)
        last = max(r["Data"] for r in rows)
        latest.append(last)
        data = {"indicator": name, "updated": updated, "latest": last, "years": years, "realized": realized(key)}
        (OUT / f"{key}.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        print(f"{key}: {len(rows)} linhas, {len(years)} anos de referência, último dado {last}", file=sys.stderr)
    (OUT / "meta.json").write_text(json.dumps({"updated": updated, "latest": max(latest)}))


if __name__ == "__main__":
    main()
