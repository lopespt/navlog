# CLAUDE.md — Guia rápido para Claude Code

Este arquivo orienta sessões do Claude Code trabalhando neste repositório.
Mantenha-o conciso. Para instruções de deploy, consulte o `README.md`.

## Visão geral

**Navlog** é um PWA de navegação aérea para pilotos de aviação geral, em
português (pt-BR). Permite planejar rotas (waypoints, fases climb/cruise/descent,
vento, combustível), acompanhar o voo em tempo real (ETA, ATA, GS, fuel) e
revisar o resultado em um diário.

- **Sem build step.** Arquivos estáticos servidos diretamente.
- **React via CDN** + Babel standalone fazem o transform de JSX no browser.
- **Offline-first** via Service Worker; estado em `localStorage`.
- Otimizado para Samsung Galaxy S24+, funciona em qualquer mobile moderno e
  desktop.

## Stack

- React 18 (CDN `unpkg.com/react@18`)
- Babel standalone `@babel/standalone@7.23.9` (transforma JSX em runtime)
- Tailwind CSS (CDN), ícones Lucide
- Leaflet 1.9.4 (aba Mapa)
- NOAA World Magnetic Model (declinação magnética)
- Node 18+ `node:test` para a suíte de testes (zero dependências npm)

Não há `package.json` — tudo vem por CDN.

## Layout de arquivos

```
index.html         shell HTML + bloco React/Babel (artefato de produção, ~420KB)
navlog.jsx         fonte React original/referência (~112KB)
lib/planning.js    matemática pura de planejamento de voo (testável)
lib/coords.js      parsing/formatação de coordenadas (decimal/DDM/DMS)
manifest.json      manifesto PWA
sw.js              service worker (cache versionado, ex: navlog-v7)
patch_map.py       utilitário Python que injetou as features de mapa no index
tests/             suíte node:test
icon-192.png, icon-512.png
README.md          guia em português (deploy GitHub Pages / Vercel)
```

## Abas e features

- **Setup** — aeronave (5 perfis: Baron 58, Dakota PA-28, Duke B60 pistão,
  Duke Turbina, Comanche PA-24), identificação (callsign, EOBT, ORIG/DEST/ALTN,
  VFR/IFR), ambiente (variação, vento, ISA), frequências por estação,
  waypoints (nome, TC, dist, fase, altitude, vento override, notas,
  coordenadas), salvar/carregar rotas, importar campo 15 do FPL ICAO,
  inserção automática de TOC/TOD.
- **Em Voo** — card grande do próximo WP (ETA planejada + atual + delta
  colorido), cronômetro de perna, GS corrigido por vento, combustível
  remanescente em tempo real, marcar/desmarcar cruzamento de WP (ATA),
  edição manual de ATA via keypad, lista da rota em modo perna ou sumário.
- **Combustível** — cálculo por fase (taxi 5 min, climb, cruise, descent,
  approach). Reservas IFR 45 min / VFR 30 min @ consumo de cruzeiro,
  contingência 5%, alternado ~12 gal. Margem visual (verde/vermelho).
- **Diário** — planejado vs real (distância, tempo, GS médio, combustível) +
  registro cronológico de passagens com delta.
- **Mapa** — Leaflet com rota, WPs coloridos (verde=origem, âmbar=fixos,
  ciano=TOC/TOD), toggle OSM/satélite, aeronave interpolada por
  dead-reckoning (atualiza 1×/s). Overlays de cartas PDF com calibração
  afim, drag-and-drop para reordenar overlays.
- **Preferências** — temas Noite/Dia/Vermelho (visão noturna), fonte S/M/L,
  threshold de alerta de desvio de ETA (2/5/10/15 min), Wake Lock,
  toggle de display de combustível.

## Biblioteca matemática (reusar antes de criar)

`lib/planning.js` e `lib/coords.js` exportam em CommonJS (Node) e UMD (browser).
Antes de adicionar lógica nova, verifique se uma destas já cobre o caso.

Funções principais (`lib/planning.js`):

- Grande-círculo: `gcDist`, `gcTC`, `gcInterpolate`, `projectDest`,
  `projectSource`, `gcIntersection`.
- Triângulo de vento: `calcLeg(tc, tas, wDir, wVel, variation) →
  {wca, th, mh, ch, gs, ete}`. Convenção: vento "de onde vem".
- Correção de TAS: `correctTAS(baseTAS, alt_ft, isaDevC)`
  `TAS ≈ base × (1 + 0.02 × alt/1000) × (1 + ISA × 0.002)`.
- Perfil de fase: `computeLegPhases` (modos `asap`, `at_fix`, `before_nm`,
  `before_min`) e `resolveAltitudeProfile` (multi-perna com WPs `inherit`,
  TOC/TOD únicos).
- Posição: `estimatedPosition(liveRoute, atas, now)` — dead-reckoning com
  suporte a hold e direct-to.
- Direct-to: `applyDirectTo` / `clearDirectTo`.
- Reserva: `bingoCheck`.
- Tempo: `parseHHMM`, `formatHHMM`, `formatHHMMSS`.

Coordenadas (`lib/coords.js`):

- `parseCoordsString` aceita decimal, DDM, DMS, e DDMm.mm compacto.
- `decDegToStr`, `formatCoord` para formatação.
- `ddmDigitsToDecDeg` para entrada via keypad numérico.

## Persistência

Storage com fallback em cascata: `window.storage` (se disponível) →
`localStorage` (prefixo `navlog_`).

Chaves: `navlog_flight` (voo atual), `navlog_routes` (rotas salvas),
`navlog_prefs` (preferências).

## Comandos

```sh
# Rodar local (qualquer servidor estático funciona)
python -m http.server 8000
# → http://localhost:8000/

# Rodar testes
node --test tests/*.test.js
node --test --test-reporter=spec tests/*.test.js   # verbose

# Utilitário histórico de patching (raramente necessário)
python patch_map.py
```

## Convenções

- **Matemática vai em `lib/`**, não embutida no JSX. Tudo o que sai de `lib/`
  precisa ser testável sem React.
- **Toda função nova de cálculo deve ter teste** em `tests/*.test.js`. Veja
  `tests/README.md` e use os helpers em `tests/helpers.js` (`makeAC`,
  `makeFlight`, `makeCP`, `nearly`, `phaseDistSum`, `totalDist`). Defaults
  são PA-28 com números redondos (ROC=500, ROD=500, vy=80, vDescent=90,
  tasCruise=110).
- **`index.html` é o artefato de deploy**; `navlog.jsx` é referência.
  Mudanças relevantes para produção precisam refletir no `index.html`
  (o `patch_map.py` é um exemplo histórico desse fluxo).
- **Service Worker tem cache versionado** (ex: `navlog-v7`). Bump da versão
  ao alterar assets locais ou URLs de CDN, senão clientes ficam presos em
  cache antigo.
- **UI em pt-BR.** Manter rótulos em português ao adicionar telas.
- **Sem npm.** Não introduzir bundlers ou `package.json` sem alinhamento
  prévio — preserva o fluxo "sobe os arquivos e funciona".
