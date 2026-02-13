#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const targetFile = path.join(
    root,
    "src",
    "shared",
    "ui",
    "layout",
    "glass-surface.ts",
);
const sourceText = fs.readFileSync(targetFile, "utf8");
const sourceFile = ts.createSourceFile(
    targetFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
);

const bannedPattern = /(legacy|compat|compatibility|alias)/i;
const violations = [];

for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;

    for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const exportName = declaration.name.text;
        if (bannedPattern.test(exportName)) {
            violations.push(
                `export '${exportName}' looks like a temporary compatibility layer`,
            );
        }
    }
}

for (const line of sourceText.split(/\r?\n/)) {
    if (line.includes("temporary") && bannedPattern.test(line)) {
        violations.push(
            `comment/text contains temporary compatibility wording: '${line.trim()}'`,
        );
    }
}

if (violations.length > 0) {
    console.error("\nFinal-form policy violations:\n");
    for (const violation of violations) {
        console.error(` - ${violation}`);
    }
    console.error(
        "\nFix by removing temporary compatibility layers and keeping only canonical token authorities.",
    );
    process.exit(2);
}

console.log(
    "Final-form policy check: no temporary compatibility-layer patterns detected.",
);
