#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const srcRoot = path.join(root, "src");
const outDir = path.join(root, "reports", "generated");
const outFile = path.join(outDir, "surface-component-tree.generated.md");

const GLASS_IMPORT_PATH = "@/shared/ui/layout/glass-surface";
const TEXT_IMPORT_PATH = "@/config/textRoles";

const args = new Set(process.argv.slice(2));
const includeAll = args.has("--all");

function toPosix(relPath) {
    return relPath.split(path.sep).join("/");
}

function walk(dir, out = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".tsx")) continue;
        out.push(full);
    }
    return out;
}

function isShellLike(relPath) {
    const base = path.basename(relPath);
    if (/Modal\.tsx$/i.test(base)) return true;
    if (/Layout\.tsx$/i.test(base)) return true;
    if (/Shell\.tsx$/i.test(base)) return true;
    if (/View\.tsx$/i.test(base)) return true;
    if (relPath.includes("/app/components/layout/")) return true;
    if (relPath.endsWith("/WorkspaceShell.tsx")) return true;
    if (relPath.endsWith("/Dashboard_Layout.tsx")) return true;
    return false;
}

function getJsxTagName(tagNameNode) {
    if (!tagNameNode) return "unknown";
    if (ts.isIdentifier(tagNameNode)) return tagNameNode.text;
    if (ts.isPropertyAccessExpression(tagNameNode)) return tagNameNode.getText();
    if (ts.isJsxNamespacedName(tagNameNode)) return tagNameNode.getText();
    return tagNameNode.getText();
}

function expressionText(expr) {
    if (!expr) return "";
    if (ts.isJsxExpression(expr)) {
        if (!expr.expression) return "";
        return expr.expression.getText();
    }
    return expr.getText();
}

function collectImports(sf) {
    const tokenAuthorities = new Set();
    let hasGlassImport = false;
    let hasTextImport = false;

    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt)) continue;
        const moduleText = stmt.moduleSpecifier.getText().slice(1, -1);
        if (!stmt.importClause || !stmt.importClause.namedBindings) continue;
        if (!ts.isNamedImports(stmt.importClause.namedBindings)) continue;

        if (moduleText === GLASS_IMPORT_PATH) {
            hasGlassImport = true;
        }
        if (moduleText === TEXT_IMPORT_PATH) {
            hasTextImport = true;
        }

        if (moduleText !== GLASS_IMPORT_PATH && moduleText !== TEXT_IMPORT_PATH) {
            continue;
        }

        for (const item of stmt.importClause.namedBindings.elements) {
            tokenAuthorities.add(item.name.text);
        }
    }

    return { tokenAuthorities, hasGlassImport, hasTextImport };
}

function extractTokenRefsFromText(text, authorities) {
    if (!text) return [];
    const refs = new Set();

    for (const authority of authorities) {
        const escaped = authority.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`${escaped}\\.[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*`, "g");
        let match = re.exec(text);
        while (match) {
            refs.add(match[0]);
            match = re.exec(text);
        }
    }

    return [...refs].sort();
}

function buildNode(name, tokens, children) {
    return {
        name,
        tokens,
        children,
    };
}

function collectJsxTokens(sf, authorities) {
    function readAttributes(attrs) {
        const props = [];
        for (const prop of attrs.properties) {
            if (!ts.isJsxAttribute(prop)) continue;
            const key = prop.name.text;
            if (key !== "className" && key !== "classNames") continue;
            const raw = expressionText(prop.initializer);
            if (!raw) continue;
            const refs = extractTokenRefsFromText(raw, authorities);
            if (refs.length === 0) continue;
            props.push(...refs);
        }
        return [...new Set(props)].sort();
    }

    function visit(node) {
        if (ts.isJsxElement(node)) {
            const name = getJsxTagName(node.openingElement.tagName);
            const tokens = readAttributes(node.openingElement.attributes);
            const childNodes = [];
            for (const child of node.children) {
                childNodes.push(...collectFrom(child));
            }
            if (tokens.length === 0 && childNodes.length === 0) return null;
            return buildNode(name, tokens, childNodes);
        }
        if (ts.isJsxSelfClosingElement(node)) {
            const name = getJsxTagName(node.tagName);
            const tokens = readAttributes(node.attributes);
            if (tokens.length === 0) return null;
            return buildNode(name, tokens, []);
        }
        if (ts.isJsxFragment(node)) {
            const childNodes = [];
            for (const child of node.children) {
                childNodes.push(...collectFrom(child));
            }
            if (childNodes.length === 0) return null;
            return buildNode("Fragment", [], childNodes);
        }
        return null;
    }

    function collectFrom(node) {
        const direct = visit(node);
        if (direct) return [direct];
        const nested = [];
        ts.forEachChild(node, (child) => {
            nested.push(...collectFrom(child));
        });
        return nested;
    }

    const roots = [];
    ts.forEachChild(sf, (node) => {
        roots.push(...collectFrom(node));
    });
    return roots;
}

function flattenTrees(trees) {
    const refs = new Map();
    const elementRoles = new Map();

    function walkNode(node, pathParts = []) {
        const nextPath = [...pathParts, node.name];
        const pathKey = nextPath.join(" > ");

        if (node.tokens.length > 0) {
            for (const token of node.tokens) {
                refs.set(token, (refs.get(token) || 0) + 1);
                const key = `${pathKey} :: ${token}`;
                elementRoles.set(key, (elementRoles.get(key) || 0) + 1);
            }
        }

        for (const child of node.children) {
            walkNode(child, nextPath);
        }
    }

    for (const tree of trees) {
        walkNode(tree, []);
    }

    return { refs, elementRoles };
}

function renderTree(node, lines, depth = 0) {
    const indent = "  ".repeat(depth);
    const tokenText = node.tokens.length > 0 ? ` [${node.tokens.join(", ")}]` : "";
    lines.push(`${indent}- ${node.name}${tokenText}`);
    for (const child of node.children) {
        renderTree(child, lines, depth + 1);
    }
}

function sortByCountDesc(mapObj) {
    return [...mapObj.entries()].sort((a, b) => b[1] - a[1]);
}

function kindFromPath(relPath) {
    const base = path.basename(relPath);
    if (/Modal\.tsx$/i.test(base)) return "modal";
    if (relPath.includes("/app/components/layout/")) return "layout";
    if (/Layout\.tsx$/i.test(base)) return "layout";
    if (/Shell\.tsx$/i.test(base)) return "shell";
    if (/View\.tsx$/i.test(base)) return "view";
    return "component";
}

function main() {
    const files = walk(srcRoot);
    const reports = [];
    const allTokenCounts = new Map();
    const allElementRoleCounts = new Map();
    const now = new Date().toISOString().slice(0, 10);

    for (const file of files) {
        const rel = toPosix(path.relative(root, file));
        if (!includeAll && !isShellLike(rel)) continue;

        const content = fs.readFileSync(file, "utf8");
        const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const { tokenAuthorities, hasGlassImport, hasTextImport } = collectImports(sf);
        if (!hasGlassImport) continue;

        if (hasTextImport) {
            tokenAuthorities.add("TEXT_ROLE");
            tokenAuthorities.add("TEXT_ROLE_EXTENDED");
        }

        const trees = collectJsxTokens(sf, tokenAuthorities);
        if (trees.length === 0) continue;

        const flattened = flattenTrees(trees);
        for (const [k, v] of flattened.refs.entries()) {
            allTokenCounts.set(k, (allTokenCounts.get(k) || 0) + v);
        }
        for (const [k, v] of flattened.elementRoles.entries()) {
            allElementRoleCounts.set(k, (allElementRoleCounts.get(k) || 0) + v);
        }

        reports.push({
            rel,
            kind: kindFromPath(rel),
            trees,
        });
    }

    reports.sort((a, b) => a.rel.localeCompare(b.rel));

    const tokenTop = sortByCountDesc(allTokenCounts).slice(0, 40);
    const elementRoleTop = sortByCountDesc(allElementRoleCounts).slice(0, 40);

    const lines = [];
    lines.push("# Surface Component Tree");
    lines.push("");
    lines.push("> AUTO-GENERATED FILE. DO NOT EDIT.");
    lines.push("> Generated by `scripts/generate-surface-component-tree.cjs`.");
    lines.push("");
    lines.push(`Generated: ${now}`);
    lines.push("");
    lines.push(`Scope: ${includeAll ? "all TSX importers of glass-surface.ts" : "page/modal/layout/shell/view importers of glass-surface.ts"}`);
    lines.push("");
    lines.push(`Files analyzed: ${reports.length}`);
    lines.push("");
    lines.push("## Common Token Usage");
    lines.push("");
    for (const [token, count] of tokenTop) {
        lines.push(`- ${token}: ${count}`);
    }
    lines.push("");
    lines.push("## Common Element + Token Patterns");
    lines.push("");
    for (const [pattern, count] of elementRoleTop) {
        lines.push(`- ${pattern}: ${count}`);
    }
    lines.push("");
    lines.push("## Component Trees");
    lines.push("");

    for (const report of reports) {
        lines.push(`### ${report.rel} (${report.kind})`);
        lines.push("");
        for (const tree of report.trees) {
            renderTree(tree, lines, 0);
        }
        lines.push("");
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, `${lines.join("\n")}\n`, "utf8");
    console.log(`Surface tree report generated: ${toPosix(path.relative(root, outFile))}`);
    console.log(`Analyzed components: ${reports.length}`);
}

main();
