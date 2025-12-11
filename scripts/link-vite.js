#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const frontendRoot = path.join(root, "frontend");
const targetPath = path.join(root, "node_modules", "vite");
const linkDir = path.join(frontendRoot, "node_modules");
const linkPath = path.join(linkDir, "vite");

if (!fs.existsSync(targetPath)) {
    console.warn(`[link-vite] target path is missing: ${targetPath}`);
    process.exit(0);
}

fs.mkdirSync(linkDir, { recursive: true });

if (fs.existsSync(linkPath)) {
    const existingStats = fs.lstatSync(linkPath);
    if (existingStats.isSymbolicLink()) {
        try {
            const resolved = path.resolve(
                path.dirname(linkPath),
                fs.readlinkSync(linkPath)
            );
            if (resolved === targetPath) {
                process.exit(0);
            }
        } catch {
            // fall through and recreate link
        }
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
}

const linkType = process.platform === "win32" ? "junction" : "dir";
fs.symlinkSync(targetPath, linkPath, linkType);
