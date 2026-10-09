# Lasttests

Gemessen wird die eigene Anwendung, nicht das Modell: Produktions-Build, Fake-Provider mit 500 ms Verzögerung pro Aufruf,
Throttler angehoben, nur gegen `localhost`, k6 im Docker-Image `grafana/k6`. Zahlen von einem Rechner (MacBook, Postgres im
Docker) sind Vergleichswerte zwischen zwei Ständen, keine Aussage über die Kapazität im Betrieb.

Ablauf: `npm run build`, `npm run db:up`, `npm run load:server` (eigene Datenbank `coding_agent_load`, Metrik-Token wird
ausgegeben), dann `METRICS_TOKEN=… npm run load -- <smoke|logins|runs|commands|files>`. Einstellbar über `VUS`,
`LOGINS_PER_SECOND`, `SSE_HOLD_SECONDS`, `COMMAND`, `FILES`, `KILOBYTES`.

## Messung 2026-10-09 (erster Stand)

| Szenario | Last | Ergebnis |
| --- | --- | --- |
| `smoke` | 1 Durchlauf | alle 8 Prüfungen grün, Iteration 0,8 s |
| `logins` | 10 Anmeldungen/s + 5 lesende Nutzer, 60 s | 0 % Fehler, p95 33 ms, Ereignisschleife max. 22 ms |
| `logins` | 80 Anmeldungen/s + 5 lesende Nutzer, 60 s | 0 % Fehler, p95 23 ms, Ereignisschleife max. 20 ms |
| `runs` | 20 Nutzer mit Lauf und offenem Ereigniskanal (5 s) | 0 % Fehler (ohne die gewollten Zeitüberschreitungen des Kanals), Lauf endet in < 1 s |
| `runs` | 200 Nutzer, gleiche Last | 0 % Fehler, 31 Läufe/s, Datenbank-Pool max. 7 Verbindungen, 0 wartend, Ereignisschleife max. 16 ms |
| `commands` | 10 Nutzer, `echo` mit Freigabe | 0 % Fehler, p95 28 ms, Lauf 1,3 s (Abfrage-Takt 0,3 s) |
| `files` | 5 Nutzer, 300 Dateien à 50 KB, Liste und ZIP (ca. 15 MB) | 0 % Fehler, ZIP p95 ca. 820 ms, Speicher 427 MB RSS |

## Befund

- Es wurde kein Bruchpunkt erreicht; die Schwellen für 95. Perzentil und Fehlerquote werden erst nach einer Messung mit
  Steigerung bis zum Bruch festgelegt (offen, siehe unten).
- Argon2id (OWASP-Minimum) belastet die Anwendung bei 80 Anmeldungen/s nicht spürbar: Lesende Anfragen bleiben bei p95 ≈ 23 ms.
  Die Hashes laufen im Thread-Pool von libuv, nicht in der Ereignisschleife.
- Der Datenbank-Pool wird bei 200 gleichzeitigen Läufen nicht knapp.
- Ein ZIP großer Projekte kostet ca. 0,8 s und erzeugt Speicherspitzen (Resident 427 MB nach dem Lauf); er wird gestreamt, die
  Spitze stammt vermutlich vom Lesen der Dateien. Bei vielen gleichzeitigen Downloads zuerst hier nachsehen.
- Ein Lauf, der auf eine Freigabe wartet, hat keine Zeitgrenze und belegt den einen aktiven Lauf des Nutzers, bis er antwortet
  oder abbricht. Das ist gewollt (Neuladen des Browsers setzt fort), steht aber im Backlog.
- Die Prometheus-Zähler gelten ab Start des Servers. Für getrennte Messungen den Server zwischen den Szenarien neu starten.
- k6 hat keinen SSE-Client. Der Ereigniskanal wird mit einer Anfrage gehalten, die nach `SSE_HOLD_SECONDS` abbricht; der
  Abbruch zählt in `http_req_failed` und ist nicht als Fehler zu lesen (`name:event stream`).

## Offen

- Steigerung bis zum Bruch (mehr als 200 Nutzer, mehr als 80 Anmeldungen/s), Dauerlauf, Schwellen festlegen.
- Rauchtest in der CI (Plan: nur dieser läuft dort): ein Job `load-smoke` fehlt noch; die Workflow-Datei lässt sich ohnehin erst pushen, wenn der Token den Scope `workflow` hat.

## Mehrere Instanzen

Entscheidung: **Der MVP bleibt bei einer Instanz.** Die Messung zeigt keinen Engpass, der mehr Prozesse nötig machte.

Was im Prozess lebt und eine zweite Instanz brechen würde: die Tabelle der aktiven Läufe (Abbruch, Freigabe), die Zuhörer der
Ereigniskanäle (`RunEventsService`, Ereignisse selbst stehen in der Datenbank), das Fenster des Minuten-Limiters und das
Gedächtnis der Tools je Unterhaltung. Alles ist nach Nutzer geschnitten (ein aktiver Lauf je Nutzer).

Weg zu mehreren Instanzen ohne Redis, wenn es nötig wird:

1. Feste Zuordnung eines Nutzers zu einer Instanz über den Proxy: beim Anmelden setzt der Server ein zweites, nicht geheimes
   Cookie mit `hash(userId) mod N`, der Proxy verteilt danach. Dann bleiben aktiver Lauf, Kanäle und Limiter-Fenster in einem
   Prozess; Sitzungen und der Tageszähler liegen ohnehin in der Datenbank.
2. Erst wenn die Zuordnung nicht reicht (z. B. Läufe ohne Nutzerbindung): Ereignisse über Postgres `LISTEN/NOTIFY` (nur
   Unterhaltungs-ID und Nummer, den Inhalt lädt der Empfänger aus der Tabelle) und Abbruch/Freigabe als Befehle über denselben
   Kanal. Redis bleibt damit außerhalb des Stacks.
