# Navlog — PWA de Navegação Aérea

App de navlog para pilotos de aviação geral, em pt-BR. Otimizado para Samsung
Galaxy S24+; funciona em qualquer mobile moderno e desktop.

Sem build step — arquivos estáticos, React via CDN, Babel standalone faz o
transform do JSX no browser. Offline-first via Service Worker; estado em
`localStorage` / IndexedDB.

> Para guia de desenvolvimento (estrutura do código, convenções, comandos),
> ver [`CLAUDE.md`](./CLAUDE.md).

## Arquivos

```
index.html         shell HTML + bloco React/Babel (artefato de deploy)
lib/planning.js    matemática pura de planejamento (testável em Node)
lib/coords.js      parsing/formatação de coordenadas
manifest.json      manifesto PWA
sw.js              service worker (cache versionado)
tests/             suíte node:test (zero dependências npm)
icon-192.png, icon-512.png
```

## Funcionalidades

- 5 aeronaves: Baron 58, Dakota PA-28, Duke B60 pistão, Duke Turbina, Comanche PA-24
- Planejamento: waypoints com fases SUBIDA/CRUZEIRO/DESCIDA, TAS corrigida por
  altitude e ISA, vento por perna, TOC/TOD automáticos, importação do campo 15
  do FPL ICAO, frequências por estação
- Em voo: ETA planejada × atual, GS corrigido por vento, combustível
  remanescente em tempo real, cronômetro de perna, ATA manual via keypad,
  alerta visual de desvio de ETA
- Combustível: cálculo por fase, reservas IFR/VFR, contingência, alternado
- Diário: planejado × real, registro cronológico de passagens
- Mapa: Leaflet com OSM/satélite, rota colorida por fase, aeronave interpolada
  por dead-reckoning, overlays de cartas PDF com calibração afim
- Preferências: temas Noite/Dia/Vermelho, Wake Lock, threshold de alerta

## Deploy

### GitHub Pages

1. Criar repo no GitHub e fazer upload do conteúdo desta pasta
2. Settings → Pages → Source "Deploy from a branch" → branch `main`, pasta `/root` → Save
3. Disponível em `https://<usuario>.github.io/<repo>/`

### Vercel

```sh
npm i -g vercel
cd navlog
vercel
```

### Instalar como app no celular

Chrome (mobile) → abrir o link → Menu (⋮) → "Adicionar à tela inicial".
Ícone fica na home, abre em fullscreen, funciona offline.

## Desenvolvimento local

```sh
# Servir os estáticos (qualquer servidor serve)
python -m http.server 8000
# → http://localhost:8000/

# Rodar os testes
node --test tests/*.test.js
```

Detalhes de arquitetura, biblioteca matemática, convenções de código e
versionamento do Service Worker em [`CLAUDE.md`](./CLAUDE.md).
