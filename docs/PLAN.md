# Plan: Coding Agent (NestJS)

## Ziel

Ein Coding Agent, der sich wie **Claude Code im Web** anfühlt: Sitzungen, Live-Schritte, Freigaben, später Diff-Ansicht.
Das Backend ist NestJS, Modellanbieter ist die **Gemini-API im Free Tier**. Das Projekt läuft zunächst nur lokal.

## Entscheidungen

- **Produkt:** Tool-Schleife (Modell ruft Tools auf, bis das Ziel erreicht ist), kein reiner Chat. Interaktiv: der Nutzer sieht
  jeden Schritt und gibt schreibende Aktionen frei. Kein asynchroner Cloud-Agent im Stil von Codex Cloud oder Devin.
- **Form:** Web-App. NestJS-Backend zuerst, React-Frontend zunächst nur als einfacher Chat.
- **Betrieb:** Der Server läuft lokal und arbeitet im Arbeitsverzeichnis des Nutzers. Ein öffentlicher Deploy ist ein eigener
  Schritt und braucht vorher Rückfrage (Kosten, Sicherheit).
- **Sandbox:** Kein Muss im MVP. Docker oder eine andere Isolierung ist ein späteres Extra.
- **Queue:** Entfällt im MVP. Eine Sitzung ist ein gestreamter Dauerlauf.
- **Streaming:** SSE für den Fortschritt, POST für Nachrichten, Freigaben und Abbruch. Wiederverbinden über `Last-Event-ID`.
- **Validierung:** Zod. Die Tool-Schemas gehen als JSON-Schema an das Modell, so gibt es eine Quelle für Validierung und
  Deklaration.

## Architektur

- **Agent-Schleife:** Modell aufrufen, Tool-Aufrufe ausführen, Ergebnisse zurückgeben, wiederholen bis zum Ende. Die Schleife ist
  ein Zustandsautomat, der Ereignisse ausgibt. Zustände: läuft, wartet auf Freigabe, fertig, abgebrochen, Fehler.
- **Abbruch und Obergrenzen:** Stopp jederzeit (AbortController bis zum Modellaufruf und zur Prozessgruppe des Befehls). Maximale
  Schritte pro Lauf stehen in der Config.
- **Tools** (je ein NestJS-Provider mit Zod-Schema): `read_file`, `list_files`, `search`, `edit_file`, `write_file`,
  `run_command`.
- **Berechtigungen:** Kern des Systems. Ein Policy-Service entscheidet pro Tool-Aufruf und Modus: erlauben, fragen oder ablehnen.
  Er läuft in der Schleife, nicht als HTTP-Guard. Siehe Matrix unten.
- **Sitzungen:** Speicher hinter einer Schnittstelle, zuerst im Arbeitsspeicher, später dauerhaft. Der Verlauf reicht
  anbieterspezifische Teile unverändert durch.
- **ModelProvider:** Schnittstelle vor dem Gemini-Adapter, damit ein Wechsel (bezahltes Tier, anderer Anbieter) möglich bleibt.
  Ein Fake-Provider spielt aufgezeichnete Antworten ab.
- **Rate-Limiter:** jeder Modellaufruf läuft hindurch. Er zählt Anfragen und Tokens pro Minute und pro Tag. Tokens schätzt er vor
  dem Aufruf und korrigiert sie danach anhand der Usage-Metadaten; maßgeblich bleibt der 429. Der Tageszähler liegt in einer
  Datei und überlebt einen Neustart. Das Restbudget ist in der UI sichtbar.
- **Später:** Memory-Datei im Projekt (wie `CLAUDE.md`), Plan-Modus, Subagenten, Hooks, Diff-Ansicht, Datei-Baum, Auth, lange
  Verläufe verdichten.

### Berechtigungs-Matrix

| Tool                                | immer fragen | Änderungen automatisch erlauben | nur planen |
| ----------------------------------- | ------------ | ------------------------------- | ---------- |
| `read_file`, `list_files`, `search` | erlauben     | erlauben                        | erlauben   |
| `edit_file`, `write_file`           | fragen       | erlauben                        | ablehnen   |
| `run_command`                       | fragen       | fragen                          | ablehnen   |

## Sicherheit

Der Server führt Shell-Befehle aus und ist ohne Schutz von jeder Webseite im Browser erreichbar (CSRF, DNS-Rebinding).

- **Server:** Bindung an `127.0.0.1`, Prüfung von `Origin` und `Host`, zufälliges Token beim Start, das jede Anfrage mitschickt.
- **Dateizugriff:** nur innerhalb des Arbeitsverzeichnisses (Realpath prüfen, Symlinks auflösen). Eine Sperrliste (`.env*`,
  Schlüsseldateien, `.git/`) gilt für alle Datei-Tools.
- **Befehle:** bereinigte Umgebung ohne den Gemini-Key und andere Secrets des Servers, Timeout, Ausgabelimit.
- **Grenze ohne Sandbox:** Ein freigegebener Befehl kann trotzdem alles lesen, was der Nutzer lesen darf (`cat .env`). Davor
  schützt nur die Freigabe.

## Gemini Free Tier

- **SDK:** `@google/genai` (das alte `@google/generative-ai` ist seit 30.11.2025 veraltet). Version mit `npm view @google/genai version`
  prüfen.
- **Modell und Limits stehen in der Config, nie im Code.** Modellname, Anfragen/Minute, Tokens/Minute und Anfragen/Tag trägt der
  Nutzer aus dem Google-AI-Studio-Dashboard ein (Rate-Limit-Seite, Login nötig). Die Werte gelten pro Modell und ändern sich.
- **Fehler bei Limit:** HTTP 429 `RESOURCE_EXHAUSTED`. Minutenlimit: Backoff mit Jitter und erneut versuchen. Tageslimit: nicht
  wiederholen, in der UI klar melden. Der Tageszähler wird um Mitternacht Pazifischer Zeit zurückgesetzt. Einen `Retry-After`-Header
  gibt es laut Doku nicht. 503 und 5xx: mit Backoff wiederholen; 400 und 403 nicht.
- **Verbrauch:** Jeder Tool-Schritt ist ein Aufruf. Kontext klein halten, Ausgaben von Tools kürzen.
- **Datenschutz:** Im Free Tier nutzt Google Eingaben und Antworten zur Produktverbesserung, und Menschen können sie lesen. Der Agent
  schickt Quelltext an das Modell. Deshalb: eigener Key aus einem eigenen Google-Projekt ohne Billing, nur Code, den der Nutzer
  ohnehin öffentlich machen würde, nie `.env`-Dateien oder Secrets in den Kontext (siehe Sicherheit). Der Key des Projekts
  `notebooklm-klon` wird hier nicht verwendet.

## MVP

Ein Nutzer, ein lokaler Ordner, sechs Tools, Berechtigungs-Modi, Chat mit Live-Schritten, Freigabe-Buttons und Stopp-Button.
Sitzungen liegen im Arbeitsspeicher.

**Out of scope:** mehrere Nutzer, Git-Push, Subagenten, IDE-Integration, Diff-Ansicht, Datei-Baum, Queue, Sandbox, Deploy,
Verläufe verdichten.

## Offene Entscheidungen

- Modell und Limits (aus dem Dashboard, siehe oben).
- Datenmodell, Modulzuschnitt, Befehle für Build/Test/Lint (entstehen mit dem Grundgerüst).

## Reihenfolge der Slices

1. **Spike:** kleines Skript, das zwei Tool-Aufrufe hintereinander gegen das gewählte Modell macht (Function Calling und Streaming).
   Die Doku nennt keine Liste der Modelle, die das können; das wird hier geprüft, bevor die Schleife gebaut wird. Außerdem klären:
   - Muss der Verlauf Thought-Signatures des Modells zurückgeben, damit Function Calling funktioniert?
   - Unterscheidet der Body des 429 Minuten- und Tageslimit, und nennt er eine Wartezeit?
   - Liefert das Modell mehrere Tool-Aufrufe in einer Antwort?
   - Die Antworten als Fixtures für Slice 3 speichern.
2. NestJS-Gerüst, Config, Linting und Tests. Server-Schutz (Bindung, `Origin`/`Host`, Token).
3. Agent-Schleife mit `ModelProvider`-Schnittstelle, Fake-Provider aus den Fixtures und einem Tool. Zustände, Abbruch,
   Schrittlimit, Sitzungen im Arbeitsspeicher. Tests ohne echte API-Aufrufe.
4. Gemini-Adapter und Rate-Limiter.
5. Übrige Tools, Policy-Service und Modi, Schutz für Dateizugriff und Befehle.
6. SSE-Streaming und einfacher Chat im Frontend.
7. Nach dem MVP: Sitzungen dauerhaft speichern, Kontext verdichten.
