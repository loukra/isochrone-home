# macOS-Hülle

Optional, **nur für macOS**. Für den Betrieb der App wird dieser Ordner nicht
gebraucht: Auf allen Betriebssystemen genügt `npm run build` und `npm start`,
danach http://localhost:3001 im Browser.

Was hier liegt, ist eine schlanke Hülle um genau diesen Server: ein Fenster
(`WKWebView`), das die Oberfläche anzeigt, und der Node-Prozess als Kind
dahinter. Fenster zu heißt Server aus — das ist ein Gerät, das man an- und
ausschaltet, kein Editor, bei dem das Programm zwischen zwei Dokumenten stehen
bleibt.

| Datei | Zweck |
| --- | --- |
| `LocationOptimizer.swift` | Fenster, Kindprozess, Aufräumen, Menü |
| `build-app.sh` | baut Oberfläche und `.app`, trägt die Pfade ein |

Bauen mit `npm run app` im Projektordner. Ergebnis ist `LocationOptimizer.app`
eine Ebene höher (gitignored).

## Warum sie nicht weitergebbar ist

Projektpfad und Node-Pfad werden beim Bauen fest in die `Info.plist`
geschrieben, und die App ist nur ad-hoc signiert. Sie läuft deshalb genau auf
dem Rechner, auf dem sie gebaut wurde. Wird das Projekt verschoben, einmal
`npm run app` wiederholen.

Der Grund für die festen Pfade: Eine aus dem Finder gestartete App erbt die
Shell-Umgebung **nicht** — kein Homebrew, kein `nvm`, kein `PATH`. Wer das
übersieht, baut eine App, die im Terminal läuft und per Doppelklick wortlos
nichts tut.

## Für Windows

Bewusst nicht gebaut. Der Weg über `npm start` und den Browser funktioniert dort
vollständig; der Server selbst enthält keine Mac-Annahmen. Eine
Doppelklick-Variante für Windows bräuchte Electron oder Tauri und damit einen
zweiten Codebestand für dieselbe Aufgabe — das lohnt erst, wenn jemand es
wirklich braucht.

Die Details zu den Entscheidungen (fester Port, Aufräumen bei „Sofort beenden",
Fehlerdialoge) stehen in `CLAUDE.md` unter „Mac-App (lokaler Betrieb)".
