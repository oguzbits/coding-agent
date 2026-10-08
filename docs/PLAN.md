# Plan: Coding Agent (NestJS)

## Ziel

Ein Coding Agent im Browser. Im Funktionsumfang orientiert er sich an **Claude Code im Web** (claude.ai/code): Konten,
Projekte, Sitzungen, Live-Schritte, Freigaben, später Diff-Ansicht. Die Oberfläche folgt der Web-Oberfläche von **OpenHands**
(MIT-Lizenz, siehe UI-Vorlage); die Oberfläche von claude.ai/code wird nicht nachgebaut. Das Backend ist NestJS,
Modellanbieter ist die **Gemini-API im Free Tier**. Die Anwendung ist eine vollständige Mehrnutzer-Web-App, läuft zunächst
lokal und ist so gebaut, dass sie später gehostet werden kann.

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
- **Queue:** Entfällt im MVP. Eine Sitzung ist ein gestreamter Dauerlauf.
- **Streaming:** SSE für den Fortschritt, POST für Nachrichten, Freigaben und Abbruch. Wiederverbinden über `Last-Event-ID`.
- **Tech-Stack:** die in NestJS üblichen Bausteine, siehe nächster Abschnitt.

## Tech-Stack

Grundsatz: die offiziellen NestJS-Pakete und die Vorgaben der Nest-CLI, wo es sie gibt. Die Versionen sind am 2026-10-08 gegen
npm geprüft und werden beim Anlegen des Gerüsts noch einmal mit `npm view` bestätigt.

| Bereich             | Wahl                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Laufzeit, Sprache   | Node.js 24 (LTS, in `.nvmrc` festgelegt), TypeScript 6 im Strict-Modus, npm                     |
| HTTP                | NestJS 12 auf Express 5, als ESM-Projekt (Standard der CLI)                                     |
| Config              | `@nestjs/config`, beim Start validiert                                                         |
| Validierung (HTTP)  | DTO-Klassen mit `class-validator` und `class-transformer`, globale `ValidationPipe` (`whitelist`) |
| API-Beschreibung    | `@nestjs/swagger` (OpenAPI aus den DTOs)                                                       |
| Datenbank           | Postgres, lokal per Docker Compose                                                             |
| ORM                 | TypeORM 1 über `@nestjs/typeorm`; Migrationen im Repo, `synchronize` aus                        |
| Anmeldung           | `@nestjs/passport` mit `passport-local`, `express-session` mit `connect-pg-simple`, Argon2id über `@node-rs/argon2` |
| Schutz              | `@nestjs/throttler`, `helmet`                                                                  |
| Mail                | `nodemailer` hinter einer eigenen Schnittstelle                                                |
| Tool-Schemas        | Zod 4 (Begründung unten)                                                                       |
| ZIP                 | `archiver` (folgt Symlinks nicht)                                                              |
| Tests               | Vitest und Supertest (Standard der CLI für ESM-Projekte)                                       |
| Code-Stil           | der Linter, den die CLI anlegt, und Prettier                                                   |
| Frontend            | React 19, Vite, TypeScript, Tailwind 4, TanStack Query; Typen aus der OpenAPI-Beschreibung mit `openapi-typescript` |
| Repo-Aufbau         | npm-Workspaces: `apps/api` (NestJS), `apps/web` (React)                                         |

- **ESM und Vitest:** Seit NestJS 12 legt die CLI ESM-Projekte mit Vitest an; CommonJS mit Jest gibt es weiter. Wir folgen dem
  Standard. Das Risiko liegt bei den TypeORM-Migrationen über die Kommandozeile in einem ESM-Projekt, deshalb wird das als
  Erstes in Slice 2 bewiesen. Scheitert es, wird das Gerüst als CommonJS mit Jest angelegt; am übrigen Plan ändert das nichts.
- **TypeScript 6, nicht 7:** `@nestjs/swagger` und `openapi-typescript` lassen TypeScript 7 noch nicht zu.
- **Tabelle für Anmeldungen:** `connect-pg-simple` legt sie nicht selbst an (`createTableIfMissing` bleibt aus), sie entsteht
  über eine TypeORM-Migration.
- **Bekannt alt, aber Standard:** `passport-local` (2014) und `class-transformer` (2022) haben lange kein Release, sind aber
  der dokumentierte Weg in NestJS und ohne offene Sicherheitsmeldung.

- **Zod nur für Tool-Schemas:** Die Argumente eines Tools kommen vom Modell, nicht über HTTP. Das Modell braucht die Deklaration
  als JSON-Schema, und der Server muss dieselben Argumente prüfen. Zod liefert beides aus einer Definition; für
  `class-validator` gibt es dafür kein offizielles Gegenstück. An der HTTP-Grenze gelten ausschließlich DTO-Klassen.
- **Postgres von Anfang an:** dieselbe Datenbank wie später im Deploy, damit Migrationen und Verhalten nicht auseinanderlaufen.

## Architektur

- **Agent-Schleife:** Modell aufrufen, Tool-Aufrufe ausführen, Ergebnisse zurückgeben, wiederholen bis zum Ende. Die Schleife ist
  ein Zustandsautomat, der Ereignisse ausgibt. Zustände: läuft, wartet auf Freigabe, fertig, abgebrochen, Fehler.
- **Begriffe:** „Sitzung“ heißt in diesem Plan immer die Unterhaltung mit dem Agenten. Die Anmeldung im Browser heißt
  „Anmeldung“. Im Code heißen sie `Conversation` und `AuthSession`, damit sie nicht verwechselt werden.
- **Lauf und Verbindung:** Ein Lauf lebt im Server-Prozess und hängt nicht an der SSE-Verbindung. Schließt der Browser, läuft er
  weiter oder wartet auf die Freigabe. Jedes Ereignis bekommt eine fortlaufende Nummer pro Sitzung und wird gespeichert, bevor es
  gesendet wird. Der SSE-Kanal liefert nach einem Wiederverbinden alles ab der Nummer aus `Last-Event-ID` nach und sendet
  regelmäßig einen Herzschlag. Der Nutzer-Key wird dem Lauf beim Start übergeben, nicht aus der HTTP-Anfrage gelesen.
- **Abbruch und Obergrenzen:** Stopp jederzeit (AbortController bis zum Modellaufruf und zur Prozessgruppe des Befehls). Maximale
  Schritte pro Lauf stehen in der Config. Pro Nutzer läuft höchstens ein Lauf gleichzeitig.
- **Obergrenze für den Verlauf:** Überschreitet der Verlauf einer Sitzung ein Token-Budget aus der Config, endet der Lauf mit
  einer klaren Meldung und dem Hinweis, eine neue Sitzung zu beginnen. Verdichten kommt später.
- **Neustart des Servers:** Beim Start werden Läufe, die als laufend oder wartend gespeichert sind, als abgebrochen markiert.
  Die Sitzung bleibt erhalten und lässt sich mit einer neuen Nachricht fortsetzen.
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
- **Projekte:** Ein Projekt ist ein Ordner unter `<Workspace-Wurzel>/<Nutzer-ID>/<Projekt-ID>`. Der Name steht nur in der
  Datenbank, Umbenennen fasst den Ordner nicht an. Der Nutzer legt ein Projekt leer an oder klont ein öffentliches Git-Repo. Der
  Agent arbeitet immer in genau einem Projekt. Projekte lassen sich auflisten, umbenennen und löschen. Wird ein Projekt, eine
  Sitzung oder ein Konto gelöscht, während ein Lauf darin aktiv ist, wird der Lauf zuerst abgebrochen.
- **Klonen:** nur `https`-URLs, mit Timeout und Größenlimit. Pro Nutzer gilt ein Speicherlimit über alle Projekte. Die Werte
  stehen in der Config. Git kennt kein Größenlimit, deshalb wird flach geklont, der Ordner dabei gemessen und der Vorgang bei
  Überschreitung beendet. Einzelheiten unter Sicherheit.
- **Ergebnis ansehen und mitnehmen:** Das Frontend zeigt die Dateien eines Projekts als Liste und ihren Inhalt, nur lesend. Ein
  Projekt lässt sich als ZIP herunterladen. Für beides gelten Pfadbegrenzung und Sperrliste wie für die Datei-Tools.
- **Sitzungen:** gehören zu einem Nutzer und einem Projekt und liegen in der Datenbank. Der Verlauf speichert die Antwort des
  Modells als unveränderte Teile des Anbieters (JSON) und baut sie nie aus Name und Argumenten neu zusammen, sonst gehen die
  Thought-Signatures verloren (siehe Gemini). Sitzungen lassen sich auflisten, umbenennen, fortsetzen und löschen.
- **ModelProvider:** Schnittstelle vor dem Gemini-Adapter, damit ein Wechsel (bezahltes Tier, anderer Anbieter) möglich bleibt.
  Ein Fake-Provider spielt aufgezeichnete Antworten ab.
- **Rate-Limiter:** jeder Modellaufruf läuft hindurch. Er zählt pro Nutzer Anfragen und Tokens pro Minute und pro Tag. Tokens
  schätzt er vor dem Aufruf und korrigiert sie danach anhand der Usage-Metadaten; maßgeblich bleibt der 429. Der Tageszähler
  liegt in der Datenbank und überlebt einen Neustart. Das Restbudget ist in der UI sichtbar, beschriftet als Verbrauch in dieser
  Anwendung: Google liefert kein Restkontingent, und derselbe Key kann auch anderswo verbraucht werden.
- **Später:** Sandbox, Deploy, GitHub-Login, Zwei-Faktor, bestehende lokale Ordner als Projekt einbinden (im MVP gar nicht,
  weil die Pfadgarantie auf Ordnern unter der Workspace-Wurzel beruht), Anweisungsdatei im Projekt (`AGENTS.md`, wird dem System-Prompt
  angehängt), Plan als Datei mit eigenem Reiter, Subagenten, Hooks, Diff-Ansicht, lange Verläufe verdichten, Änderungen eines Laufs rückgängig machen (jedes Projekt als Git-Repo mit
  Sicherungspunkt vor dem Lauf), Hintergrundprozesse und Vorschau der gebauten Anwendung.

### Module in `apps/api` (Entwurf)

| Modul           | Inhalt                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| `config`        | Config beim Start validiert, Modell-IDs, Limits                                             |
| `database`      | TypeORM, Migrationen                                                                        |
| `auth`          | Passport, Anmeldungen (`auth_sessions`), globaler Guard                                     |
| `users`         | `users`, `user_settings`, Verschlüsselung des Gemini-Keys                                   |
| `mail`          | Schnittstelle und Log-Variante                                                              |
| `projects`      | `projects`, Ordner, Klonen mit Limits, Dateiliste, ZIP                                      |
| `workspace`     | Pfadbegrenzung und Sperrliste, genutzt von `projects` und `tools`                           |
| `agent`         | Schleife und Zustandsautomat, arbeitet nur gegen Schnittstellen                             |
| `conversations` | `conversations`, `messages`, `runs`, `run_events`, SSE-Kanal, Endpunkte                     |
| `tools`         | die sechs Tools mit Zod-Schemas                                                             |
| `policy`        | Berechtigungs-Matrix, Freigaben                                                             |
| `model`         | `ModelProvider`, Gemini-Adapter, Fake-Provider, Rate-Limiter, `model_calls`, `usage_daily`  |

### Datenmodell (Entwurf)

Spalten und Indizes entstehen mit den Slices, die Tabellen und ihre Zuordnung stehen fest. Jede Tabelle außer `auth_sessions`
trägt direkt oder über ihren Elternsatz die Nutzer-ID.

| Tabelle          | Inhalt                                                                                   | Slice |
| ---------------- | ---------------------------------------------------------------------------------------- | ----- |
| `users`          | E-Mail (eindeutig, kleingeschrieben), Passwort-Hash, Zeitpunkt der E-Mail-Bestätigung       | 3     |
| `auth_sessions`  | Tabelle von `connect-pg-simple`; die Nutzer-ID steht im gespeicherten Sitzungsobjekt        | 3     |
| `user_settings`  | Gemini-Key (Chiffrat, IV, Tag, Schlüsselversion, letzte vier Zeichen), Modellname, Limits   | 3     |
| `conversations`  | Nutzer, Projekt, Titel, Modus                                                             | 4     |
| `messages`       | Sitzung, Reihenfolge, Rolle, Teile des Anbieters als JSON                                  | 4     |
| `runs`           | Sitzung, Zustand, offene Freigabe, Beginn, Ende, Grund des Endes                           | 4     |
| `run_events`     | Sitzung, fortlaufende Nummer, Art, Nutzlast als JSON                                       | 4     |
| `model_calls`    | Nutzer, Lauf, Modell, Tokens, Dauer, Fehlercode; keine Inhalte                             | 5     |
| `usage_daily`    | Nutzer, Modell, Tag nach Pazifischer Zeit, Anfragen, Tokens                                | 5     |
| `projects`       | Nutzer, Name, Herkunft (leer oder Klon-URL)                                               | 6a    |
| `email_tokens`   | Nutzer, Zweck, Hash des Tokens, Ablauf, Zeitpunkt der Verwendung                           | 8     |

Bis Slice 6 arbeitet die Schleife in einem festen Ordner aus der Config; die Spalte für das Projekt kommt mit der Tabelle
`projects` per Migration dazu.

### Berechtigungs-Matrix

| Tool                                | immer fragen | Änderungen automatisch erlauben | nur planen |
| ----------------------------------- | ------------ | ------------------------------- | ---------- |
| `read_file`, `list_files`, `search` | erlauben     | erlauben                        | erlauben   |
| `edit_file`, `write_file`           | fragen       | erlauben                        | ablehnen   |
| `run_command`                       | fragen       | fragen                          | ablehnen   |

### Tool-Verträge (Entwurf)

Der Spike bestätigt die Schemas und Werte; alle Zahlen stehen später in der Config, nicht im Code.

Für alle Tools gilt: Pfade sind relativ zur Projektwurzel. Ein Pfad außerhalb, ein gesperrter Pfad oder ein Fehler kommt als
Tool-Ergebnis zurück, mit einem Satz, was stattdessen zu tun ist. Jede Ausgabe hat eine Obergrenze und sagt, wenn sie gekürzt
wurde und wie man den Rest bekommt; stilles Abschneiden gibt es nicht. Die Beschreibungen der Parameter sind Teil des Prompts
und werden im Spike mitgemessen.

| Tool         | Parameter                                                            | Ausgabe und Grenzen                                                                                                   |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `read_file`  | `path`; `offset` (Zeile ab 1) und `limit` (Zeilen), beide optional   | Zeilen mit Nummern; je Aufruf höchstens eine Zeilen- und eine Bytezahl, darüber gekürzt mit Hinweis auf `offset`. Binärdateien: Fehler. Merkt die Datei als in der Sitzung gelesen. |
| `list_files` | `path` (Standard: Wurzel); `depth` (Standard 2)                       | Relative Pfade, Ordner mit `/`; höchstens eine Zahl Einträge. `.git/` und Sperrliste fehlen; Ordner wie `node_modules` erscheinen nur als Name mit Hinweis. |
| `search`     | `pattern` (Regex); `path`, `glob`, beide optional                     | Treffer als `pfad:zeile: text`; höchstens eine Zahl Treffer, lange Zeilen gekürzt. |
| `edit_file`  | `path`, `old_string`, `new_string`; `replace_all` (Standard: nein)    | Semantik wie unter Architektur: das Textstück kommt genau einmal vor (außer bei `replace_all`), die Datei wurde in der Sitzung gelesen. Antwort: Zahl der Ersetzungen und die geänderten Zeilen mit etwas Umgebung. |
| `write_file` | `path`, `content`                                                     | Legt Datei und fehlende Ordner an. Eine vorhandene Datei ersetzt es nur, wenn sie in der Sitzung gelesen wurde. Höchstgröße aus der Config. |
| `run_command`| `command`; `timeout_seconds` (optional, Höchstwert aus der Config)    | Läuft in der Projektwurzel. Antwort: Exit-Code und stdout/stderr gemeinsam; bei Überlänge Anfang und Ende mit Hinweis „N Zeilen ausgelassen“. |

- **`search` als Kindprozess mit ripgrep:** Die Regex stammt vom Modell. Im Node-Prozess könnte ein Muster mit
  katastrophalem Backtracking die Ereignisschleife blockieren; ripgrep arbeitet mit endlichen Automaten und läuft mit Timeout
  in einem eigenen Prozess. Die Sperrliste gilt als Ausschluss-Globs, und jeder Treffer wird zusätzlich gegen die
  Pfadbegrenzung geprüft. Ob das npm-Paket `@vscode/ripgrep` oder eine Systeminstallation dient, und die Lizenz, werden vor
  dem Einsatz geprüft; der Spike darf zunächst einen einfachen Ersatz nutzen.

## UI-Vorlage

Die Oberfläche folgt in Aussehen und Bedienung der Web-Oberfläche von OpenHands (`github.com/OpenHands/OpenHands`, dort „Agent
Canvas“): Startansicht mit Auswahl des Projekts, Seitenleiste mit den Sitzungen, Sitzungsansicht mit Chat und eingeklappten
Tool-Schritten, Reiter für Dateien, Einstellungen.

Die Vorlage ist eine Einzelnutzer-Anwendung mit Python-Backend. Übernommen wird nur die Oberfläche; wo ihre Begriffe von
unseren abweichen, gilt diese Zuordnung:

| Bei uns                       | In der Vorlage                                                              | Umgang                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Projekt                       | Workspace (lokaler Ordner) und Repo-Auswahl auf der Startansicht              | Auswahl und Verwaltung der Workspaces werden zur Projektverwaltung; die Seitenleiste gruppiert Sitzungen nach Projekt. Keine Branch-Auswahl, kein Ordner-Browser. |
| Modus „nur planen“            | Umschalter Code/Plan im Eingabefeld                                           | übernommen                                                             |
| „immer fragen“ / „automatisch“ | Schalter „Confirmation mode“ in den Einstellungen                             | Auswahl pro Sitzung im Eingabefeld, weil der Modus bei uns zur Sitzung gehört |
| Freigabe                      | Schaltflächen Ablehnen/Bestätigen im Chat, Risiko-Hinweis                     | übernommen, ergänzt um Diff oder Befehlszeile; der Hinweis erscheint bei selbstausführenden Dateien statt nach Risikostufe |
| Datei-Ansicht                 | Reiter „Files“ mit Umschaltung Dateien/Diff/Commits                           | im MVP nur „Dateien“; Diff und Commits kommen mit der Diff-Ansicht       |
| Modell                        | Auswahl von Modell und Profil im Eingabefeld                                  | nur Anzeige des Modells aus dem Profil, keine Auswahl                    |
| Konto                         | keine Anmeldung, nur Avatar                                                   | eigene Seiten (siehe Umfang)                                            |

- **Warum diese Vorlage:** Das Repo steht unter der MIT-Lizenz (laut GitHub-Startseite am
  2026-10-09; vor der ersten Übernahme wird die `LICENSE` gelesen und geprüft, ob Unterordner eigene Lizenzdateien tragen). Quelltext, Design-Tokens und Komponenten dürfen gelesen und
  übernommen werden, und die Anwendung läuft lokal, also ohne fremdes Konto und ohne fremde Nutzungsbedingungen.
- **Referenz ist der Quelltext:** Der Stand ist auf das Release `v1.25.0` festgelegt und liegt als Klon außerhalb dieses Repos.
  Farben, Abstände, Radien und Schriften kommen aus den Token-Dateien (`src/index.css`, `src/tailwind.css`, `hero.ts`,
  `src/themes/`), Aufbau und Zustände aus den Komponenten der Routen `conversations`, `conversations/:conversationId` und
  `settings`.
- **Gerendertes Bild als Gegenprobe:** Die Vorlage startet lokal mit Beispieldaten (`npm run dev:mock`). Der
  Chrome-DevTools-MCP misst dort und in unserer Anwendung dieselben Ansichten; jede fertige Ansicht wird per Screenshot und
  Zahlenvergleich abgeglichen.
- **Umfang:** nur die Ansichten, die es bei uns gibt. Automationen, Erweiterungen, Skills, Plugins, MCP-Einstellungen, der
  Browser-Reiter, der Planner-Reiter, Agenten- und LLM-Profile und die Desktop-Variante gehören nicht dazu. Anmeldung,
  Registrierung, Konto und Verbrauchsanzeige hat die Vorlage nicht; sie entstehen aus denselben Tokens und Bausteinen.
- **Gleiche Bausteine im Frontend:** Tailwind 4, `lucide-react` für Icons, die Schriften Outfit und IBM Plex Mono (selbst
  ausgeliefert statt von Google Fonts geladen), TanStack Query für Serverdaten, React Router 7 als reine Client-Anwendung ohne
  Server-Rendering. Ob HeroUI und `zustand` übernommen werden, entscheidet sich in Slice 7a an der ersten Ansicht.
- **Sprache der Oberfläche:** Englisch wie die Vorlage, ohne Übersetzungsschicht (`i18next` wird nicht übernommen).
- **Übernommener Code:** ist erlaubt, wird aber an unsere API und unsere Lint-Regeln angepasst und nicht blind kopiert. Sobald
  Code oder Token-Dateien übernommen sind, nennt `THIRD-PARTY-NOTICES.md` das Projekt mit Copyright-Vermerk und Lizenztext; das
  verlangt die MIT-Lizenz.
- **Abgrenzung:** eigener Name und eigenes Logo, keine Logos oder Bilder aus `src/assets/branding/` und `public/`. Die README
  nennt OpenHands als Vorlage und sagt, dass die Anwendung nicht damit verbunden ist.

## Konten und Anmeldung

- **Funktionen:** registrieren, E-Mail bestätigen, anmelden, abmelden, Passwort ändern, Passwort zurücksetzen, aktive Anmeldungen
  einsehen und beenden, Konto samt Projekten und Sitzungen löschen.
- **Anmeldung:** serverseitige Sitzung in der Datenbank, Cookie mit `HttpOnly` und `SameSite=Strict` (beim Deploy zusätzlich
  `Secure`). Kein Token im `localStorage`. Das Cookie gilt auch für den SSE-Kanal.
- **Passwörter:** Argon2id mit mindestens den Werten von OWASP (19 MiB Speicher, 2 Durchläufe, 1 Thread). Mindestlänge statt
  Zeichenregeln.
- **Lebenszyklus der Anmeldung:** Beim Anmelden wird die Kennung der Anmeldung neu erzeugt (gegen Session-Fixation). Passwort
  ändern und Passwort zurücksetzen beenden alle anderen Anmeldungen des Nutzers. Anmeldungen laufen nach Untätigkeit und nach
  einer festen Höchstdauer ab. Der Cookie trägt einen eigenen Namen, weil sich alle Anwendungen auf `localhost` die Cookies
  teilen, gleich auf welchem Port.
- **Unbestätigte E-Mail:** Bis die Mail-Abläufe in Slice 8 stehen, gilt ein Konto als bestätigt. Danach kann sich ein
  unbestätigtes Konto anmelden, aber keinen Lauf starten.
- **Frontend und Backend unter einer Herkunft:** In der Entwicklung leitet Vite `/api` an das Backend weiter, im Betrieb liefert
  ein Proxy beides aus. CORS bleibt aus.
- **Umsetzung:** Passport mit lokaler Strategie für die Anmeldung, ein globaler Guard schützt alle Routen, öffentliche Routen
  sind ausdrücklich markiert.
- **Schutz:** Begrenzung der Versuche bei Anmeldung, Registrierung und Zurücksetzen. Antworten verraten nicht, ob eine E-Mail
  registriert ist. Tokens für Bestätigung und Zurücksetzen sind einmalig, laufen ab und liegen nur als Hash in der Datenbank.
- **Mail:** hinter einer Schnittstelle. Lokal landet die Mail im Log oder in einem Mail-Catcher; ein echter Versand kommt mit
  dem Deploy.
- **Registrierung:** per Config offen oder geschlossen. Standard ist geschlossen, solange es keine Sandbox gibt; das erste Konto
  lässt sich immer anlegen.
- **Profil:** Gemini-Key, Modellname und Limits. Der Key liegt verschlüsselt in der Datenbank (AES-256-GCM, Hauptschlüssel aus
  der Umgebung), wird nie geloggt und nie an das Frontend zurückgegeben (nur die letzten vier Zeichen). Jede Verschlüsselung
  nutzt einen neuen zufälligen IV, bindet die Nutzer-ID als Zusatzdaten ein und speichert eine Schlüsselversion, damit der
  Hauptschlüssel später gewechselt werden kann.
- **Autorisierung:** Jede Abfrage von Projekten, Sitzungen und Einstellungen ist auf den angemeldeten Nutzer eingeschränkt.

## Sicherheit

Der Server führt Shell-Befehle aus. Ohne Sandbox laufen sie mit den Rechten des Server-Prozesses.

- **Server:** lokal Bindung an `127.0.0.1`, Prüfung von `Origin` und `Host` (gegen CSRF und DNS-Rebinding), alle Routen außer
  Registrierung, Anmeldung, E-Mail-Bestätigung und Passwort-Zurücksetzen verlangen eine Anmeldung.
- **Dateizugriff:** nur innerhalb des Projektordners (Realpath prüfen, Symlinks auflösen; bei neuen Dateien den Realpath des
  nächsten vorhandenen Elternordners). Eine Sperrliste (`.env*`, Schlüsseldateien, `.git/`) gilt für alle Datei-Tools, auch für
  `search` und `list_files`. Sie vergleicht ohne Rücksicht auf Groß- und Kleinschreibung und nach Unicode-Normalisierung, weil
  das Dateisystem von macOS `.GIT` und `.git` gleichsetzt. Zwischen Prüfung und Zugriff bleibt ein kleines Zeitfenster; das
  schließt erst die Sandbox.
- **Befehle:** bereinigte Umgebung ohne Secrets des Servers (Hauptschlüssel, Datenbank-Zugang), Timeout, Ausgabelimit. Ein
  Befehl, der nicht von selbst endet (Dev-Server, Watch-Modus), läuft in den Timeout. Der Befehl läuft als eigene Prozessgruppe
  mit geschlossener Standardeingabe, damit Rückfragen ihn nicht hängen lassen; bei Timeout und Stopp wird die ganze Gruppe
  beendet, erst mit SIGTERM, dann mit SIGKILL.
- **Klonen fremder Repos:** flach und ohne Submodule (`--depth 1 --no-recurse-submodules`), nur das Protokoll `https`, leere
  Vorlage für Hooks, keine Passwortabfrage (`GIT_TERMINAL_PROMPT=0`), kein Nachladen über Git LFS. Git muss mindestens die
  Version haben, in der CVE-2024-32002 und CVE-2025-48384 behoben sind; das prüft der Server beim Start. Die Adresse zeigt lokal
  auf jeden öffentlichen Host, vor einem Deploy kommt eine Liste erlaubter Hosts dazu (gegen Zugriffe ins interne Netz).
- **Inhalte aus Projekten sind nicht vertrauenswürdig:** Ein geklontes Repo kann Anweisungen an das Modell enthalten. Deshalb
  fragt `run_command` in jedem Modus. Im Modus „Änderungen automatisch erlauben“ fragen Datei-Tools trotzdem, wenn sie eine Datei
  ändern, die später von selbst ausgeführt wird (`package.json`, `.github/`, `.husky/`, `Makefile`, `.npmrc`). Die Liste steht
  in der Config.
- **Grenze ohne Sandbox:** Ein freigegebener Befehl kann alles lesen und ändern, was der Server-Prozess darf, auch die Projekte
  anderer Nutzer und die Datenbank. Getrennte Ordner sind keine Isolierung. Deshalb bleibt die Registrierung geschlossen, bis
  die Sandbox steht.

## Gemini Free Tier

- **SDK:** `@google/genai` (Nachfolger von `@google/generative-ai`), ein Client pro Nutzer-Key. Version mit `npm view @google/genai version`
  prüfen.
- **Modell und Limits stehen im Profil des Nutzers, nie im Code.** Modellname, Anfragen/Minute, Tokens/Minute und Anfragen/Tag
  trägt der Nutzer aus dem Google-AI-Studio-Dashboard ein (Rate-Limit-Seite, Login nötig). Die Werte gelten pro Modell und ändern
  sich. Vorgabewerte kommen aus der Config.
- **Fehler bei Limit:** HTTP 429 `RESOURCE_EXHAUSTED`. Minutenlimit: Backoff mit Jitter und erneut versuchen. Tageslimit: nicht
  wiederholen, in der UI klar melden. Der Tageszähler wird um Mitternacht Pazifischer Zeit zurückgesetzt. Einen `Retry-After`-Header
  gibt es laut Doku nicht. 503 und 5xx: mit Backoff wiederholen; 400 und 403 nicht.
- **Wiederholen nur an einer Stelle:** Das SDK wiederholt nur, wenn `retryOptions` gesetzt ist. Wir setzen es nicht; wiederholt
  wird allein im Rate-Limiter. Das SDK liefert den Fehler als `ApiError` mit `status`, der Body steht als JSON-Text in `message`.
  Abgebrochen wird über `config.abortSignal`; Google rechnet eine abgebrochene Anfrage trotzdem an.
- **Thought-Signatures:** Bei Gemini 3 sind sie für Function Calling Pflicht, sonst antwortet die API mit 400. Die Signatur steht
  im ersten Funktionsaufruf einer Antwort, beim Streamen manchmal in einem leeren Textteil. Der Adapter liest den Strom deshalb
  bis zum Ende und der Verlauf hängt die Teile unverändert an. Bei mehreren Aufrufen in einer Antwort folgen erst alle Aufrufe,
  dann alle Ergebnisse in derselben Reihenfolge.
- **Tool-Deklaration:** über `parametersJsonSchema` aus `z.toJSONSchema()`. Welche Schlüsselwörter die API ablehnt, nennt die
  Doku nicht; das klärt der Spike.
- **Verbrauch:** Jeder Tool-Schritt ist ein Aufruf. Kontext klein halten, Ausgaben von Tools kürzen.
- **Das Kontingent ist das größte Produktrisiko.** Die Limits gelten pro Google-Projekt, nicht pro Key. Im Dashboard standen am
  2026-09-29 für die Flash-Modelle 5 Anfragen pro Minute und 20 pro Tag, für Flash-Lite 15 pro Minute und 500 pro Tag. Mit 20
  Anfragen am Tag ist eine einzige Aufgabe kaum zu schaffen, praktisch nutzbar ist also nur Flash-Lite. Ob Flash-Lite für
  mehrschrittige Tool-Aufrufe gut genug ist, entscheidet der Spike. Reicht es nicht, wird vor Slice 2 neu entschieden (bezahltes
  Tier oder anderer Anbieter); die `ModelProvider`-Schnittstelle bleibt dafür der Hebel.
- **Bedingung für Nutzer im EWR:** Die Zusatzbedingungen der Gemini-API erlauben nur bezahlte Dienste, wenn eine Anwendung
  Nutzern im EWR, in der Schweiz oder im Vereinigten Königreich bereitgestellt wird. Lokal mit dem eigenen Konto ist das kein
  Hindernis. Vor offener Registrierung und Deploy muss die Anwendung Keys aus dem bezahlten Tier verlangen oder einen anderen
  Anbieter nutzen. Das ist keine Rechtsberatung und wird vor dem Deploy erneut geprüft.
- **Datenschutz:** Im Free Tier nutzt Google Eingaben und Antworten zur Produktverbesserung, und Menschen können sie lesen. Der Agent
  schickt Quelltext an das Modell. Die UI weist beim Hinterlegen des Keys darauf hin: eigener Key aus einem eigenen Google-Projekt
  ohne Billing, nur Code, den der Nutzer ohnehin öffentlich machen würde, nie `.env`-Dateien oder Secrets in den Kontext (siehe
  Sicherheit). Beim Entwickeln wird der Key des Projekts `notebooklm-klon` nicht verwendet.

## MVP

Konten mit E-Mail und Passwort (samt E-Mail-Bestätigung, Passwort zurücksetzen, aktiven Anmeldungen und Konto löschen), Profil
mit eigenem Gemini-Key, Projekte mit Datei-Ansicht und ZIP-Download, sechs Tools, Berechtigungs-Modi, gespeicherte Sitzungen,
Chat mit Live-Schritten, Freigabe mit Diff-Vorschau und Stopp-Button. Lokal betrieben, Registrierung geschlossen.

**Abnahme:** Auf einem frischen Konto wird ein kleines eigenes Beispiel-Repo mit einem absichtlich fehlschlagenden Test
geklont. Der Agent soll den Fehler beheben (Ursache finden, Datei ändern, Test grün). Der Nutzer gibt jede Änderung und jeden
Befehl frei, verfolgt den Lauf im Browser, lädt die Seite während des Laufs neu, ohne dass der Lauf verloren geht, und lädt
das Ergebnis als ZIP herunter. Das gelingt mit dem gewählten Modell im Free Tier in mindestens zwei von drei Versuchen ohne
Eingriff außer den Freigaben; die Schwelle wird nach dem Spike bestätigt. `npm run check` und alle Tests sind grün.

**Out of scope:** Sandbox, Deploy, offene Registrierung, GitHub-Login, Zwei-Faktor, Rollen und Teams, Git-Push, Subagenten,
IDE-Integration, Diff-Ansicht, Wissensdatenbank mit Dokumenten-Upload und Vektorsuche, Dateien im Browser bearbeiten, Rückgängig, Hintergrundprozesse, Vorschau der gebauten Anwendung,
Queue, Verläufe verdichten.

## Qualitätssicherung und Arbeitsregeln

Entsteht mit dem Grundgerüst in Slice 2, sofern nicht anders vermerkt.

- **Ein Befehl für alles Statische:** `npm run check` bündelt Typprüfung, Linting, Architekturregeln (dependency-cruiser) und die
  Suche nach totem Code (knip). `npm test` läuft offline, `npm run test:db` braucht Postgres. Die Tests mit Datenbank heißen
  `*.db.test.ts` und laufen als eigenes Vitest-Projekt gegen eine Datenbank, deren Name auf `_test` endet.
- **Git-Hooks (Husky):** vor dem Commit lint-staged und `npm run check`, vor dem Push `npm test`.
- **CI (GitHub Actions):** Format und `check`, Tests offline, Tests mit Postgres als Service, Build, `npm audit` für
  Produktionsabhängigkeiten, Semgrep. Actions sind auf Commit-SHAs festgelegt.
- **Architekturregeln:** `apps/api` und `apps/web` importieren nichts voneinander, keine zirkulären Abhängigkeiten. Nur der
  Gemini-Adapter importiert `@google/genai`. Die Agent-Schleife kennt weder HTTP noch TypeORM, sie arbeitet gegen Schnittstellen.
- **Lint-Regeln über den Standard hinaus:** kein `any`, kein `@ts-ignore`, keine doppelte Typumwandlung, kein leeres `catch`, kein
  `console` im Backend (Logger von NestJS), Modell-IDs nur im Config-Modul, Grenzen für Komplexität und Dateilänge. Kann der
  Linter der CLI eine dieser Regeln nicht abbilden, läuft ESLint nur für diese Regeln zusätzlich.
- **Vertrag zwischen Backend und Frontend:** Das Frontend erzeugt seine Typen aus der OpenAPI-Beschreibung, die Swagger liefert.
  Es gibt keine von Hand gepflegten Kopien der DTOs. Die Ereignisse des SSE-Kanals sind ebenfalls DTO-Klassen und stehen in
  derselben Beschreibung, obwohl sie keine eigene Route haben.
- **Tests des Frontends (ab Slice 7a):** Vitest mit Testing Library für Komponenten, Playwright für zwei Wege gegen das echte
  Backend mit Fake-Provider (per Config umschaltbar): anmelden, Projekt anlegen, Lauf mit Freigabe; und Seite während eines
  Laufs neu laden. Der Chrome-DevTools-MCP bleibt für den Abgleich mit der Vorlage.
- **Keine echten API-Aufrufe in Tests:** Tests nutzen den Fake-Provider, jeder nicht gemockte Netzaufruf schlägt fehl.
- **Regeln für Coding Agents:** `AGENTS.md` ist die eine Quelle (Schichten, Invarianten, Arbeitsablauf, Befehle), `CLAUDE.md`
  importiert sie nur. Die Invarianten kommen aus diesem Plan: Abfragen sind auf den Nutzer aus der Sitzung begrenzt, Tools laufen
  nur über den Policy-Service, Pfade nur über die Pfadbegrenzung, Keys und Dateiinhalte stehen nie im Protokoll, Umgebungswerte
  kommen nur über das Config-Modul, Migrationen werden erzeugt und `synchronize` bleibt aus.
- **Hooks für Claude Code (ab sofort möglich, `.claude/`):** Ein Hook vor jedem Shell-Befehl sperrt Force-Push, `--no-verify`,
  rekursives Löschen außerhalb des Projekts und jeden Zugriff auf `.env*` und Schlüsseldateien. Ein Hook am Ende eines Zuges
  verlangt ein grünes `npm run check`, wenn Code geändert wurde (ab Slice 2). Die Regeln des ersten Hooks sind eine reine
  Funktion mit eigenen Tests.
- **Dokumente:** `docs/SPIKE-ERGEBNISSE.md` (Messung, Befund, Entscheidung, Grenzen) ab Slice 1, der Spike-Code liegt als
  Wegwerf-Code in `spikes/`. `DESIGN.md` hält die Design-Tokens, `docs/DESIGN-ABGLEICH.md` die gemessenen Werte der Vorlage, die
  Maßnahme und die bewussten Abweichungen (Slice 7a und 7b). `docs/BACKLOG.md` führt Stand, Offenes und Späteres, sobald gebaut wird.
- **Regeln für den Abgleich mit der Vorlage:** messen statt schätzen (berechnete Stile bei festem Fenster, hell und dunkel, dazu
  die schmale Ansicht), pro Bereich Zahlenvergleich und Screenshot nebeneinander, nichts vortäuschen,
  was es hier nicht gibt.

## Betrieb: Observability, Lasttests, Skalierung

Die Grundausstattung für Logs entsteht mit dem Gerüst in Slice 2, alles Weitere in Slice 9.

- **Logs:** strukturiert (JSON), hinter dem Logger von NestJS. Jede Zeile trägt Anfrage-ID, Nutzer-ID, Sitzungs-ID und
  Lauf-ID; nie Keys, Dateiinhalte oder Befehlsausgaben, wie beim Protokoll der Modellaufrufe.
- **Metriken:** Endpunkt `/metrics` im Prometheus-Format, nur intern erreichbar. Aktive Läufe, Schritte und Dauer je Lauf,
  Tokens, 429 nach Art (Minute oder Tag), Wartezeit im Rate-Limiter, offene SSE-Kanäle, Verzögerung der Ereignisschleife,
  Auslastung des Datenbank-Pools.
- **Traces:** OpenTelemetry über Anfrage, Lauf, Modellaufruf und Tool-Aufruf, ohne Inhalte als Attribute. Ob lokal ein
  Backend zur Ansicht mitläuft, entscheidet sich in Slice 9.
- **Health:** `@nestjs/terminus` mit Liveness und Readiness (Datenbank).
- **Lasttests:** k6, die Skripte liegen in `load/`, eines je Szenario. Die Unterstützung für SSE (im Kern von k6 vermutlich
  nicht enthalten) wird beim Einrichten geprüft. Gemessen wird die eigene Anwendung, nicht das Modell: Der Fake-Provider
  bildet eine einstellbare Verzögerung nach, ein echter Key kommt nie zum Einsatz. Produktions-Build, nur gegen `localhost`,
  Grenzen des Throttlers per Config angehoben. Zahlen von einem Rechner sind Vergleichswerte zwischen zwei Ständen, keine
  Aussage über die Kapazität im Betrieb.
- **Szenarien:** Anmeldung (Argon2id ist absichtlich teuer; bleibt der Rest der API dabei erreichbar?), Lesen von Projekten
  und Sitzungen, viele gleichzeitige Läufe mit offenen SSE-Kanälen, Befehle (Prozessgruppen, Ausgabelimit), Dateiliste und
  ZIP-Download großer Projekte. Arten von Läufen: Rauchtest, erwartete Last, Steigerung bis zum Bruch, Dauerlauf. Die
  Schwellen (95. Perzentil, Fehlerquote) werden nach der ersten Messung festgelegt, nicht vorher geraten.
- **Mehrere Instanzen:** Ein Lauf lebt im Server-Prozess. Zwei API-Prozesse brauchen deshalb entweder die feste Zuordnung
  einer Sitzung zu einem Prozess über den Proxy oder einen Worker als eigenen Prozess, dessen Ereignisse über Redis laufen.
  Der Minutenzähler des Rate-Limiters liegt im Speicher und müsste in jedem Fall in die Datenbank oder nach Redis. Welche
  Variante, entscheidet Slice 9 nach der Messung; Redis gehört nicht zum Stack des MVP.
- **Ergebnisse:** `docs/LASTTESTS.md` hält Messung, Befund und Maßnahme fest. In der CI läuft nur der Rauchtest.

## Offene Entscheidungen

- Name von Produkt und Repo (spätestens in Slice 0: Paketnamen, README, `THIRD-PARTY-NOTICES.md`).
- Feinschnitt der Module und genaue Spalten (entstehen mit den Slices).

## Reihenfolge der Slices

0. **Vorbereitung:** Produktname festlegen, `.nvmrc`, `.gitignore`, `README`, `AGENTS.md` mit `CLAUDE.md` (importiert) und die
   Hooks für Claude Code aus „Qualitätssicherung“; `docs/BACKLOG.md` anlegen.
1. **Spike:** kleines Skript gegen das gewählte Modell mit Function Calling und Streaming. Es entscheidet, ob der Plan mit dem
   Free Tier trägt, und klärt, was die Doku offen lässt:
   - Schafft Flash-Lite eine kleine echte Aufgabe (Datei finden, lesen, ändern, Test ausführen) zuverlässig, und wie viele
     Anfragen und Tokens kostet sie? Dreimal wiederholen, weil das Modell nicht deterministisch ist.
   - Nimmt die API die Schemas aus `z.toJSONSchema()` für alle sechs Tools an?
   - In welcher Form kommen Funktionsaufrufe im Strom an (vollständig oder in Teilen), und wo steht die Thought-Signature?
   - Unterscheidet der Body des 429 Minuten- und Tageslimit, und nennt er eine Wartezeit? Die Doku beschreibt das nicht.
   - Liefert das Modell mehrere Tool-Aufrufe in einer Antwort?
   - Zählen Denk-Tokens gegen das Limit pro Minute?
   - Die Antworten als Fixtures für Slice 4 speichern: roh für die Tests des Adapters, in der neutralen Form der
     `ModelProvider`-Schnittstelle für die Tests der Schleife.
2. NestJS-Gerüst, Config, Postgres (Docker Compose) mit TypeORM und erster Migration, Swagger, Linting und Tests,
   strukturierte Logs mit Korrelations-IDs. Bindung und
   Prüfung von `Origin`/`Host`. Zuerst wird bewiesen, dass im ESM-Gerüst eine Migration erzeugt und ausgeführt werden kann und
   ein Test mit Datenbank läuft.
3. Konten: registrieren, anmelden, abmelden, Passwort ändern, Schutz der Routen, Profil mit verschlüsseltem Gemini-Key.
4. Agent-Schleife mit `ModelProvider`-Schnittstelle, Fake-Provider aus den Fixtures, einem lesenden Tool (`read_file`) und einem
   Test-Tool, das eine Freigabe verlangt (fester Test-Policy; der Policy-Service folgt in 6a). Zustände, Abbruch,
   Schrittlimit, Obergrenze für den Verlauf, Fehlerbehandlung, Aufräumen nach Neustart, System-Prompt, Sitzungen in der
   Datenbank. Gespeicherte Ereignisse mit fortlaufender Nummer und der SSE-Kanal mit `Last-Event-ID`, damit der Ablauf ohne
   Frontend von der Kommandozeile aus prüfbar ist. Tests ohne echte API-Aufrufe.
5. Gemini-Adapter, Rate-Limiter pro Nutzer, Protokoll der Modellaufrufe.
6a. Projekte (anlegen, umbenennen, löschen), Workspace-Modul mit Pfadbegrenzung und Sperrliste, die fünf Datei-Tools
    (`read_file`, `list_files`, `search`, `edit_file`, `write_file`), Policy-Service mit Modi und Freigabe (Matrix, Diff-Vorschau).
6b. `run_command` (Prozessgruppe, Timeout, bereinigte Umgebung, Ausgabelimit), Klonen mit Limits und Speicherlimit pro Nutzer,
    Freigabe auch bei selbstausführenden Dateien.
7a. Design-Tokens aus der Vorlage ableiten und die Vorlage lokal mit Beispieldaten starten (vorher die Lizenz prüfen, siehe
    UI-Vorlage). Gerüst `apps/web` mit den Frontend-Tests, Anmeldung, Profil mit Verbrauchsanzeige, Startansicht mit
    Projektauswahl und -verwaltung.
7b. Seitenleiste mit Sitzungen, Chat mit Live-Schritten und Freigabe im Verlauf, Reiter „Dateien“ mit ZIP-Download. Die
    Ende-zu-Ende-Wege laufen in der CI.
8. Mail-Abläufe: E-Mail bestätigen, Passwort zurücksetzen. Aktive Anmeldungen, Konto löschen.
9. Betrieb: Metriken, Traces und Health-Checks, Lasttests mit k6, Engpässe beheben, Entscheidung über mehrere Instanzen
   (siehe „Betrieb: Observability, Lasttests, Skalierung“).
10. Nach dem MVP: Sandbox, dann offene Registrierung und Deploy (vorher: Keys aus dem bezahlten Tier wegen der Bedingung für den
   EWR, Liste erlaubter Hosts beim Klonen); Kontext verdichten.
