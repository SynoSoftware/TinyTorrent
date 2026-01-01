
## **AGENT PROMPT — Constants & Configuration Consistency Audit (READ-ONLY)**

You are performing a **read-only audit**.
You are **NOT allowed to modify code** in this task.

Your goal is to **identify and list** any inconsistencies between the current implementation and the project’s **configuration standard**.

---

## **Context**

This project uses a **single source of truth** for shared behavior and UI/daemon knobs via:

```
constants.json
```

This file defines **global invariants** and **shared parameters** that **all components must obey**, including (but not limited to):

* navbar
* statusbar
* torrent table
* daemon / session behavior where applicable

Significant effort has already been invested to align components to these constants.

---

## **Audit Scope**

Review the **recently modified code**, especially:

* `DaemonSmokeTest.cpp`
* Any daemon or serialization changes added to support the smoke test
* Any code paths touched that may:

  * hardcode values
  * bypass shared configuration
  * duplicate constants
  * introduce implicit defaults

---

## **Audit Rules**

1. **Do NOT change code**
2. **Do NOT propose fixes**
3. **Do NOT justify deviations**
4. **Do NOT speculate**
5. Only report **provable findings** based on code inspection

If something cannot be proven either way, mark it as **“unknown / requires clarification”**.

---

## **What to Produce**

Produce a **structured audit report** with the following sections:

### 1. **Confirmed Violations**

List every place where:

* a value is hardcoded that should come from `constants.json`
* a shared knob is duplicated or shadowed
* a component ignores an existing constant

For each item, include:

* file
* line range
* constant name (expected)
* hardcoded or conflicting value (actual)

---

### 2. **Potential Drift / Risk Areas**

List areas where:

* configuration is partially applied
* defaults are assumed implicitly
* new knobs were introduced outside `constants.json`

Clearly mark these as **risk**, not confirmed bugs.

---

### 3. **Constants Coverage Gaps**

List any constants in `constants.json` that:

* appear relevant to touched components
* but are not referenced or enforced

This helps detect **silent regressions**.

---

### 4. **Consistency Scorecard**

Provide a short table:

| Component            | Fully Compliant | Partial | Non-Compliant | Unknown |
| -------------------- | --------------- | ------- | ------------- | ------- |
| Daemon               |                 |         |               |         |
| Smoke Test           |                 |         |               |         |
| Shared Serialization |                 |         |               |         |

No commentary. Just classification.

---

## **Output Constraints**

* Factual
* Concise
* No editorial tone
* No fixes
* No refactors
* No “recommended changes”

This audit is for **decision-making**, not implementation.




seen problems: add torrent window - font, icons proportions not ok (too small - probably not respecting the interface)
confirm removal modal (and maybe all other modals confirmation) - too small 
