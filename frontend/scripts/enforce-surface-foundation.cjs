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

function fail(message) {
    console.error(`\nSurface foundation violation: ${message}`);
    process.exit(2);
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

function extractKeysByIndent(objectBody, indent) {
    const regex = new RegExp(`^ {${indent}}([A-Za-z0-9_]+):`, "gm");
    const keys = [];
    let match = regex.exec(objectBody);
    while (match) {
        keys.push(match[1]);
        match = regex.exec(objectBody);
    }
    return keys;
}

function expectExactKeys(actual, expected, label) {
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k));
    if (missing.length || extra.length) {
        fail(
            `${label} keys mismatch. missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
        );
    }
}

const coreBody = findBraceBlock(source, "const GLASS_ROLE_CORE =");
if (!coreBody) fail("GLASS_ROLE_CORE object not found");

const dialBody = findBraceBlock(source, "const GLASS_SURFACE_DIAL =");
if (!dialBody) fail("GLASS_SURFACE_DIAL object not found");
expectExactKeys(
    extractKeysByIndent(dialBody, 4),
    ["opacity", "blur", "border", "radius", "elevation"],
    "GLASS_SURFACE_DIAL",
);
const dialOpacityBody = findBraceBlock(dialBody, "opacity:");
if (!dialOpacityBody) fail("GLASS_SURFACE_DIAL.opacity object not found");
expectExactKeys(
    extractKeysByIndent(dialOpacityBody, 8),
    ["panel", "workbench", "pane", "modal", "overlay"],
    "GLASS_SURFACE_DIAL.opacity",
);
const dialBlurBody = findBraceBlock(dialBody, "blur:");
if (!dialBlurBody) fail("GLASS_SURFACE_DIAL.blur object not found");
expectExactKeys(
    extractKeysByIndent(dialBlurBody, 8),
    ["panel", "soft", "floating"],
    "GLASS_SURFACE_DIAL.blur",
);
const dialBorderBody = findBraceBlock(dialBody, "border:");
if (!dialBorderBody) fail("GLASS_SURFACE_DIAL.border object not found");
expectExactKeys(
    extractKeysByIndent(dialBorderBody, 8),
    ["soft", "strong"],
    "GLASS_SURFACE_DIAL.border",
);
const dialRadiusBody = findBraceBlock(dialBody, "radius:");
if (!dialRadiusBody) fail("GLASS_SURFACE_DIAL.radius object not found");
expectExactKeys(
    extractKeysByIndent(dialRadiusBody, 8),
    ["panel", "modal", "raised", "full"],
    "GLASS_SURFACE_DIAL.radius",
);
const dialElevationBody = findBraceBlock(dialBody, "elevation:");
if (!dialElevationBody) fail("GLASS_SURFACE_DIAL.elevation object not found");
expectExactKeys(
    extractKeysByIndent(dialElevationBody, 8),
    ["panel", "overlay", "floating", "menu"],
    "GLASS_SURFACE_DIAL.elevation",
);

const coreKeys = extractKeysByIndent(coreBody, 4);
expectExactKeys(coreKeys, ["surface", "chrome", "state", "text"], "GLASS_ROLE_CORE");

const surfaceBody = findBraceBlock(coreBody, "surface:");
if (!surfaceBody) fail("GLASS_ROLE_CORE.surface object not found");
expectExactKeys(
    extractKeysByIndent(surfaceBody, 8),
    ["workbench", "panel", "pane", "modal", "inset", "menu", "overlay"],
    "GLASS_ROLE_CORE.surface",
);

const chromeBody = findBraceBlock(coreBody, "chrome:");
if (!chromeBody) fail("GLASS_ROLE_CORE.chrome object not found");
expectExactKeys(
    extractKeysByIndent(chromeBody, 8),
    ["edgeTop", "edgeBottom", "sticky", "divider"],
    "GLASS_ROLE_CORE.chrome",
);

const stateBody = findBraceBlock(coreBody, "state:");
if (!stateBody) fail("GLASS_ROLE_CORE.state object not found");
expectExactKeys(
    extractKeysByIndent(stateBody, 8),
    ["interactive", "disabled"],
    "GLASS_ROLE_CORE.state",
);

const textBody = findBraceBlock(coreBody, "text:");
if (!textBody) fail("GLASS_ROLE_CORE.text object not found");
expectExactKeys(
    extractKeysByIndent(textBody, 8),
    [
        "heading",
        "headingSection",
        "bodyStrong",
        "body",
        "label",
        "muted",
        "caption",
        "code",
    ],
    "GLASS_ROLE_CORE.text",
);

if (!source.includes("const STANDARD_SURFACE_CHROME = GLASS_ROLE_CORE.chrome;")) {
    fail("STANDARD_SURFACE_CHROME must point directly to GLASS_ROLE_CORE.chrome");
}
if (!source.includes("const STANDARD_SURFACE_ROLE = GLASS_ROLE_CORE.surface;")) {
    fail("STANDARD_SURFACE_ROLE must point directly to GLASS_ROLE_CORE.surface");
}
if (!source.includes("const STANDARD_SURFACE_SEMANTIC_SURFACE = GLASS_ROLE_SEMANTIC.surface;")) {
    fail("STANDARD_SURFACE_SEMANTIC_SURFACE must point to GLASS_ROLE_SEMANTIC.surface");
}
if (!source.includes("const STANDARD_SURFACE_CHROME_EXTENDED = GLASS_ROLE_SEMANTIC.chrome;")) {
    fail("STANDARD_SURFACE_CHROME_EXTENDED must point to GLASS_ROLE_SEMANTIC.chrome");
}
if (!source.includes("core: GLASS_ROLE_CORE")) {
    fail("GLASS_ROLE_REGISTRY must expose core tier");
}
if (!source.includes("semantic: GLASS_ROLE_SEMANTIC")) {
    fail("GLASS_ROLE_REGISTRY must expose semantic tier");
}
if (!source.includes("surface: STANDARD_SURFACE_SEMANTIC_SURFACE")) {
    fail("STANDARD_SURFACE_CLASS must expose semantic surfaces via surface.*");
}
if (!source.includes("chromeEx: STANDARD_SURFACE_CHROME_EXTENDED")) {
    fail("STANDARD_SURFACE_CLASS must expose semantic chrome via chromeEx.*");
}

console.log("Surface foundation check: core roles and semantic split contract satisfied.");
