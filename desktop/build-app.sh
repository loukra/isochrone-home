#!/bin/bash
#
# Baut LocationOptimizer.app.
#
# Die App ist eine Hülle: ein Fenster, das die Oberfläche anzeigt, und ein
# Node-Prozess dahinter. Sie enthält den Quelltext *nicht*, sondern verweist auf
# diesen Projektordner -- deshalb werden Projekt- und Node-Pfad hier fest in die
# Info.plist geschrieben. Wird das Projekt verschoben, muss die App neu gebaut
# werden.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$PROJECT_DIR/Wohnzone.app"
NODE_PATH="$(command -v node || true)"
ARCH="$(uname -m)"

if [ -z "$NODE_PATH" ]; then
  echo "Node.js wurde nicht gefunden. Installiere es z. B. mit: brew install node" >&2
  exit 1
fi

echo "==> Oberfläche bauen"
cd "$PROJECT_DIR"
npm run build

echo "==> Bundle anlegen"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>Wohnzone</string>
	<key>CFBundleDisplayName</key>
	<string>Wohnzone</string>
	<key>CFBundleExecutable</key>
	<string>LocationOptimizer</string>
	<key>CFBundleIdentifier</key>
	<string>de.louiskrause.location-optimizer</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>0.1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<!-- macOS blockiert unverschlüsseltes HTTP. Der Server läuft auf localhost;
	     ohne diesen Eintrag bliebe das Fenster weiß. -->
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<!-- Vom Build-Skript eingetragen: Eine aus dem Finder gestartete App erbt
	     die Shell-Umgebung nicht und fände Node sonst nie. -->
	<key>LOProjectDirectory</key>
	<string>$PROJECT_DIR</string>
	<key>LONodePath</key>
	<string>$NODE_PATH</string>
</dict>
</plist>
PLIST

echo "==> Swift übersetzen"
swiftc -O \
  -target "$ARCH-apple-macos13.0" \
  -framework AppKit -framework WebKit \
  -o "$APP/Contents/MacOS/LocationOptimizer" \
  "$PROJECT_DIR/desktop/LocationOptimizer.swift"

# Ad-hoc-Signatur: nicht für die Weitergabe, aber ohne sie beschwert sich
# macOS bei jedem Start über ein "beschädigtes" Programm.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo ""
echo "Fertig: $APP"
echo "Node:   $NODE_PATH"
