#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "reports", "generated");

function runRg(pattern) {
    try {
        return execFileSync(
            "rg",
            [
                "-n",
                pattern,
                "src",
                "--glob",
                "*.ts",
                "--glob",
                "*.tsx",
            ],
            {
                cwd: root,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            },
        ).trim();
    } catch (error) {
        // rg exits with status 1 when no matches are found.
        if (error && error.status === 1) {
            return "";
        }
        throw error;
    }
}

function writeReport(filename, contents) {
    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, filename);
    fs.writeFileSync(target, contents ? `${contents}\n` : "", "utf8");
}

const classNamesMatches = runRg("classNames\\s*=");
const classNameMatches = runRg("className\\s*=");

const classNamesCurrentFile = "classnames-occurrences-current.generated.txt";
const classNamesFile = "classnames-occurrences.generated.txt";
const classNameFile = "classname-occurrences.generated.txt";

writeReport(classNamesCurrentFile, classNamesMatches);
writeReport(classNamesFile, classNamesMatches);
writeReport(classNameFile, classNameMatches);

console.log("Generated:");
console.log(` - reports/generated/${classNamesCurrentFile}`);
console.log(` - reports/generated/${classNamesFile}`);
console.log(` - reports/generated/${classNameFile}`);
