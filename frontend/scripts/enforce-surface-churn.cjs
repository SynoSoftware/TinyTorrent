#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const targetFile = path.join(
    root,
    "src",
    "shared",
    "ui",
    "layout",
    "glass-surface.ts",
);
const marker = "export const APP_MODAL_CLASS";

const MAX_ALLOWED = {
    "bg-*": 110,
    "border-*": 110,
    "backdrop-blur-*": 7,
    "shadow-*": 34,
    "rounded-*": 60,
};

const PATTERNS = {
    "bg-*": /(?<![\w-])bg-[\w[\]/:%.-]+/g,
    "border-*": /(?<![\w-])border-[\w[\]/:%.-]+/g,
    "backdrop-blur-*": /(?<![\w-])backdrop-blur-[\w[\]/:%.-]+/g,
    "shadow-*": /(?<![\w-])shadow-[\w[\]/:%.-]+/g,
    "rounded-*": /(?<![\w-])rounded-[\w[\]/:%.-]+/g,
};

function countMatches(text, regex) {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
}

const source = fs.readFileSync(targetFile, "utf8");
const startIndex = source.indexOf(marker);

if (startIndex < 0) {
    console.error(`Surface churn check failed: marker not found: ${marker}`);
    process.exit(2);
}

const scope = source.slice(startIndex);
const overages = [];

for (const [name, pattern] of Object.entries(PATTERNS)) {
    const count = countMatches(scope, pattern);
    const maxAllowed = MAX_ALLOWED[name];
    if (count > maxAllowed) {
        overages.push({ name, count, maxAllowed });
    }
}

if (overages.length > 0) {
    console.error("\nSurface churn violations in glass-surface feature bindings:\n");
    for (const item of overages) {
        console.error(` - ${item.name}: ${item.count} (max ${item.maxAllowed})`);
    }
    console.error(
        "\nFix by routing new surface recipes into STANDARD_SURFACE_CLASS.layer/role/chrome and reusing those tokens.",
    );
    process.exit(2);
}

console.log("Surface churn check: no raw recipe growth detected.");
