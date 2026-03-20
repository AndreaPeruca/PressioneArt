# Pressione — Monitoraggio Pressione Arteriosa

PWA open-source per il monitoraggio domiciliare della pressione arteriosa, conforme al protocollo **ESC/ESH 2023 HBPM** (Home Blood Pressure Monitoring).

> **Zero backend · Zero account · Dati solo sul tuo dispositivo**
> Tutto gira nel browser: IndexedDB locale, nessun server, nessun cloud.

---

## Funzionalità

- **Protocollo ESC/ESH 2023** — 3 misurazioni per sessione (1 riscaldamento scartata + 2 ufficiali), attesa 60 s tra le letture, timer respirazione guidata
- **Classificazione HBPM corretta** — soglie domestiche (135/85 Grado 1), non le soglie ambulatoriali (140/90)
- **Grafici clinici** — trend sistolica/diastolica con linee di riferimento ESC/ESH, aggregazione giornaliera per periodi lunghi
- **Statistiche avanzate** — pressione differenziale, PAM, surge mattutino, distribuzione categorie, warning ESH < 3 giorni
- **Banner crisi ipertensiva** — avviso immediato se ≥ 180/120 mmHg con time-gate 4 ore
- **Import/Export CSV** — compatibile con Excel; deduplicazione automatica (±1 min); template scaricabile
- **Report PDF** — generato interamente client-side con react-pdf/renderer
- **Braccio di misurazione** — selezione e memorizzazione del braccio usato
- **Aritmia** — flag battito irregolare per sessione
- **Tag contestuali e sintomi** — stress, caffè, sport, mal di testa, vertigini, ecc.
- **Privacy-first** — PrivacyWidget con istruzioni per backup; nessun dato trasmesso

## Stack

| Layer | Tecnologia |
|---|---|
| UI | React 19 + TypeScript |
| Stile | Tailwind CSS v4 |
| Animazioni | Framer Motion |
| Database | Dexie (IndexedDB) |
| Grafici | Recharts |
| PDF | @react-pdf/renderer |
| State | Zustand |
| Build | Vite 8 |

## Avvio locale

```bash
npm install
npm run dev
```

## Build di produzione

```bash
npm run build
npm run preview
```

## Deploy

Il file `vercel.json` è già configurato con routing SPA, security headers (CSP, COOP, COEP, X-Frame-Options) e cache immutabile per gli asset.

Su Vercel: collega il repository, imposta la root directory su `/` (o la cartella del progetto), e Vercel rileverà automaticamente Vite.

## Disclaimer medico

Questa applicazione è uno strumento di supporto al monitoraggio domiciliare. **Non sostituisce la diagnosi medica.** In caso di valori elevati o sintomi, consultare sempre un medico.

Le soglie di classificazione sono basate su:
- Mancia et al., *2023 ESH Guidelines for the management of arterial hypertension*, Journal of Hypertension 2023
