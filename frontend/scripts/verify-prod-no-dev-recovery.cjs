const fs = require("fs");
const path = require("path");

const assetsDir = path.resolve(__dirname, "..", "dist", "assets");
if (!fs.existsSync(assetsDir)) {
    console.error("[verify-prod-no-dev-recovery] dist assets not found.");
    process.exit(1);
}

const jsAssets = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name);

if (jsAssets.length === 0) {
    console.error("[verify-prod-no-dev-recovery] no JS assets found.");
    process.exit(1);
}

const forbiddenMarkers = [
    "dev-recovery-torrent",
    "dev-recovery-fingerprint",
    "D:\\\\RecoveryLab\\\\",
];

const violations = [];
for (const asset of jsAssets) {
    const fullPath = path.join(assetsDir, asset);
    const content = fs.readFileSync(fullPath, "utf8");
    for (const marker of forbiddenMarkers) {
        if (content.includes(marker)) {
            violations.push({ asset, marker });
        }
    }
}

if (violations.length > 0) {
    console.error(
        "[verify-prod-no-dev-recovery] forbidden dev recovery markers found in production bundle:",
    );
    for (const violation of violations) {
        console.error(`- ${violation.asset}: ${violation.marker}`);
    }
    process.exit(1);
}

console.log(
    "[verify-prod-no-dev-recovery] production bundle is clean of dev recovery markers.",
);

