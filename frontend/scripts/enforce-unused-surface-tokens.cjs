#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
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

const FEATURE_MAP_EXPORTS = new Set([
    "MODAL",
    "FORM",
    "TABLE",
    "DIAGNOSTIC",
    "WORKBENCH",
    "SPLIT",
    "CONTEXT_MENU",
    "METRIC_CHART",
    "DASHBOARD",
    "DETAILS",
    "COMMAND_PALETTE",
    "FORM_CONTROL",
    "INPUT",
    "FILE_BROWSER",
    "HEATMAP",
]);

function getPropertyName(propertyName) {
    if (!propertyName) return null;
    if (
        ts.isIdentifier(propertyName) ||
        ts.isStringLiteral(propertyName) ||
        ts.isNumericLiteral(propertyName)
    ) {
        return propertyName.text;
    }
    return null;
}

function parseTopLevelFeatureMapPaths(sourceText) {
    const sourceFile = ts.createSourceFile(
        targetFile,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    const paths = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const isExported = statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        );
        if (!isExported) continue;

        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) continue;
            const objectName = declaration.name.text;
            if (!FEATURE_MAP_EXPORTS.has(objectName)) continue;
            if (!declaration.initializer) continue;
            if (!ts.isObjectLiteralExpression(declaration.initializer)) continue;

            for (const property of declaration.initializer.properties) {
                if (
                    !ts.isPropertyAssignment(property) &&
                    !ts.isShorthandPropertyAssignment(property)
                ) {
                    continue;
                }
                const key = getPropertyName(property.name);
                if (!key) continue;
                paths.push(`${objectName}.${key}`);
            }
        }
    }

    return paths.sort();
}

function countExternalUsages(pathExpression) {
    const escaped = pathExpression.replace(".", "\\.");
    const command = `rg -n "\\b${escaped}\\b" src --glob "*.ts" --glob "*.tsx"`;
    try {
        const output = execSync(command, {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return output
            .split(/\r?\n/)
            .filter(Boolean)
            .filter(
                (line) =>
                    !line.includes("src/shared/ui/layout/glass-surface.ts"),
            ).length;
    } catch (error) {
        if (error && error.status === 1) {
            return 0;
        }
        throw error;
    }
}

const source = fs.readFileSync(targetFile, "utf8");
const topLevelPaths = parseTopLevelFeatureMapPaths(source);
const unused = topLevelPaths.filter(
    (pathExpression) => countExternalUsages(pathExpression) === 0,
);

if (unused.length > 0) {
    console.error("\nUnused top-level surface feature-map tokens:\n");
    for (const tokenPath of unused) {
        console.error(` - ${tokenPath}`);
    }
    console.error(
        "\nFix by deleting dead keys or wiring real consumers before adding new top-level feature-map tokens.",
    );
    process.exit(2);
}

console.log(
    "Unused surface token check: all top-level feature-map tokens have external consumers.",
);
