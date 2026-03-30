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

const scalarChecks = [
    {
        constName: "workbenchMainShell",
        mustInclude: [
            "surface.surface.workbenchShell",
            "surface-layer-2",
        ],
    },
    {
        constName: "workbenchIslandShell",
        mustInclude: [
            "surface.surface.workbenchShell",
            "border",
            "border-default/45",
        ],
    },
];

const checks = [
    {
        objectName: "table",
        entryKey: "shell",
        mustInclude: ["workbenchIslandShell"],
    },
    {
        objectName: "workbench",
        entryKey: "nav",
        mustInclude: ["root:", 'surface: "text-foreground"', "shell: workbenchIslandShell"],
    },
    {
        objectName: "workbench",
        entryKey: "status",
        mustInclude: ['surface: "text-foreground"', "footer: `w-full shrink-0 select-none relative z-overlay overflow-visible ${workbenchIslandShell}`"],
    },
];

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBraceBlock(text, marker) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) return null;
    const braceStart = text.indexOf("{", markerIndex);
    if (braceStart < 0) return null;

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = braceStart; i < text.length; i += 1) {
        const ch = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === "\\") {
            escaped = true;
            continue;
        }

        if (!inDouble && !inTemplate && ch === "'") {
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && !inTemplate && ch === '"') {
            inDouble = !inDouble;
            continue;
        }
        if (!inSingle && !inDouble && ch === "`") {
            inTemplate = !inTemplate;
            continue;
        }

        if (inSingle || inDouble || inTemplate) continue;

        if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                return text.slice(braceStart + 1, i);
            }
        }
    }

    return null;
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

function extractConstInitializer(constName) {
    const pattern = new RegExp(`(?:export\\s+)?const ${escapeRegex(constName)} = ([\\s\\S]*?);`, "m");
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

function extractNestedObjectBody(objectName, entryKey) {
    const objectBody = extractObjectBody(objectName);
    if (!objectBody) return null;
    return findBraceBlock(objectBody, `${entryKey}:`);
}

const failures = [];

for (const check of scalarChecks) {
    const body = extractConstInitializer(check.constName);
    if (!body) {
        failures.push(`${check.constName}: missing declaration`);
        continue;
    }
    for (const token of check.mustInclude) {
        if (!body.includes(token)) {
            failures.push(
                `${check.constName}: missing token '${token}'`,
            );
        }
    }
}

for (const check of checks) {
    const body =
        check.entryKey === "nav" || check.entryKey === "status"
            ? extractNestedObjectBody(check.objectName, check.entryKey)
            : extractEntryBody(check.objectName, check.entryKey);
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
        "\nFix by composing the workbench triad from surface core/semantic tokens.",
    );
    process.exit(2);
}

console.log("Workbench parity check: token contract satisfied.");
