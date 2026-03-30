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

const coreBody = findBraceBlock(source, "const glassRoleCore =");
if (!coreBody) fail("glassRoleCore object not found");

const dialBody = findBraceBlock(source, "const glassSurfaceDial =");
if (!dialBody) fail("glassSurfaceDial object not found");
expectExactKeys(
    extractKeysByIndent(dialBody, 4),
    ["opacity", "blur", "border", "radius", "elevation"],
    "glassSurfaceDial",
);
const dialOpacityBody = findBraceBlock(dialBody, "opacity:");
if (!dialOpacityBody) fail("glassSurfaceDial.opacity object not found");
expectExactKeys(
    extractKeysByIndent(dialOpacityBody, 8),
    ["panel", "workbench", "pane", "modal", "overlay"],
    "glassSurfaceDial.opacity",
);
const dialBlurBody = findBraceBlock(dialBody, "blur:");
if (!dialBlurBody) fail("glassSurfaceDial.blur object not found");
expectExactKeys(
    extractKeysByIndent(dialBlurBody, 8),
    ["panel", "soft", "floating"],
    "glassSurfaceDial.blur",
);
const dialBorderBody = findBraceBlock(dialBody, "border:");
if (!dialBorderBody) fail("glassSurfaceDial.border object not found");
expectExactKeys(
    extractKeysByIndent(dialBorderBody, 8),
    ["soft", "strong"],
    "glassSurfaceDial.border",
);
const dialRadiusBody = findBraceBlock(dialBody, "radius:");
if (!dialRadiusBody) fail("glassSurfaceDial.radius object not found");
expectExactKeys(
    extractKeysByIndent(dialRadiusBody, 8),
    ["panel", "modal", "raised", "full"],
    "glassSurfaceDial.radius",
);
const dialElevationBody = findBraceBlock(dialBody, "elevation:");
if (!dialElevationBody) fail("glassSurfaceDial.elevation object not found");
expectExactKeys(
    extractKeysByIndent(dialElevationBody, 8),
    ["panel", "overlay", "floating", "menu"],
    "glassSurfaceDial.elevation",
);

const coreKeys = extractKeysByIndent(coreBody, 4);
expectExactKeys(coreKeys, ["surface", "chrome", "state", "text"], "glassRoleCore");

const surfaceBody = findBraceBlock(coreBody, "surface:");
if (!surfaceBody) fail("glassRoleCore.surface object not found");
expectExactKeys(
    extractKeysByIndent(surfaceBody, 8),
    ["workbench", "panel", "pane", "modal", "inset", "menu", "overlay"],
    "glassRoleCore.surface",
);

const chromeBody = findBraceBlock(coreBody, "chrome:");
if (!chromeBody) fail("glassRoleCore.chrome object not found");
expectExactKeys(
    extractKeysByIndent(chromeBody, 8),
    ["edgeTop", "edgeBottom", "sticky", "divider"],
    "glassRoleCore.chrome",
);

const stateBody = findBraceBlock(coreBody, "state:");
if (!stateBody) fail("glassRoleCore.state object not found");
expectExactKeys(
    extractKeysByIndent(stateBody, 8),
    ["interactive", "disabled"],
    "glassRoleCore.state",
);

const textBody = findBraceBlock(coreBody, "text:");
if (!textBody) fail("glassRoleCore.text object not found");
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
    "glassRoleCore.text",
);

const semanticBody = findBraceBlock(source, "const glassRoleSemantic =");
if (!semanticBody) fail("glassRoleSemantic object not found");
expectExactKeys(
    extractKeysByIndent(semanticBody, 4),
    ["surface", "chrome"],
    "glassRoleSemantic",
);
const semanticSurfaceBody = findBraceBlock(semanticBody, "surface:");
if (!semanticSurfaceBody) fail("glassRoleSemantic.surface object not found");
expectExactKeys(
    extractKeysByIndent(semanticSurfaceBody, 8),
    [
        "workbenchShell",
        "panelInset",
        "tooltip",
        "statusModule",
        "panelRaised",
        "panelMuted",
        "panelInfo",
        "panelWorkflow",
        "sidebarPanel",
    ],
    "glassRoleSemantic.surface",
);
if (!semanticBody.includes("chrome: glassSemanticChrome")) {
    fail("glassRoleSemantic.chrome must point to glassSemanticChrome");
}
const semanticChromeBody = findBraceBlock(source, "const glassSemanticChrome =");
if (!semanticChromeBody) fail("glassSemanticChrome object not found");
for (const key of [
    "dividerSoft:",
    "headerBorder:",
    "footerBorder:",
    "headerPassive:",
    "footerEnd:",
    "footerActionsPadded:",
]) {
    if (!semanticChromeBody.includes(key)) {
        fail(`glassRoleSemantic.chrome missing key ${key.replace(":", "")}`);
    }
}

const surfaceExportBody = findBraceBlock(source, "export const surface =");
if (!surfaceExportBody) fail("surface export object not found");
expectExactKeys(
    extractKeysByIndent(surfaceExportBody, 4),
    [
        "dial",
        "role",
        "surface",
        "state",
        "text",
        "tooltip",
        "chrome",
        "chromeEx",
        "modal",
        "menu",
        "atom",
    ],
    "surface",
);
if (!source.includes("role: glassRoleCore.surface")) {
    fail("surface.role must expose glassRoleCore.surface");
}
if (!source.includes("surface: glassRoleSemantic.surface")) {
    fail("surface.surface must expose glassRoleSemantic.surface");
}
if (!source.includes("chromeEx: glassRoleSemantic.chrome")) {
    fail("surface.chromeEx must expose glassRoleSemantic.chrome");
}

console.log("Surface foundation check: core roles and semantic split contract satisfied.");
