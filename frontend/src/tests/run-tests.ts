import { runAllTests } from "./recoveryAutomation.test.ts";

async function main() {
    try {
        await runAllTests();
        // success
        // console.log handled by tests
    } catch (err) {
        console.error("TESTS FAILED:", err);
        throw err;
    }
}

void main();
