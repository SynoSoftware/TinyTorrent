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

const familyChecks = [
    {
        entryKey: "surface",
        mustInclude: ["SURFACE.role.workbench"],
    },
    {
        entryKey: "shell",
        mustInclude: ["SURFACE.surface.workbenchShell"],
    },
    {
        entryKey: "topEdge",
        mustInclude: ["SURFACE.role.workbench", "SURFACE.chrome.edgeTop"],
    },
    {
        entryKey: "bottomEdge",
        mustInclude: ["SURFACE.role.workbench", "SURFACE.chrome.edgeBottom"],
    },
];

const checks = [
    {
        objectName: "TABLE",
        entryKey: "workbenchSurface",
        mustInclude: ["WORKBENCH_SURFACE_FAMILY.surface"],
    },
    {
        objectName: "TABLE",
        entryKey: "workbenchShell",
        mustInclude: ["WORKBENCH_SURFACE_FAMILY.shell"],
    },
    {
        objectName: "WORKBENCH",
        entryKey: "nav",
        mustInclude: ["WORKBENCH_NAV"],
    },
    {
        objectName: "WORKBENCH",
        entryKey: "status",
        mustInclude: ["WORKBENCH_STATUS"],
    },
];
const constChecks = [
    {
        constName: "WORKBENCH_NAV",
        entryKey: "workbenchSurface",
        mustInclude: ["WORKBENCH_SURFACE_FAMILY.bottomEdge"],
    },
    {
        constName: "WORKBENCH_NAV",
        entryKey: "workbenchShell",
        mustInclude: ["WORKBENCH_SURFACE_FAMILY.shell"],
    },
    {
        constName: "WORKBENCH_STATUS",
        entryKey: "workbenchSurface",
        mustInclude: ["WORKBENCH_SURFACE_FAMILY.topEdge"],
    },
    {
        constName: "WORKBENCH_STATUS",
        entryKey: "footer",
        mustInclude: ["WORKBENCH_SURFACE_FAMILY.shell"],
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

function extractConstObjectBody(constName) {
    const pattern = new RegExp(
        `const ${escapeRegex(constName)} = \\{([\\s\\S]*?)\\} as const;`,
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

function extractConstEntryBody(constName, entryKey) {
    const objectBody = extractConstObjectBody(constName);
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

for (const check of familyChecks) {
    const body = extractConstEntryBody("WORKBENCH_SURFACE_FAMILY", check.entryKey);
    if (!body) {
        failures.push(
            `WORKBENCH_SURFACE_FAMILY.${check.entryKey}: missing entry`,
        );
        continue;
    }
    for (const token of check.mustInclude) {
        if (!body.includes(token)) {
            failures.push(
                `WORKBENCH_SURFACE_FAMILY.${check.entryKey}: missing token '${token}'`,
            );
        }
    }
}

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

for (const check of constChecks) {
    const body = extractConstEntryBody(check.constName, check.entryKey);
    if (!body) {
        failures.push(`${check.constName}.${check.entryKey}: missing entry`);
        continue;
    }
    for (const token of check.mustInclude) {
        if (!body.includes(token)) {
            failures.push(
                `${check.constName}.${check.entryKey}: missing token '${token}'`,
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
