# Spike-Ergebnisse

Ergebnisse des Spikes aus Slice 1 (2026-10-09). Der Spike-Code liegt in [spikes/](../spikes/) und ist Wegwerf-Code. Rohdaten
stehen lokal unter `spikes/results/` (nicht im Repo); ein vollständiger Lauf liegt als Fixture unter
[spikes/fixtures/](../spikes/fixtures/).

**Frage:** Löst `gemini-3.5-flash-lite` im Free Tier eine kleine echte Aufgabe mit Function Calling, was kostet sie, und nimmt
die API unsere Tool-Schemas an?

## Aufbau

- Plain `fetch` gegen `streamGenerateContent?alt=sse`, kein SDK, damit die rohen Antworten als Fixtures taugen.
- Sechs Tools nach den Verträgen aus dem Plan (einfache Umsetzung; `search` ohne ripgrep, `run_command` nur für `npm test` und
  `node --test`, ohne Umgebungsvariablen des Prozesses).
- Aufgabe: Ein Projekt mit fünf kleinen Dateien und vier Tests, ein Test schlägt fehl (Rabatt ab 10 Stück greift erst ab 11).
  Auftrag: „The tests fail. Find the cause and fix it in the source code. Do not change the tests.“
- Abstand von mindestens 4,5 s zwischen Anfragen (Minutenlimit 15), Obergrenze 120 Anfragen, Verlauf unverändert zurückgegeben.
- Insgesamt wurden 32 Anfragen verbraucht (3 Schema-Probe, 7 Vorlauf, 22 für die drei gewerteten Läufe).

## Ergebnis

| Lauf | Tests grün | Tests geändert | Schritte (= Anfragen) | Zeit  | Eingabe-Tokens | Ausgabe-Tokens |
| ---- | ---------- | -------------- | --------------------- | ----- | -------------- | -------------- |
| 1    | ja         | nein           | 7                     | 28 s  | 12.571         | 233            |
| 2    | ja         | nein           | 7                     | 31 s  | 12.472         | 210            |
| 3    | ja         | nein           | 8                     | 36 s  | 14.888         | 234            |

Der Vorlauf (gleiche Aufgabe, nicht gewertet) endete ebenfalls grün mit 7 Schritten und 12.491 Eingabe-Tokens.

## Befunde

- **Die Aufgabe gelingt.** Vier von vier Läufen, immer nach demselben Muster: Tests starten, Dateien auflisten, zwei Dateien
  lesen, eine Änderung, Tests erneut, Zusammenfassung. Kein Tool-Fehler, keine geänderten Tests, nie mehrere Aufrufe in einer
  Antwort.
- **Kosten je Aufgabe:** 7 bis 8 Anfragen, 12.500 bis 15.000 Eingabe-Tokens (der Verlauf wird jedes Mal neu gesendet: 874 Tokens
  im ersten Schritt, 2.495 im letzten), rund 220 Ausgabe-Tokens. Beim Tageslimit von 500 Anfragen sind das etwa 60 solcher
  Aufgaben pro Google-Projekt und Tag. Das Tokenlimit (250.000 pro Minute) ist nicht das Problem.
- **Das Minutenlimit ist es.** Eine Anfrage dauert 0,5 bis 0,9 s (Median 0,7 s, erstes Chunk höchstens 0,8 s). Ohne Pause würde
  der Agent in einer Minute weit über 15 Anfragen senden. Der Rate-Limiter muss also pacen, nicht nur zählen; mit 4,5 s Abstand
  dauert ein Lauf rund 30 s.
- **Form des Stroms:** Ein Tool-Aufruf kommt vollständig in einem Chunk (Argumente als fertiges Objekt, nicht in Teilen), im
  selben Teil steht `thoughtSignature`. Ein zweiter Chunk bringt einen leeren Textteil mit `finishReason: STOP`. Die Endantwort
  kommt in mehreren Textchunks (hier fünf); die Signatur steht am letzten, leeren Textteil. Der Aufruf trägt ein Feld `id`
  (`call_…`); die Antwort ohne `id` im `functionResponse` wurde akzeptiert.
- **Verlauf unverändert zurückgeben funktioniert:** Alle Teile in Ankunftsreihenfolge, ohne Zusammenfassen, ohne 400.
- **Schemas:** Die API nahm alle drei Varianten von `z.toJSONSchema()` an: unverändert, ohne `$schema`, ohne `$schema` und
  `additionalProperties`. Der Adapter kann die Ausgabe von Zod direkt senden.
- **Denk-Tokens:** Im Standardbetrieb meldet Flash-Lite keine (`thoughtsTokenCount` fehlt). Ob sie gegen das Minutenlimit
  zählen, ist damit offen, solange kein Denken eingeschaltet wird.
- **Latenz ohne Ausreißer:** 22 Anfragen, die langsamste dauerte 0,95 s. Im Chat-Spike von `notebooklm-klon` gab es noch Anfragen
  mit 6 bis 17 s; das trat hier nicht auf.

## Entscheidung

Der Plan trägt mit Flash-Lite im Free Tier für diese Aufgabenklasse. Es geht mit Slice 0 und 2 weiter, ohne Wechsel von Modell
oder Anbieter. Der Rate-Limiter bekommt als feste Anforderung, Anfragen zu strecken (Mindestabstand aus dem Minutenlimit), und
die Tool-Verträge bleiben wie geplant.

## Grenzen und offene Punkte

- **Eine einfache Aufgabe:** ein Fehler, fünf Dateien, ein klarer Testfehler; in allen Läufen derselbe Ablauf. Ob Flash-Lite bei
  größeren Repos, unklaren Fehlern oder längeren Verläufen trägt, ist nicht gemessen. Der Verlauf wächst mit jedem Schritt; eine
  größere Aufgabe lässt den Kontext schnell anwachsen.
- **Kein 429 aufgetreten.** Ob der Body Minuten- und Tageslimit unterscheidet und eine Wartezeit nennt, ist unbeantwortet. Der
  Spike protokolliert es, sobald es vorkommt (`spikes/results/limits.jsonl`); der Adapter in Slice 5 muss es ohnehin tun.
- **Nie mehrere Aufrufe in einer Antwort** und kein Fehlerfall im Tool-Ablauf (falsche Argumente, wiederholter Fehlschlag):
  nicht gemessen.
- **Vereinfachte Tools:** `search` ohne ripgrep, keine Realpath-Prüfung, `run_command` nur für Testbefehle. Das Verhalten mit
  echten Befehlen ist offen.
- **Kontingent pro Projekt:** Unklar bleibt, ob der Key aus demselben Google-Projekt wie der von `notebooklm-klon` stammt; dann
  teilen sich beide die 500 Anfragen am Tag.
- **Momentaufnahme:** `gemini-3.5-flash-lite` und die Limits des Free Tiers am 2026-10-09.
