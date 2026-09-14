import AppKit
import WebKit

// MARK: - Vom Build-Skript eingetragene Pfade

/// Projektordner und Node-Pfad stehen in der Info.plist, weil eine aus dem
/// Finder gestartete App die Shell-Umgebung *nicht* erbt: kein Homebrew, kein
/// nvm, kein PATH. Wer sich darauf verlässt, baut eine App, die im Terminal
/// läuft und per Doppelklick wortlos nichts tut.
enum Build {
    static func value(_ key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? ""
    }

    static var projectDirectory: String { value("LOProjectDirectory") }

    /// Der beim Bauen gefundene Node, danach die üblichen Orte als Rückfall --
    /// falls Homebrew zwischendurch umzieht.
    static var nodeCandidates: [String] {
        [value("LONodePath"), "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
            .filter { !$0.isEmpty }
    }
}

// MARK: - Der Serverprozess

/// Startet den Node-Server als Kindprozess und räumt ihn wieder weg.
final class ServerController {
    private var process: Process?
    /// Muss am Leben bleiben: Solange dieses Ende offen ist, weiss das Kind,
    /// dass die App noch da ist.
    private var parentPipe: Pipe?
    private var outputBuffer = ""
    private var errorOutput = ""
    private var hasReported = false

    private let readyPrefix = "location-optimizer:ready"

    /// Liegt ausserhalb des Projekts, damit ein `rm -rf .cache` oder ein
    /// Neubau sie nicht mitnimmt.
    private var pidFileURL: URL {
        let base = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocationOptimizer", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("server.pid")
    }

    // MARK: Start

    func start(onReady: @escaping (URL) -> Void, onFailure: @escaping (String) -> Void) {
        killStaleServer()

        guard let node = Build.nodeCandidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            onFailure("""
                Node.js wurde nicht gefunden.

                Gesucht an: \(Build.nodeCandidates.joined(separator: ", "))

                Installiere Node (z. B. mit `brew install node`) und baue die App \
                mit `npm run app` neu.
                """)
            return
        }

        let cli = Build.projectDirectory + "/node_modules/tsx/dist/cli.mjs"

        guard FileManager.default.fileExists(atPath: cli) else {
            onFailure("""
                Die Abhängigkeiten fehlen.

                Erwartet: \(cli)

                Führe im Projektordner `npm install` aus und baue die App mit \
                `npm run app` neu.
                """)
            return
        }

        let task = Process()
        task.executableURL = URL(fileURLWithPath: node)
        task.arguments = [cli, Build.projectDirectory + "/src/api/server.ts"]
        task.currentDirectoryURL = URL(fileURLWithPath: Build.projectDirectory)

        var environment = ProcessInfo.processInfo.environment
        // Fest, nicht zufällig: Der localStorage der Oberfläche hängt am
        // Origin, und dazu gehoert der Port. Ein wechselnder Port hieße bei
        // jedem Start ein leerer Speicher -- Ziele, Zeiten und Haken weg.
        // 3456 kollidiert mit nichts im Projekt (3001 Backend, 5173 Vite).
        environment["PORT"] = "3456"
        environment["LOCATION_OPTIMIZER_PARENT_PIPE"] = "1"
        task.environment = environment

        let input = Pipe()
        let output = Pipe()
        let errors = Pipe()
        task.standardInput = input
        task.standardOutput = output
        task.standardError = errors
        parentPipe = input

        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            guard let text = String(data: handle.availableData, encoding: .utf8), !text.isEmpty else { return }
            self?.consumeOutput(text, onReady: onReady)
        }

        errors.fileHandleForReading.readabilityHandler = { [weak self] handle in
            guard let text = String(data: handle.availableData, encoding: .utf8), !text.isEmpty else { return }
            DispatchQueue.main.async { self?.errorOutput += text }
        }

        task.terminationHandler = { [weak self] finished in
            DispatchQueue.main.async {
                guard let self, !self.hasReported else { return }
                self.hasReported = true
                let details = self.errorOutput.trimmingCharacters(in: .whitespacesAndNewlines)
                onFailure(details.isEmpty
                    ? "Der Server hat sich sofort beendet (Code \(finished.terminationStatus))."
                    : details)
            }
        }

        do {
            try task.run()
        } catch {
            onFailure("Der Server liess sich nicht starten: \(error.localizedDescription)")
            return
        }

        process = task
        try? String(task.processIdentifier).write(to: pidFileURL, atomically: true, encoding: .utf8)

        // Antwortet nach einer halben Minute nichts, stimmt etwas grundsätzlich
        // nicht -- besser eine Meldung als ein Fenster, das ewig "Starte …" zeigt.
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            guard let self, !self.hasReported else { return }
            self.hasReported = true
            let details = self.errorOutput.trimmingCharacters(in: .whitespacesAndNewlines)
            onFailure("Der Server hat nicht innerhalb von 30 Sekunden geantwortet."
                + (details.isEmpty ? "" : "\n\n\(details)"))
        }
    }

    /// Sucht zeilenweise die Bereitschaftsmeldung -- `availableData` kann mitten
    /// in einer Zeile enden, deshalb der Puffer.
    private func consumeOutput(_ text: String, onReady: @escaping (URL) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.outputBuffer += text

            while let breakIndex = self.outputBuffer.firstIndex(of: "\n") {
                let line = String(self.outputBuffer[..<breakIndex])
                self.outputBuffer = String(self.outputBuffer[self.outputBuffer.index(after: breakIndex)...])

                guard line.hasPrefix(self.readyPrefix) else { continue }

                let port = line.dropFirst(self.readyPrefix.count).trimmingCharacters(in: .whitespaces)

                guard !self.hasReported, let url = URL(string: "http://localhost:\(port)/") else { continue }

                self.hasReported = true
                onReady(url)
            }
        }
    }

    // MARK: Aufräumen

    func stop() {
        // Das Schliessen der Pipe allein genügt dem Kind schon; SIGTERM ist nur
        // der schnellere Weg für den geordneten Fall.
        process?.terminate()
        parentPipe = nil
        process = nil
        try? FileManager.default.removeItem(at: pidFileURL)
    }

    /// Zweite Sicherung für den Fall, dass die App abgeschossen wurde, bevor
    /// irgendein Aufräumen laufen konnte.
    private func killStaleServer() {
        guard
            let raw = try? String(contentsOf: pidFileURL, encoding: .utf8),
            let pid = Int32(raw.trimmingCharacters(in: .whitespacesAndNewlines))
        else { return }

        defer { try? FileManager.default.removeItem(at: pidFileURL) }

        guard kill(pid, 0) == 0 else { return }
        // PIDs werden wiederverwendet: erst prüfen, ob das wirklich unser
        // Server ist, sonst erschlägt ein Neustart irgendeinen fremden Prozess.
        guard commandLine(of: pid).contains(Build.projectDirectory) else { return }

        kill(pid, SIGTERM)
        usleep(300_000)
    }

    private func commandLine(of pid: Int32) -> String {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/ps")
        task.arguments = ["-p", String(pid), "-o", "command="]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()

        guard (try? task.run()) != nil else { return "" }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()
        return String(data: data, encoding: .utf8) ?? ""
    }
}

// MARK: - Fehler der Seite sichtbar machen

/// Reicht Fehler aus der Oberfläche an `stderr` weiter.
///
/// Ohne das ist ein kaputtes Bundle unsichtbar: Das Fenster bleibt einfach
/// leer. Genau so ist eine fehlende Worker-Datei von MapLibre durchgerutscht --
/// im Browser stand die Ursache in der Konsole, in der App nirgends.
final class PageLogBridge: NSObject, WKScriptMessageHandler {
    static let name = "locationOptimizerLog"

    /// Läuft vor allem anderen auf der Seite und fängt auch Fehler ab, die
    /// bereits beim Laden des Bundles auftreten.
    static let script = """
        (() => {
          const send = (text) => {
            try { window.webkit.messageHandlers.\(name).postMessage(String(text)); } catch {}
          };
          const original = console.error;
          console.error = (...args) => { send(args.join(" ")); original.apply(console, args); };
          window.addEventListener("error", (event) => {
            send(event.message + " (" + (event.filename || "?") + ":" + event.lineno + ")");
          });
          window.addEventListener("unhandledrejection", (event) => {
            send("Unbehandelte Zusage: " + event.reason);
          });
        })();
        """

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String else { return }
        FileHandle.standardError.write("[Seite] \(text)\n".data(using: .utf8) ?? Data())
    }
}

// MARK: - Region des Rechners an die Seite reichen

/// Reicht das Land, in dem der Rechner steht, an die Oberfläche weiter.
///
/// Nötig, weil die WKWebView es **falsch** meldet. Gemessen am 14.09.2026 auf
/// diesem Rechner: Steht macOS auf englischer Sprache in einem
/// nicht-englischen Land (`en-DE`, eine reale und verbreitete Einstellung),
/// liefert `navigator.language` in der App `en-GB` -- WebKit bildet die
/// Kombination auf das nächstgelegene Standard-Englisch ab und **erfindet
/// dabei die Region**. Die Oberfläche entschiede daraufhin auf Meilen und
/// schriebe "Deutschland" hinter jedes Ziel, auf einem Rechner in Deutschland.
///
/// Es liegt nicht am Bundle: `CFBundleDevelopmentRegion`,
/// `CFBundleLocalizations` und echte `.lproj`-Ordner wurden einzeln
/// durchprobiert und ändern nichts. Reine Standardkombinationen kommen dagegen
/// richtig an (`de-DE` -> `de-DE`, `en-US` -> `en-US`) -- betroffen ist genau
/// die Mischung aus Sprache und fremdem Land.
///
/// Foundation weiß es richtig (`Locale.current.region` -> `DE`), also reicht
/// die Hülle es herüber. Die Sprache bleibt unangetastet: Die kommt in allen
/// gemessenen Fällen korrekt an, und die Oberfläche hat dafür ohnehin einen
/// Schalter.
enum HostRegionScript {
    /// Leer, wenn die Region unbrauchbar ist -- die Seite fällt dann auf ihre
    /// eigene Erkennung zurück, statt einen erfundenen Wert zu bekommen.
    static var source: String {
        guard let region = Locale.current.region?.identifier,
              region.count <= 3,
              region.allSatisfy({ $0.isLetter || $0.isNumber })
        else { return "" }

        return "window.__hostRegion = \"\(region)\";"
    }
}

// MARK: - Fenster und Ablauf

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let server = ServerController()
    private let logBridge = PageLogBridge()
    private var window: NSWindow!
    private var webView: WKWebView!
    private var spinner: NSProgressIndicator!

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()

        server.start(
            onReady: { [weak self] url in self?.show(url) },
            onFailure: { [weak self] message in self?.fail(message) }
        )
    }

    /// Fenster zu heisst Server aus. Auf dem Mac unüblich, hier richtig: Das
    /// ist ein Gerät, das man an- und ausschaltet, kein Editor, bei dem das
    /// Programm zwischen zwei Dokumenten stehen bleibt.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    // MARK: Aufbau

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Wohnzone"
        window.minSize = NSSize(width: 900, height: 600)
        window.setFrameAutosaveName("LocationOptimizerWindow")
        window.center()
        window.contentView = startingView()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func startingView() -> NSView {
        let container = NSView()

        let label = NSTextField(labelWithString: "Starte Wohnzone …")
        label.font = .systemFont(ofSize: 15)
        label.textColor = .secondaryLabelColor
        label.translatesAutoresizingMaskIntoConstraints = false

        spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.controlSize = .small
        spinner.startAnimation(nil)
        spinner.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(spinner)
        container.addSubview(label)

        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: container.centerYAnchor, constant: -18),
            label.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            label.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 14),
        ])

        return container
    }

    private func show(_ url: URL) {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(logBridge, name: PageLogBridge.name)
        configuration.userContentController.addUserScript(
            WKUserScript(source: PageLogBridge.script, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        // Muss vor dem Bundle laufen: Die Oberfläche liest die Region beim
        // Laden einmal aus und fragt danach nicht erneut.
        let regionScript = HostRegionScript.source
        if !regionScript.isEmpty {
            configuration.userContentController.addUserScript(
                WKUserScript(source: regionScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }
        // Voreinstellung ist bereits persistent -- hier nur festgehalten, weil
        // genau daran der localStorage der Oberfläche hängt (Ziele, Zeiten,
        // Häkchen). Ein nicht-persistenter Store würde sie bei jedem Start
        // verlieren.
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.allowsBackForwardNavigationGestures = false
        // Erlaubt "Entwickler > LocationOptimizer" in Safari, wenn doch einmal
        // etwas genauer nachzusehen ist.
        if #available(macOS 13.3, *) { webView.isInspectable = true }

        spinner?.stopAnimation(nil)
        window.contentView = webView
        webView.load(URLRequest(url: url))
    }

    private func fail(_ message: String) {
        spinner?.stopAnimation(nil)

        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Wohnzone konnte nicht starten"
        alert.informativeText = message
        alert.addButton(withTitle: "Beenden")
        alert.runModal()
        NSApp.terminate(nil)
    }

    @objc private func reload() {
        webView?.reload()
    }

    // MARK: Menü

    /// Ohne Menü gäbe es kein ⌘Q, kein ⌘W -- und vor allem kein Einfügen in
    /// das Adressfeld der Oberfläche.
    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Wohnzone ausblenden", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Wohnzone beenden", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Bearbeiten")
        editMenu.addItem(withTitle: "Widerrufen", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Wiederholen", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Ausschneiden", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Kopieren", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Einsetzen", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Alles auswählen", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "Darstellung")
        viewMenu.addItem(withTitle: "Neu laden", action: #selector(reload), keyEquivalent: "r")
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Fenster")
        windowMenu.addItem(withTitle: "Schliessen", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenu.addItem(withTitle: "Im Dock ablegen", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)

        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
