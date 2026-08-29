# 🏀 Kampfgericht – Basketball Schulungs-App

Eine moderne, webbasierte Echtzeit-Schulungsplattform für Basketball-Kampfrichter (Zeitnehmer und 24-Sekunden-Bediener / Shotclock). Entwickelt für interaktive Schulungen, Lehrgänge und praktisches Training mit realistischen virtuellen Bedienpulten und Trainer-Live-Monitoring.

---

## 📋 Inhaltsverzeichnis

- [Überblick](#-überblick)
- [Hauptfunktionen](#-hauptfunktionen)
  - [1. Zeitnehmer-Pult (Stramatel 252MS Nachbildung)](#1-zeitnehmer-pult-stramatel-252ms-nachbildung)
  - [2. Shotclock-Pult (24s / 14s Touch-Bedienung)](#2-shotclock-pult-24s--14s-touch-bedienung)
  - [3. Trainer- / Admin-Dashboard](#3-trainer---admin-dashboard)
- [Technologie-Stack](#-technologie-stack)
- [Schnellstart & Installation](#-schnellstart--installation)
  - [Voraussetzungen](#voraussetzungen)
  - [Lokale Entwicklung](#lokale-entwicklung)
  - [Start mit Docker](#start-mit-docker)
- [Projektstruktur](#-projektstruktur)
- [Bedienung & Tastaturkürzel](#-bedienung--tastaturkürzel)
- [Release & Versionierung](#-release--versionierung)
- [Lizenz](#-lizenz)

---

## 🌟 Überblick

Bei Basketballspielen erfordert das Kampfgericht höchste Konzentration und präzise Absprache zwischen Zeitnehmer und 24-Sekunden-Bediener. **Kampfgericht** ermöglicht Ausbildern und Vereinen, Schulungssitzungen zu erstellen, denen Teilnehmer einfach über PIN-Code oder QR-Code beitreten können.

Alle Teilnehmer bedienen parallel ihr eigenes virtuelles Bedienpult. Der Schulungsleiter sieht in Echtzeit auf einem zentralen Dashboard alle Aktionen, Abweichungen vom Spielstand oder der Spielzeit sowie automatische Konsens-Auswertungen.

---

## ✨ Hauptfunktionen

### 1. Zeitnehmer-Pult (Stramatel 252MS Nachbildung)
- **Realistisches Konsolen-Layout**: Angelehnt an die gängige Stramatel 252MS Hallenanzeige.
- **Spieluhr-Steuerung**: Start/Stopp, Periodenwechsel (1–4 + OT), automatische Zehntelsekunden-Darstellung in der letzten Spielminute.
- **Punkte- & Foul-Verwaltung**: Heim / Gast Punktestände (+1, +2, +3, -1) und Mannschaftsfouls inkl. Bonus-/Penalty-Indikator.
- **Auszeiten (Timeouts)**: Auszeit-Tracker und Countdown-Signal.
- **Korrektur-Modus**: Halten oder Umschalten der Korrekturtaste zur präzisen Anpassung von Zeit und Punkten.
- **Integrierte Hupe**: Realistischer Schlusssignal-Buzzer über die Web Audio API.

### 2. Shotclock-Pult (24s / 14s Touch-Bedienung)
- **24s- & 14s-Rücksetzung**: Schnelltasten für vollständigen 24-Sekunden-Reset oder 14-Sekunden-Reset (nach offensivem Rebound gemäß FIBA-Regeln).
- **Start / Stopp**: Taktile Bedienung mit visueller Statusanzeige.
- **Display Blanking / Aus**: Abschalten der Anzeige (z. B. wenn die verbleibende Spielzeit kürzer als die Angriffszeit ist).
- **Auszeit-Modus**: Integrierter 60-Sekunden- bzw. 30-Sekunden-Auszeit-Timer mit Signalton.
- **Korrektur-Optionen**: Manuelle Feinjustierung der Angriffszeit im Zehntelsekundenbereich.

### 3. Trainer- / Admin-Dashboard
- **Sitzungsverwaltung**: Erstellung geschützter Sitzungen mit einprägsamen Basketball-PINs (z. B. `DUNK-42`) und 4-stelliger Admin-PIN.
- **Echtzeit-Teilnehmerübersicht**: Live-Monitoring aller verbundenen Geräte (Rolle, Status, Spielzeit, 24s-Zeit, Aktionen).
- **Fehler- & Abweichungserkennung**: Automatische Warnanzeigen bei Abweichungen außerhalb konfigurierbarer Toleranzen (Uhrzeit, Shotclock, Punkte, Fouls).
- **Master-Konfiguration**:
  - *Trainer als Master*: Ausbilder gibt die Referenzzeit vor.
  - *Konsens-Modus*: Automatischer Mehrheitsentscheid / Median aller Teilnehmer.
  - *Teilnehmer als Master*: Ein beliebiger Schüler fungiert als Vorbild für die Gruppe.
- **Rollensteuerung**: Zuweisen oder Wechseln der Rollen (Zeitnehmer / Shotclock) sowie Sperren/Freigeben des selbstständigen Rollenwechsels.
- **Direktsynchronisation & Master-Override**: Manuelles Korrigieren und sofortiges Synchronisieren aller Teilnehmerpulpe mit dem Master-Stand.
- **Aktivitätsprotokoll**: Lückenlose Historie aller Aktionen und Ereignisse.

---

## 🛠 Technologie-Stack

- **Frontend & Framework**: [Next.js](https://nextjs.org/) (App Router), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Echtzeit-Synchronisation**: [Socket.IO](https://socket.io/) auf einem dedizierten Node.js HTTP/WebSocket-Server (`server.ts`)
- **Audio-Engine**: Web Audio API (Synthese von Hupen und Signaltönen ohne externe Sounddateien)
- **Containerisierung**: [Docker](https://www.docker.com/) & Docker Compose (Multi-Stage Node Alpine Build)
- **CI/CD**: GitHub Actions (Automatisierte Tests, Typecheck & GHCR Image-Builds)

---

## 🚀 Schnellstart & Installation

### Voraussetzungen
- [Node.js](https://nodejs.org/) (Version 20+)
- [npm](https://www.npmjs.com/) (Version 10+)
- *Optional:* [Docker](https://www.docker.com/) & Docker Compose

### Lokale Entwicklung

1. **Repository klonen**:
   ```bash
   git clone https://github.com/<dein-user>/kampfgericht.git
   cd kampfgericht
   ```

2. **Abhängigkeiten installieren**:
   ```bash
   npm install
   ```

3. **Entwicklungsserver starten**:
   ```bash
   npm run dev
   ```

4. **Im Browser öffnen**:
   Öffne [http://localhost:3000](http://localhost:3000)

### Start mit Docker

#### 1. Vorgebautes Docker-Image aus GitHub Container Registry (GHCR) ausführen
```bash
# Aktuellstes Image aus GHCR herunterladen & im Hintergrund starten
docker compose pull
docker compose up -d

# Oder eine spezifische Version ausführen (z.B. v1.0.0 auf Port 8080)
TAG=1.0.0 PORT=8080 docker compose up -d
```

#### 2. Lokale Docker-Entwicklung
```bash
# Lokale Container-Entwicklung mit Live-Reload
npm run dev:docker
```

Die Anwendung ist anschließend unter [http://localhost:3000](http://localhost:3000) erreichbar.


---

## 📂 Projektstruktur

```
kampfgericht/
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Startseite / Lobby & Sitzungsbeitritt
│   │   ├── session/[pin]/admin/page.tsx # Trainer- / Admin-Dashboard
│   │   └── session/[pin]/console/page.tsx # Teilnehmer-Konsole
│   ├── components/
│   │   ├── StramatelConsole.tsx         # Zeitnehmer Bedienpult
│   │   ├── ShotclockConsole.tsx         # 24s/14s Shotclock Bedienpult
│   │   ├── CompactParticipantRow.tsx    # Teilnehmerzeile im Dashboard
│   │   ├── MasterDirectEditModal.tsx    # Master-Werte Bearbeitungsmodal
│   │   ├── RoleSwitchModal.tsx          # Dialog für Rollenwechsel
│   │   └── InstantTooltip.tsx           # UI Tooltip-Komponente
│   ├── lib/
│   │   ├── audio.ts                     # Web Audio API Soundmanager (Hupen)
│   │   ├── consensus.ts                 # Konsensberechnung (Median/Modus)
│   │   ├── deviation.ts                 # Abweichungs- und Toleranzprüfungen
│   │   └── socket.ts                    # Client-seitiger Socket.IO Singleton
│   └── types/
│       └── index.ts                     # Zentrale TypeScript Typdefinitionen
├── server.ts                            # Custom Node.js + Socket.IO Server
├── Dockerfile                           # Multi-Stage Produktions-Dockerfile
├── docker-compose.yml                   # Docker Compose Konfiguration
└── package.json                         # Scripts & Abhängigkeiten
```

---

## ⌨️ Bedienung & Tastaturkürzel

### Allgemeine Kürzel
- `F` : Vollbildmodus umschalten (Fullscreen)

### Zeitnehmer-Pult
- `Leertaste` : Spieluhr Start / Stopp
- `H` : Schlusssignal / Hupe ertönen lassen
- `K` : Korrekturmodus aktivieren / deaktivieren

### Shotclock-Pult
- `Leertaste` : 24s-Uhr Start / Stopp
- `1` / Taste `24` : Reset auf 24 Sekunden
- `2` / Taste `14` : Reset auf 14 Sekunden
- `D` : Display ein- / ausschalten (Blanking)

---

## 📦 Release & Versionierung

Neue Versionen werden über `npm` bereitgestellt. Die Release-Skripte führen automatisch vorab alle Prüfungen (`typecheck`, `build`) aus, erhöhen die Versionsnummer in `package.json`, erstellen einen standardkonformen Git-Commit & Git-Tag (`vX.Y.Z`) und pushen diesen zu GitHub (was den CI/CD-Workflow & Docker-Build auslöst).

```bash
# Patch-Release (z. B. 1.0.0 -> 1.0.1)
npm run release:patch

# Minor-Release (z. B. 1.0.0 -> 1.1.0)
npm run release:minor

# Major-Release (z. B. 1.0.0 -> 2.0.0)
npm run release:major
```

*Hinweis:* Vor dem Release muss der Git-Arbeitsbaum sauber (`clean`) sein. Sollte der Typecheck oder Build fehlschlagen, wird der Release-Vorgang automatisch abgebrochen, bevor ein Commit oder Tag erstellt wird.

---

## 📄 Lizenz

Dieses Projekt ist unter der [MIT-Lizenz](LICENSE) lizenziert.

