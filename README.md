# DUELIST – Arcade Edition

Pixel-Duelle in der Arena über den Wolken. Läuft im Browser auf PC und Handy – komplett offline.

**Spielen:** https://mads000.github.io/Duelist/
Auf dem Handy: Seite öffnen → „Zum Startbildschirm hinzufügen“ → startet wie eine App, auch ohne Internet.

## Modi
- **Arcade** – 5 Gegner mit steigender Schwierigkeit, dann der Endboss. Punkte, Continue, Highscore mit Initialen. Wer durchkommt, schaltet einen geheimen Champion frei.
- **Gegen Bot** – freies Duell, 4 Bot-Stufen, Map und Chaos-Modus (Bombenregen) wählbar
- **Lokales Duell** – 2 Spieler an einem Gerät (Tastatur, Gamepads oder Handy als Controller)
- **Survival** – ein Lebensbalken, endlos Gegner, jeder 5. ist ein Boss
- **Training** – Trainingspuppe (steht / blockt / kämpft), unendliche Energie

## Handy als Controller
Im Menü „Handy als Controller“ öffnen → QR-Code mit dem Handy scannen. Das erste Handy steuert Spieler 1, ein zweites Spieler 2.
So kann z. B. einer am Handy und einer an der PC-Tastatur spielen – oder das Spiel läuft am PC/Fernseher und das Handy ist nur der Controller.

## Kampfsystem
| | Gegen Bot | Spieler 1 | Spieler 2 | Gamepad |
|---|---|---|---|---|
| Bewegen | WASD / Pfeile | WASD | Pfeile / IJKL | Stick |
| Leichter Angriff | J / E | E | Num1 / O | A |
| Schwerer Angriff | K / F | F | Num2 / P | X / RT |
| Ausweichen (Dash) | L / Leertaste | Q | Num3 / U | B / LB |
| Spezial | I / R | R | Num0 / H | Y / RB |

- **Kombo:** Leicht → Leicht → Schwer
- **Blocken:** vom Gegner weg drücken. Kurz vor dem Treffer = **Perfekt-Block** (Gegner taumelt)
- **Schwere Angriffe** brechen die Deckung · **Konter** beim Ausholen = +40 % Schaden

## Lokal starten
- Windows: `DUELIST starten.bat` doppelklicken
- oder: `npm install` und `npm start` → http://localhost:8080

## Werkzeuge
- `node tools/make_sw.cjs` – aktualisiert die Offline-Dateiliste (nach Änderungen ausführen)
- `python tools/make_maps.py` – erzeugt die Maps Vulkanschmiede und Frostgipfel aus der Original-Arena

Schulprojekt von Mads Lahme. Grafiken: *Tiny RPG Character Asset Pack*.
