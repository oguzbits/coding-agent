# Plan: Coding Agent (NestJS)

## Ziel

Ein Coding Agent, der sich wie **Claude Code im Web** anfühlt: Konten, Projekte, Sitzungen, Live-Schritte, Freigaben, später
Diff-Ansicht. Das Backend ist NestJS, Modellanbieter ist die **Gemini-API im Free Tier**. Die Anwendung ist eine vollständige
Mehrnutzer-Web-App, läuft zunächst lokal und ist so gebaut, dass sie später gehostet werden kann.

## Entscheidungen

- **Produkt:** Tool-Schleife (Modell ruft Tools auf, bis das Ziel erreicht ist), kein reiner Chat. Interaktiv: der Nutzer sieht
  jeden Schritt und gibt schreibende Aktionen frei. Kein asynchroner Cloud-Agent im Stil von Codex Cloud oder Devin.
- **Form:** Web-App mit NestJS-Backend und React-Frontend. Das Frontend hat Seiten für Konto und Projekte und einen Chat.
- **Nutzer:** Registrierung und Anmeldung mit E-Mail und Passwort. Sitzungen, Projekte und Einstellungen gehören einem Nutzer.
- **Betrieb:** Der Server läuft zunächst lokal. Ein öffentlicher Deploy ist ein eigener Schritt, setzt die Sandbox voraus und
  braucht vorher Rückfrage (Kosten, Sicherheit).
- **Sandbox:** Kein Teil des MVP, aber Voraussetzung für offene Registrierung und Deploy. Bis dahin ist die Anwendung nur für
  Nutzer gedacht, denen der Betreiber vertraut (siehe Sicherheit).
- **API-Key:** Jeder Nutzer hinterlegt seinen eigenen Gemini-Key. Es gibt keinen gemeinsamen Server-Key.
- **Datenbank:** SQLite über Prisma; beim Deploy Wechsel auf Postgres.
- **Queue:** Entfällt im MVP. Eine Sitzung ist ein gestreamter Dauerlauf.
- **Streaming:** SSE für den Fortschritt, POST für Nachrichten, Freigaben und Abbruch. Wiederverbinden über `Last-Event-ID`.
- **Validierung:** Zod. Die Tool-Schemas gehen als JSON-Schema an das Modell, so gibt es eine Quelle für Validierung und
  Deklaration.

## Architektur

- **Agent-Schleife:** Modell aufrufen, Tool-Aufrufe ausführen, Ergebnisse zurückgeben, wiederholen bis zum Ende. Die Schleife ist
  ein Zustandsautomat, der Ereignisse ausgibt. Zustände: läuft, wartet auf Freigabe, fertig, abgebrochen, Fehler.
- **Abbruch und Obergrenzen:** Stopp jederzeit (AbortController bis zum Modellaufruf und zur Prozessgruppe des Befehls). Maximale
  Schritte pro Lauf stehen in der Config. Pro Nutzer läuft höchstens ein Lauf gleichzeitig.
- **Fehler in der Schleife:** Ungültige Tool-Argumente und fehlgeschlagene Tools gehen als Tool-Ergebnis an das Modell zurück.
  Wiederholt das Modell denselben fehlschlagenden Aufruf mehrfach, bricht der Lauf mit einer klaren Meldung ab.
- **System-Prompt:** eigene, versionierte Datei. Er beschreibt den Umgang mit den Tools und hält das Modell zu wenigen,
  gezielten Aufrufen an.
- **Tools** (je ein NestJS-Provider mit Zod-Schema): `read_file`, `list_files`, `search`, `edit_file`, `write_file`,
  `run_command`. `edit_file` ersetzt ein exaktes, in der Datei eindeutiges Textstück und nur in Dateien, die in der Sitzung
  bereits gelesen wurden.
- **Berechtigungen:** Kern des Systems. Ein Policy-Service entscheidet pro Tool-Aufruf und Modus: erlauben, fragen oder ablehnen.
  Er läuft in der Schleife, nicht als HTTP-Guard. Siehe Matrix unten. Die Freigabe zeigt, was passieren wird: bei Dateien einen
  Text-Diff, bei Befehlen die Befehlszeile.
- **Protokoll:** Jeder Modellaufruf wird mit Tokens, Dauer und Fehler mitgeschrieben, ohne Inhalte und ohne Key.
- **Projekte:** Ein Projekt ist ein Ordner unter `<Workspace-Wurzel>/<Nutzer>/<Projekt>`. Der Nutzer legt es leer an oder klont
  ein öffentliches Git-Repo. Der Agent arbeitet immer in genau einem Projekt.
- **Sitzungen:** gehören zu einem Nutzer und einem Projekt und liegen in der Datenbank. Der Verlauf reicht anbieterspezifische
  Teile unverändert durch.
- **ModelProvider:** Schnittstelle vor dem Gemini-Adapter, damit ein Wechsel (bezahltes Tier, anderer Anbieter) möglich bleibt.
  Ein Fake-Provider spielt aufgezeichnete Antworten ab.
- **Rate-Limiter:** jeder Modellaufruf läuft hindurch. Er zählt pro Nutzer Anfragen und Tokens pro Minute und pro Tag. Tokens
  schätzt er vor dem Aufruf und korrigiert sie danach anhand der Usage-Metadaten; maßgeblich bleibt der 429. Der Tageszähler
  liegt in der Datenbank und überlebt einen Neustart. Das Restbudget ist in der UI sichtbar.
- **Später:** Sandbox, Deploy, GitHub-Login, Zwei-Faktor, Memory-Datei im Projekt (wie `CLAUDE.md`), Plan-Modus, Subagenten,
  Hooks, Diff-Ansicht, Datei-Baum, lange Verläufe verdichten.

### Berechtigungs-Matrix

| Tool                                | immer fragen | Änderungen automatisch erlauben | nur planen |
| ----------------------------------- | ------------ | ------------------------------- | ---------- |
| `read_file`, `list_files`, `search` | erlauben     | erlauben                        | erlauben   |
| `edit_file`, `write_file`           | fragen       | erlauben                        | ablehnen   |
| `run_command`                       | fragen       | fragen                          | ablehnen   |

## Konten und Anmeldung

- **Funktionen:** registrieren, E-Mail bestätigen, anmelden, abmelden, Passwort ändern, Passwort zurücksetzen, aktive Anmeldungen
  einsehen und beenden, Konto samt Projekten und Sitzungen löschen.
- **Anmeldung:** serverseitige Sitzung in der Datenbank, Cookie mit `HttpOnly` und `SameSite=Strict` (beim Deploy zusätzlich
  `Secure`). Kein Token im `localStorage`. Das Cookie gilt auch für den SSE-Kanal.
- **Passwörter:** Argon2id. Mindestlänge statt Zeichenregeln.
- **Schutz:** Begrenzung der Versuche bei Anmeldung, Registrierung und Zurücksetzen. Antworten verraten nicht, ob eine E-Mail
  registriert ist. Tokens für Bestätigung und Zurücksetzen sind einmalig, laufen ab und liegen nur als Hash in der Datenbank.
- **Mail:** hinter einer Schnittstelle. Lokal landet die Mail im Log oder in einem Mail-Catcher; ein echter Versand kommt mit
  dem Deploy.
- **Registrierung:** per Config offen oder geschlossen. Standard ist geschlossen, solange es keine Sandbox gibt; das erste Konto
  lässt sich immer anlegen.
- **Profil:** Gemini-Key, Modellname und Limits. Der Key liegt verschlüsselt in der Datenbank (AES-256-GCM, Hauptschlüssel aus
  der Umgebung), wird nie geloggt und nie an das Frontend zurückgegeben (nur die letzten vier Zeichen).
- **Autorisierung:** Jede Abfrage von Projekten, Sitzungen und Einstellungen ist auf den angemeldeten Nutzer eingeschränkt.

## Sicherheit

Der Server führt Shell-Befehle aus. Ohne Sandbox laufen sie mit den Rechten des Server-Prozesses.

- **Server:** lokal Bindung an `127.0.0.1`, Prüfung von `Origin` und `Host` (gegen CSRF und DNS-Rebinding), alle Routen außer
  Registrierung und Anmeldung verlangen eine Anmeldung.
- **Dateizugriff:** nur innerhalb des Projektordners (Realpath prüfen, Symlinks auflösen). Eine Sperrliste (`.env*`,
  Schlüsseldateien, `.git/`) gilt für alle Datei-Tools.
- **Befehle:** bereinigte Umgebung ohne Secrets des Servers (Hauptschlüssel, Datenbank-Zugang), Timeout, Ausgabelimit.
- **Grenze ohne Sandbox:** Ein freigegebener Befehl kann alles lesen und ändern, was der Server-Prozess darf, auch die Projekte
  anderer Nutzer und die Datenbank. Getrennte Ordner sind keine Isolierung. Deshalb bleibt die Registrierung geschlossen, bis
  die Sandbox steht.

## Gemini Free Tier

- **SDK:** `@google/genai` (das alte `@google/generative-ai` ist seit 30.11.2025 veraltet). Version mit `npm view @google/genai version`
  prüfen.
- **Modell und Limits stehen im Profil des Nutzers, nie im Code.** Modellname, Anfragen/Minute, Tokens/Minute und Anfragen/Tag
  trägt der Nutzer aus dem Google-AI-Studio-Dashboard ein (Rate-Limit-Seite, Login nötig). Die Werte gelten pro Modell und ändern
  sich. Vorgabewerte kommen aus der Config.
- **Fehler bei Limit:** HTTP 429 `RESOURCE_EXHAUSTED`. Minutenlimit: Backoff mit Jitter und erneut versuchen. Tageslimit: nicht
  wiederholen, in der UI klar melden. Der Tageszähler wird um Mitternacht Pazifischer Zeit zurückgesetzt. Einen `Retry-After`-Header
  gibt es laut Doku nicht. 503 und 5xx: mit Backoff wiederholen; 400 und 403 nicht.
- **Verbrauch:** Jeder Tool-Schritt ist ein Aufruf. Kontext klein halten, Ausgaben von Tools kürzen.
- **Datenschutz:** Im Free Tier nutzt Google Eingaben und Antworten zur Produktverbesserung, und Menschen können sie lesen. Der Agent
  schickt Quelltext an das Modell. Die UI weist beim Hinterlegen des Keys darauf hin: eigener Key aus einem eigenen Google-Projekt
  ohne Billing, nur Code, den der Nutzer ohnehin öffentlich machen würde, nie `.env`-Dateien oder Secrets in den Kontext (siehe
  Sicherheit). Beim Entwickeln wird der Key des Projekts `notebooklm-klon` nicht verwendet.

## MVP

Konten mit E-Mail und Passwort, Profil mit eigenem Gemini-Key, Projekte, sechs Tools, Berechtigungs-Modi, gespeicherte Sitzungen,
Chat mit Live-Schritten, Freigabe mit Diff-Vorschau und Stopp-Button. Lokal betrieben, Registrierung geschlossen.

**Out of scope:** Sandbox, Deploy, offene Registrierung, GitHub-Login, Zwei-Faktor, Rollen und Teams, Git-Push, Subagenten,
IDE-Integration, Diff-Ansicht, Datei-Baum, Queue, Verläufe verdichten.

## Offene Entscheidungen

- Bestehende lokale Ordner als Projekt einbinden: gar nicht oder nur für das erste Konto.
- Datenmodell, Modulzuschnitt, Befehle für Build/Test/Lint (entstehen mit dem Grundgerüst).

## Reihenfolge der Slices

1. **Spike:** kleines Skript, das zwei Tool-Aufrufe hintereinander gegen das gewählte Modell macht (Function Calling und Streaming).
   Die Doku nennt keine Liste der Modelle, die das können; das wird hier geprüft, bevor die Schleife gebaut wird. Außerdem klären:
   - Muss der Verlauf Thought-Signatures des Modells zurückgeben, damit Function Calling funktioniert?
   - Unterscheidet der Body des 429 Minuten- und Tageslimit, und nennt er eine Wartezeit?
   - Liefert das Modell mehrere Tool-Aufrufe in einer Antwort?
   - Die Antworten als Fixtures für Slice 4 speichern.
2. NestJS-Gerüst, Config, Datenbank, Linting und Tests. Bindung und Prüfung von `Origin`/`Host`.
3. Konten: registrieren, anmelden, abmelden, Passwort ändern, Schutz der Routen, Profil mit verschlüsseltem Gemini-Key.
4. Agent-Schleife mit `ModelProvider`-Schnittstelle, Fake-Provider aus den Fixtures und einem Tool. Zustände, Abbruch,
   Schrittlimit, Fehlerbehandlung, System-Prompt, Sitzungen in der Datenbank. Tests ohne echte API-Aufrufe.
5. Gemini-Adapter, Rate-Limiter pro Nutzer, Protokoll der Modellaufrufe.
6. Projekte, übrige Tools, Policy-Service und Modi, Schutz für Dateizugriff und Befehle.
7. SSE-Streaming und Frontend: Anmeldung, Profil, Projekte, Chat.
8. Mail-Abläufe: E-Mail bestätigen, Passwort zurücksetzen. Aktive Anmeldungen, Konto löschen.
9. Nach dem MVP: Sandbox, dann offene Registrierung und Deploy; Kontext verdichten.
