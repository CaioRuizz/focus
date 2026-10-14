# Focus ao longo do tempo

Como as expectativas do [Relatório Focus](https://www.bcb.gov.br/publicacoes/focus) para IPCA, Selic, PIB e câmbio
mudaram semana a semana, comparadas com o que de fato aconteceu. Publicado em https://focus.caioruiz.com.

Site estático (HTML, CSS e JavaScript, sem build) em `site/`. Os dados vêm de APIs públicas do Banco Central:

- **Expectativas:** API Olinda, recurso `ExpectativasMercadoAnuais`, base de cálculo de 30 dias (a mesma do relatório).
  Um ponto por semana e por ano de referência: o último dia com dado na semana.
- **Realizado:** séries do SGS 13522 (IPCA em 12 meses, em dezembro), 432 (meta Selic em 31/12), 7326
  (variação real do PIB no ano) e 1 (PTAX de venda, média dos dias úteis de dezembro). Para o câmbio, a média de
  dezembro é a definição que bate com as respostas do Focus na última semana de cada ano (a seção "Metodologia" do
  site mostra a comparação ano a ano com a PTAX do último dia útil).

## Rodar localmente

```sh
python3 scripts/fetch_focus.py   # grava site/data/*.json
python3 -m http.server -d site 8000
```

e abra http://localhost:8000.

## Deploy

O CI/CD roda no Jenkins (http://100.92.14.38:4831, job `github/focus`), definido no `Jenkinsfile`: o Jenkins
consulta o GitHub a cada 5 minutos e, a cada commit novo na `main`, roda `scripts/fetch_focus.py` num container
descartável e publica a pasta `site/` na branch `gh-pages` (um commit só, sem histórico). O job `cron-focus` roda o
mesmo build em dias úteis às 09:17 (horário de Brasília). Se a API do Banco Central falhar, o build falha e o site
continua com os dados anteriores.

Configuração no GitHub: **Settings → Pages → Source: Deploy from a branch → `gh-pages`**, domínio personalizado
`focus.caioruiz.com` (vem de `site/CNAME`, com um registro CNAME `focus` → `caioruizz.github.io` no DNS).
