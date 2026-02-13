#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(
    root,
    "src",
    "shared",
    "ui",
    "layout",
    "glass-surface.ts",
);
const source = fs.readFileSync(target, "utf8");

const checks = [
    {
        objectName: "NAV",
        entryKey: "workbenchSurface",
        mustInclude: [
            "SURFACE.role.workbench",
            "SURFACE.chrome.edgeBottom",
        ],
    },
    {
        objectName: "NAV",
        entryKey: "workbenchShell",
        mustInclude: ["SURFACE.surface.workbenchShell"],
    },
    {
        objectName: "TABLE",
        entryKey: "workbenchSurface",
        mustInclude: ["SURFACE.role.workbench"],
    },
    {
        objectName: "TABLE",
        entryKey: "workbenchShell",
        mustInclude: ["SURFACE.surface.workbenchShell"],
    },
    {
        objectName: "STATUS_BAR",
        entryKey: "workbenchSurface",
        mustInclude: [
            "SURFACE.role.workbench",
            "SURFACE.chrome.edgeTop",
        ],
    },
    {
        objectName: "STATUS_BAR",
        entryKey: "footer",
        mustInclude: ["SURFACE.surface.workbenchShell"],
    },
];

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractObjectBody(objectName) {
    const pattern = new RegExp(
        `export const ${escapeRegex(objectName)} = \\{([\\s\\S]*?)\\} as const;`,
        "m",
    );
    const match = source.match(pattern);
    if (!match) return null;
    return match[1];
}

function extractEntryBody(objectName, entryKey) {
    const objectBody = extractObjectBody(objectName);
    if (!objectBody) return null;
    const pattern = new RegExp(
        `${escapeRegex(entryKey)}:\\s*([\\s\\S]*?)(?:,\\n|,\\r\\n)`,
        "m",
    );
    const match = objectBody.match(pattern);
    if (!match) return null;
    return `${entryKey}: ${match[1]}`;
}

const failures = [];

for (const check of checks) {
    const body = extractEntryBody(check.objectName, check.entryKey);
    if (!body) {
        failures.push(`${check.objectName}.${check.entryKey}: missing entry`);
        continue;
    }
    for (const token of check.mustInclude) {
        if (!body.includes(token)) {
            failures.push(
                `${check.objectName}.${check.entryKey}: missing token '${token}'`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("\nWorkbench parity violations:\n");
    for (const failure of failures) {
        console.error(` - ${failure}`);
    }
    console.error(
        "\nFix by composing the workbench triad from SURFACE core/semantic tokens.",
    );
    process.exit(2);
}

console.log("Workbench parity check: token contract satisfied.");
