#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const checks = [
    {
        file: path.join(
            root,
            "src",
            "app",
            "components",
            "layout",
            "Navbar.tsx",
        ),
        mustInclude: [
            "WORKBENCH.nav.root",
            "WORKBENCH.nav.workbenchSurface",
            "WORKBENCH.nav.workbenchShell",
        ],
    },
    {
        file: path.join(
            root,
            "src",
            "modules",
            "dashboard",
            "components",
            "TorrentTable.tsx",
        ),
        mustInclude: [
            "TABLE.hostRoot",
            "TABLE.workbenchSurface",
            "TABLE.workbenchShell",
        ],
    },
    {
        file: path.join(
            root,
            "src",
            "app",
            "components",
            "layout",
            "StatusBar.tsx",
        ),
        mustInclude: [
            "WORKBENCH.status.footer",
            "WORKBENCH.status.workbenchSurface",
        ],
    },
];

const failures = [];

for (const check of checks) {
    const rel = path.relative(root, check.file);
    if (!fs.existsSync(check.file)) {
        failures.push(`${rel}: file missing`);
        continue;
    }
    const source = fs.readFileSync(check.file, "utf8");
    for (const token of check.mustInclude) {
        if (!source.includes(token)) {
            failures.push(`${rel}: missing token '${token}'`);
        }
    }
}

if (failures.length > 0) {
    console.error("\nWorkbench consumer parity violations:\n");
    for (const failure of failures) {
        console.error(` - ${failure}`);
    }
    console.error(
        "\nFix by composing nav/table/status roots with the shared workbench token authorities.",
    );
    process.exit(2);
}

console.log("Workbench consumer check: token consumption contract satisfied.");
