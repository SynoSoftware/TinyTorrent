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
        objectName: "APP_NAV_CLASS",
        entryKey: "workbenchSurface",
        mustInclude: [
            "STANDARD_SURFACE_CLASS.role.workbench",
            "STANDARD_SURFACE_CLASS.chrome.edgeBottom",
        ],
    },
    {
        objectName: "APP_NAV_CLASS",
        entryKey: "workbenchShell",
        mustInclude: ["STANDARD_SURFACE_CLASS.surface.workbenchShell"],
    },
    {
        objectName: "TABLE_VIEW_CLASS",
        entryKey: "workbenchSurface",
        mustInclude: ["STANDARD_SURFACE_CLASS.role.workbench"],
    },
    {
        objectName: "TABLE_VIEW_CLASS",
        entryKey: "workbenchShell",
        mustInclude: ["STANDARD_SURFACE_CLASS.surface.workbenchShell"],
    },
    {
        objectName: "APP_STATUS_CLASS",
        entryKey: "workbenchSurface",
        mustInclude: [
            "STANDARD_SURFACE_CLASS.role.workbench",
            "STANDARD_SURFACE_CLASS.chrome.edgeTop",
        ],
    },
    {
        objectName: "APP_STATUS_CLASS",
        entryKey: "footer",
        mustInclude: ["STANDARD_SURFACE_CLASS.surface.workbenchShell"],
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
        "\nFix by composing the workbench triad from STANDARD_SURFACE_CLASS core/semantic tokens.",
    );
    process.exit(2);
}

console.log("Workbench parity check: token contract satisfied.");
