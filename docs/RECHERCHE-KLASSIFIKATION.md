# Recherche: Klassifikations- und Entscheidungs-APIs

Stand 2026-10-09. Auftrag: fachlicher Nutzen von „Jev“ und der „Decision API“ von OpenAI, Umsetzung bei uns, Alternativen, und ob
ein kleines Modell wie Claude Haiku 5.5 mithalten kann. Die Recherche lief über Web-Quellen; was nicht belegt werden konnte,
steht unter „Nicht verifiziert“. Preise und Latenzen sind Herstellerangaben, keine eigenen Messungen.

## Was die beiden Produkte sind

- **Jev** (TypeSafe AI, Modell `jev-1.13`): ein nicht generatives Entscheidungsmodell („System One“). Es beantwortet Fragen zu
  einem Text mit kalibrierten Wahrscheinlichkeiten. Fragetypen: Choice, Score, YesNo (laut Pipecat-Doku). Nur Text, Kontext
  32K–64K. Preis laut Homepage 0,042 USD je 1 Mio. Input-Token, Antworten angeblich ohne Output-Kosten. Latenz je nach Quelle
  0,11–0,34 s. Status „early access“; Quellen widersprechen sich (Warteliste oder allgemein verfügbar). Eigene Doku nennt
  Schwächen: Neigung zur ersten Option, schwach kalibrierte Scores, irrelevanter Kontext senkt die Genauigkeit.
- **OpenAI Decisions API** (`POST /v1/decisions`, Modell `gpt-6-luna`): dieselbe Idee. Fragetypen `predicate`
  (Wahrscheinlichkeit), `choice` (Auswahl mit Wahrscheinlichkeiten und Confidence), `score`. Unabhängige Fragen laufen in einem
  Request. Public Beta seit 2026-10-06, allgemeine Verfügbarkeit „in den nächsten Wochen“. Preis laut Guide 0,10 USD je 1 Mio.
  Input, Output nicht berechnet. Herstellerangabe: ca. 150 ms statt 1,6 s über die Responses API.

Der fachliche Nutzen beider: ein **schneller, billiger, strukturierter Ja/Nein- oder Auswahl-Entscheid mit Wahrscheinlichkeit**
statt eines Freitextes, den man erst parsen muss. Das passt für Entscheidungen im Pfad einer Anfrage, bei denen jede
Sekunde und jeder Cent zählt.

## Alternativen

| Produkt | Art | Preis (je 1 Mio. Token) | Anmerkung |
| --- | --- | --- | --- |
| Claude Haiku 5.5 | kleines LLM, JSON-Schema/Enum | 0,10 in / 0,50 out | Latenz nicht gemessen (Haiku 4.5 als Anhaltspunkt: ca. 0,8 s bis zum ersten Token); Verfügbarkeit selbst prüfen |
| Gemini Flash-Lite | kleines LLM | 0,10 / 0,40 (2.5), neuere Stufen teurer | Free Tier, dort Limits pro Minute und Tag knapp |
| GPT-5-nano | kleines LLM | 0,05 / 0,40 | günstigste gelistete Option |
| OpenAI Decisions | Klassifikation | 0,10 in | Beta, nur `gpt-6-luna` |
| TypeSafe Jev | Klassifikation | 0,042 in | Early Access |
| OpenAI omni-moderation | Moderation | kostenlos | Inhaltskategorien, keine Prompt-Injection |
| Llama Prompt Guard 2 86M | Injection/Jailbreak, binär | selbst gehostet | 512-Token-Fenster, Llama-Lizenz, ca. 92 ms auf A100 |
| ProtectAI deberta-v3 injection-v2 | Injection, binär | selbst gehostet | Apache-2.0, archiviert, nur Englisch |
| Llama Guard 4 12B | Safety, 14 Kategorien | selbst gehostet, GPU | Text + Bild |
| Azure Prompt Shields / Google Model Armor | Cloud-APIs | nach Datensatz bzw. ab 0,10 | Preise nur aus Sekundärquellen |

## Kann Haiku 5.5 mithalten?

Für unsere möglichen Einsatzorte:

1. **Risiko eines Shell-Befehls oder Tool-Aufrufs vor der Freigabe:** Als *zweite Meinung* ja, als alleinige Instanz nein. Ein LLM
   versteht Kontext (`rm -rf build/` ist etwas anderes als `rm -rf ~`), ist aber nicht deterministisch und liefert keine
   verlässliche Wahrscheinlichkeit. Regeln (Sperrliste, Modus-Matrix) bleiben die erste Schicht und werden nie überstimmt.
2. **Prompt-Injection in Repository-Inhalten und Tool-Ausgaben:** Hier gewinnt ein **dedizierter Klassifikator** (Millisekunden,
   keine Token-Kosten, deterministisch). Ein Allzweck-LLM liest die Injection selbst und kann ihr folgen.
3. **Routing leicht/schwer:** Ein LLM-Router kostet einen zusätzlichen Roundtrip; Heuristik oder Embeddings sind schneller.
   Decisions/Jev (150–340 ms) wären interessant, die Zahlen sind aber nur Herstellerangaben.
4. **Titel, Zusammenfassung:** Kein Klassifikator nötig, jedes billige Modell reicht (heute bereits einfache Regel aus der
   ersten Nachricht).
5. **Missbrauchsschutz bei offener Registrierung:** Moderation (kostenlos) deckt Inhalte ab, nicht Bot-Anmeldungen. Dafür
   gelten Rate-Limits und E-Mail-Bestätigung (seit Slice 8 vorhanden).

Wo ein dedizierter Klassifikator gewinnt: Latenz, Kosten bei hohem Volumen, Determinismus, Wahrscheinlichkeiten für
Schwellenwerte, Training auf eigenen Labels. Wo ein kleines LLM gewinnt: kein Betrieb, versteht neue Fälle ohne Training,
ein Anbieter und ein Key. Ein Modell mit Anfrage-Pfad-Latenz von etwa einer Sekunde ist für Entscheidungen *vor jeder Freigabe*
spürbar; für Entscheidungen *im Hintergrund* (Shadow Mode, Bewertung) ist es egal.

## Empfehlung für uns

Nichts davon ist für den MVP nötig; die Freigabe durch den Nutzer bleibt der Schutz. Wenn es kommt:

- **Ports und Adapter**, wie beim `ModelProvider`: `CommandRiskPort` und `InjectionScanPort` im Agent-Loop, ohne HTTP-Wissen.
  Adapter in dieser Reihenfolge: regelbasiert (immer an), danach ein LLM-Adapter (nutzt den Key des Nutzers, Modell-ID nur in
  der Config), später ein Klassifikator-Adapter (Decisions/Jev/Prompt Guard).
- **Fail-closed:** Timeout oder Fehler heißt „fragen“. Ein Klassifikator darf nie eine Sperre der Regeln aufheben; er darf nur
  von „fragen“ zu „automatisch“ lockern, wenn die Regeln es erlauben.
- **Zuerst ein Bewertungsdatensatz** (300–500 gelabelte Fälle aus eigenen Sitzungen mit geschwärzten Secrets, dazu Gefahrenbefehle
  und Injection-Beispiele), als Opt-in-Skript außerhalb der Unit-Tests. Kennzahlen: Recall für „gefährlich“ (wichtiger als
  Precision), Fehlalarmrate, p95-Latenz, Kosten je 1000 Entscheidungen.
- **Shadow Mode:** Der Klassifikator läuft mit und entscheidet nicht; geloggt werden nur Label und Hash, nie Inhalte oder Keys.
- **Datenschutz und Limits:** Jev und Decisions bekämen Shell-Befehle und Repo-Inhalte, das ist eine Weitergabe an Dritte und
  muss in der Datenschutzerklärung stehen. Im Gemini Free Tier zählt jeder Klassifikator-Aufruf gegen die knappen
  Minuten- und Tageslimits des Nutzers.

## Nicht verifiziert

Status und Output-Preis von Jev; Output-Preis der Decisions API (nur Zusammenfassung des Guides); Latenz und Verfügbarkeit von
Haiku 5.5; Free-Tier-Limits von Gemini; Preise von Azure und Model Armor; Logprobs bei Claude und Gemini. Vor einer Entscheidung
diese Punkte prüfen und mit dem eigenen Bewertungsdatensatz messen.

## Quellen

- Jev: https://docs.typesafe.ai/model-jaggedness/jev-1.13 · https://docs.pipecat.ai/api-reference/server/classifiers/jev.md · https://typesafe.ai
- OpenAI: https://developers.openai.com/api/docs/guides/decisions · https://developers.openai.com/api/docs/changelog · https://developers.openai.com/api/docs/pricing · https://developers.openai.com/api/docs/guides/moderation
- Anthropic: https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Google: https://ai.google.dev/gemini-api/docs/pricing · https://ai.google.dev/gemini-api/docs/rate-limits · https://cloud.google.com/security/products/model-armor
- Klassifikatoren: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M · https://huggingface.co/meta-llama/Llama-Guard-4-12B · https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2
