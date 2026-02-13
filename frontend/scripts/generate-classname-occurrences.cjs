#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

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
    const target = path.join(root, filename);
    fs.writeFileSync(target, contents ? `${contents}\n` : "", "utf8");
}

const classNamesMatches = runRg("classNames\\s*=");
const classNameMatches = runRg("className\\s*=");

writeReport("CLASSNAMES_OCCURRENCES_CURRENT.txt", classNamesMatches);
writeReport("CLASSNAMES_OCCURRENCES.txt", classNamesMatches);
writeReport("CLASSNAME_OCCURRENCES.txt", classNameMatches);

console.log("Generated:");
console.log(" - CLASSNAMES_OCCURRENCES_CURRENT.txt");
console.log(" - CLASSNAMES_OCCURRENCES.txt");
console.log(" - CLASSNAME_OCCURRENCES.txt");
