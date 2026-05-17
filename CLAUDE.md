# CLAUDE.md — Guia rápido para Claude Code

Este arquivo orienta sessões do Claude Code trabalhando neste repositório.
Mantenha-o conciso. Para instruções de deploy, consulte o `README.md`.

## Visão geral

**Navlog** é um PWA de navegação aérea para pilotos de aviação geral, em
português (pt-BR). Permite planejar rotas (waypoints, fases climb/cruise/descent,
vento, combustível), acompanhar o voo em tempo real (ETA, ATA, GS, fuel) e
revisar o resultado em um diário.

- **Sem build step.** Arquivos estáticos servidos diretamente; JSX é
  compilado em runtime pela esm.sh.
- **React via esm.sh + importmap** (multi-file ES modules).
- **Offline-first** via Service Worker; estado em `localStorage`.
- Otimizado para Samsung Galaxy S24+, funciona em qualquer mobile moderno e
  desktop.

## Stack

- React 18.3.1 — entregue pelo `esm.sh` (via importmap em `index.html`)
- `esm.sh/gh/lopespt/navlog@main/app/*.jsx?deps=react@18.3.1,react-dom@18.3.1&v=...`
  compila JSX no edge e serve como ES module. A query string `&v=APP_VERSION`
  funciona como cache-buster.
- Tailwind CSS (CDN), ícones Lucide (via `esm.sh/lucide-react`)
- Leaflet 1.9.4 (aba Mapa), PDF.js (overlays de cartas)
- NOAA World Magnetic Model (declinação magnética)
- Node 18+ `node:test` para a suíte de testes (zero dependências npm)

Não há `package.json` — tudo vem por CDN.

## Layout de arquivos

```
index.html                       shell + importmap + boot diagnostic
app/main.jsx                     entry React (required-globals guard,
                                 monta NavlogApp no #root)
app/components/
  map-tab.jsx                    aba Mapa (Leaflet, overlays, sim aircraft)
  setup-tab.jsx                  aba Setup (bundle: AiracBadge, FreqsSection,
                                 ProceduresPanel, Stat)
  waypoint-editor.jsx            modal de edição (bundle: PointFinder,
                                 PointFinderMapTab, MapPicker, StepOverride)
  pdf-georeferencer.jsx          wizard de calibração de carta PDF
  pdf-layers-panel.jsx           painel de camadas PDF
  ui-primitives.jsx              Section, Loading, Empty, ErrorState
lib/
  planning.js                    matemática pura (gcDist, calcLeg, getDecl,
                                 nowHHMM, parseHHMM, …) — testável em Node
  coords.js                      parsing/formatação de coordenadas
  airac.js                       cliente AIRAC.NET
  storage.js                     IndexedDB (overlays, user points)
  pdf.js                         render PDF + warp afim
  feedback.js                    haptic + audio (warmUpAudio, playAlarm)
manifest.json                    manifesto PWA
sw.js                            service worker (cache versionado +
                                 network-first p/ nosso código)
tests/                           suíte node:test (127 testes)
icon-192.png, icon-512.png
README.md                        guia em português
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

## Biblioteca de helpers (reusar antes de criar)

Todos os módulos `lib/*.js` exportam em CommonJS (Node) e UMD (browser via
`Object.assign(window, …)`). Antes de adicionar lógica nova, verifique se uma
destas já cobre o caso. Os componentes em `app/` consomem os exports como
bare identifiers — quando esses identifiers somem do window, o app
black-screena (veja "Required-globals guard" abaixo).

Principais funções (`lib/planning.js`):

- Grande-círculo: `gcDist`, `gcTC`, `gcInterpolate`, `projectDest`,
  `projectSource`, `gcIntersection`.
- Triângulo de vento: `calcLeg(tc, tas, wDir, wVel, variation) →
  {wca, th, mh, ch, gs, ete}`. Convenção: vento "de onde vem".
- Correção de TAS: `correctTAS(baseTAS, alt_ft, isaDevC)`
  `TAS ≈ base × (1 + 0.02 × alt/1000) × (1 + ISA × 0.002)`.
- Perfil de fase: `computeLegPhases`, `resolveAltitudeProfile`.
- Posição: `estimatedPosition(liveRoute, atas, now)` — dead-reckoning.
- Direct-to: `applyDirectTo` / `clearDirectTo`.
- Reserva: `bingoCheck`.
- Tempo: `parseHHMM`, `formatHHMM`, `formatHHMMSS`, `nowHHMM`.
- Declinação: `getDecl(lat, lon, altFt)` — wrapper cacheado sobre
  `window._geomagnetism` (NOAA WMM).
- Afim (calibração de overlay): `affineFrom3Points`, `invertAffine`,
  `applyAffinePt`.

Coordenadas (`lib/coords.js`):

- `parseCoordsString` aceita decimal, DDM, DMS, e DDMm.mm compacto.
- `decDegToStr`, `formatCoord` para formatação.
- `ddmDigitsToDecDeg` para entrada via keypad numérico.

Outros: `airac.js` (AIRAC.NET client), `storage.js` (IndexedDB),
`pdf.js` (render PDF + warp afim), `feedback.js` (haptic + audio).

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
```

## Convenções

- **Matemática vai em `lib/`**, não embutida no JSX. Tudo o que sai de `lib/`
  precisa ser testável sem React.
- **Toda função nova de cálculo deve ter teste** em `tests/*.test.js`. Veja
  `tests/README.md` e use os helpers em `tests/helpers.js`. Defaults
  são PA-28 com números redondos (ROC=500, ROD=500, vy=80, vDescent=90,
  tasCruise=110).
- **`app/main.jsx` é o entry React** — código JSX produtivo mora aqui ou
  em `app/components/*.jsx`. `index.html` é só shell + importmap.
- **UI em pt-BR.** Manter rótulos em português ao adicionar telas.
- **Sem npm.** Não introduzir bundlers ou `package.json` sem alinhamento
  prévio — preserva o fluxo "sobe os arquivos e funciona".

## Como deployar uma mudança em código (regra das 3 versões)

Toda alteração em `app/main.jsx` ou `app/components/*.jsx` exige bumpar
**três versões em sincronia**, na mesma frase do commit:

1. `APP_VERSION` em `app/main.jsx` (formato `YYYYMMDD.HHMM` UTC, ex:
   `20260517.1430`). Aparece no rodapé do app e é a fonte de verdade do
   que está realmente rodando.
2. `&v=YYYYMMDD.HHMM` na URL `esm.sh` dentro de `index.html` — mesmo valor.
   esm.sh trata cada query string única como cache key separado; bumpar
   força esm.sh a recompilar o JSX da raw.gh em vez de servir versão
   antiga.
3. `CACHE_NAME` em `sw.js` (ex: `navlog-v27`). Incrementar inteiro. Quando
   houver mudanças em arquivos precacheados (lib, app), também atualizar
   a entrada correspondente em `STATIC[]`.

Mudanças que tocam apenas `lib/*.js` ou docs (`CLAUDE.md`, `README.md`)
não exigem os bumps — `lib/*` é fetched network-first pelo SW e a
required-globals guard auto-recupera caso o usuário pegue uma versão
defasada.

## Extrair um componente de `app/main.jsx`

A migração para `esm.sh` em maio/2026 (commits `fc1256b` → `1e92f7d`)
documentou um fluxo repetível para extrair componentes JSX. Antes de
extrair, faça o audit:

```sh
# Liste TODO identifier referenciado pelo componente que pode quebrar
# em escopo de módulo separado. Cobrir 3 padrões:
grep -oE '<[A-Z][a-zA-Z0-9]+'       arquivo-extraido.jsx | sort -u  # JSX
grep -oE '\b[a-z][a-zA-Z0-9]*\('    arquivo-extraido.jsx | sort -u  # calls
grep -oE 'React\.[a-zA-Z]+'         arquivo-extraido.jsx | sort -u  # React.X
```

Para cada identifier, confirme que:

- (a) Está nos imports do novo arquivo (`react`, `lucide-react`, ou
  outro `./*.jsx` sibling), OU
- (b) Está definido localmente dentro do mesmo arquivo, OU
- (c) Está em algum `lib/*.js` e exposto via `Object.assign(window, …)`
  — ESSE é o passo que costuma ser esquecido.

Helpers que só vivem em `app/main.jsx` (module scope) NÃO são visíveis
em outros módulos. Se um componente extraído usa um deles, mover o
helper para `lib/planning.js` (matemática) ou `lib/feedback.js` (UI
helpers) e adicioná-lo ao objeto `__NAVLOG_*__` para ir ao window.

## Defesas contra cache stale

A combinação esm.sh + Service Worker + GitHub Pages tem 3 camadas de
cache (browser HTTP, SW próprio, esm.sh edge), e cada uma já causou
um black screen nesta sessão. As três defesas atuais:

1. **SW network-first** para `/navlog/lib/*` e `/navlog/app/*`
   (cache-first só para CDN como esm.sh, unpkg, cdnjs — esses são
   imutáveis por versão na URL).
2. **Cache-buster `&v=APP_VERSION`** na URL esm.sh em `index.html`,
   bumpado a cada deploy.
3. **Required-globals guard** no topo de `app/main.jsx` — verifica que
   todos os helpers de `lib/*` estão em `window` antes do React montar.
   Se faltar alguma, faz `location.reload()` automático uma vez
   (com flag em `sessionStorage`). Recuperação silenciosa de caches
   defasados após deploy.

Ao mover um helper de `app/main.jsx` para `lib/*`, **acrescente o nome
ao array `required` dentro da guard** — assim a guard pega o desnível
e auto-recupera no próximo refresh.

## Diagnóstico no mobile

O banner vermelho fixo no topo do app aparece automaticamente quando:

- `window.error` dispara
- `unhandledrejection` dispara
- React unwind de erro em render
- 20 s sem nada renderizar em `#root`

Útil porque DevTools no celular é inviável. Texto do banner mostra
`message + file:line` direto na tela. Não desliga após mount (commit
`07f9c9f`), então erros pós-mount (clicar numa aba, abrir modal) também
aparecem. Em sessões futuras: peça pro usuário copiar o texto do banner
em vez de adivinhar.
