# Navlog — PWA de Navegação Aérea

App de navlog para pilotos de aviação geral. Desenvolvido para Samsung Galaxy S24+
mas funciona em qualquer dispositivo mobile moderno.

## Arquivos

```
navlog-app-v4.jsx   ← código fonte completo do app React
index.html          ← shell HTML para deploy PWA
manifest.json       ← manifesto PWA (ícone, nome, cores)
sw.js               ← service worker (cache offline-first)
```

## Deploy no GitHub Pages (gratuito, 5 min)

### 1. Criar repositório
1. Crie um repo no GitHub (ex: `navlog`)
2. Faça upload dos 4 arquivos acima
3. Renomeie `navlog-app-v4.jsx` para `navlog.jsx`

### 2. Ativar GitHub Pages
1. Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `main`, pasta `/root`
4. Clique em Save

O site fica disponível em `https://seu-usuario.github.io/navlog/`

### 3. Instalar no S24+ como app
1. Abra o link no Chrome
2. Menu (⋮) → "Adicionar à tela inicial"
3. O app aparece com ícone, abre em tela cheia e funciona offline

## Deploy no Vercel (alternativa, ainda mais simples)

1. Instale Vercel CLI: `npm i -g vercel`
2. Na pasta com os 4 arquivos: `vercel`
3. Siga o wizard — em 2 minutos está online

## Estrutura do app

### Abas
- **Setup** — aeronave, identificação, ambiente, frequências, waypoints
- **Em Voo** — card do próximo waypoint, cronômetro de perna, combustível, lista da rota
- **Combustível** — cálculo detalhado por fase com reservas IFR/VFR
- **Diário** — planejado vs real, lista de passagens

### Funcionalidades principais
- 5 aeronaves: Baron 58, Dakota PA-28, Duke B60 pistão, Duke Turbina, Comanche PA-24
- TAS corrigida por altitude e desvio ISA
- Vento por perna (padrão da rota / sem vento / próprio)
- Cálculo automático de TOC e TOD
- ETA planejada + ETA atualizada pelo GS real
- Alerta visual quando desvio de ETA supera threshold configurável
- Cronômetro desde o último waypoint cruzado
- Combustível restante estimado em tempo real
- Notas por waypoint (frequências, QNH, instruções ATC)
- Importar rota do campo 15 do FPL ICAO
- Salvar e carregar rotas
- Temas: Noite / Dia / Vermelho (visão noturna)
- Wake Lock (tela sempre ligada)
- Persistência em localStorage (sobrevive a recarregamento)

## Notas técnicas

- **TAS corrigida**: TAS ≈ CAS × (1 + 0.02 × alt_ft/1000) × (1 + ISA_dev × 0.002)
- **WCA**: arcsin(Vw × sin(Wdir - TC) / TAS) — convenção "de onde vem"
- **GS**: TAS × cos(WCA) - Vw × cos(Wdir - TC)
- **Reserva IFR**: 45 min @ consumo de cruzeiro
- **Reserva VFR**: 30 min @ consumo de cruzeiro
- **Combustível em voo**: descontado pelo GPH da fase × tempo real entre ATAs
