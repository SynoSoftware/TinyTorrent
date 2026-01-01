
## **AGENT PROMPT — Torrent Details Pipeline Investigation (READ-ONLY, ROOT CAUSE)**

You are acting as a **systems + frontend integration investigator**.

This task is **investigation only**.
You are **NOT allowed to fix code yet**.

Your goal is to determine **why torrent details are unreliable or incorrect in the GUI**, and to identify **every failure point in the data pipeline**, from daemon → transport → schema → state → UI.

---

## **Problem Statement**

The **torrent details panel in the GUI frequently reports incorrect, missing, or stale data**.

Suspected causes include (but are not limited to):

* backend data not emitted correctly
* transport / RPC mismatch
* schema drift
* Zod validation failures
* silent drops or fallbacks in frontend state

This problem has occurred repeatedly and must be **understood end-to-end** before fixing.

---

## **Scope (end-to-end, no shortcuts)**

You must trace **the full data path**:

```
libtorrent →
daemon internal state →
serialization →
RPC / transport →
frontend fetch / subscription →
Zod schema →
frontend state store →
torrent details UI
```

No layer may be skipped.

---

## **Investigation Rules**

1. **Do NOT fix code**
2. **Do NOT propose refactors**
3. **Do NOT guess**
4. **Do NOT say “likely” without evidence**
5. If behavior cannot be proven from code, mark it as **unknown**
6. Treat silent failures as **critical findings**

Your job is to **map reality**, not improve it yet.

---

## **Investigation Tasks (answer ALL)**

### 1. Backend truth source

* Identify the **single authoritative internal structure** for torrent details
* List which fields are:

  * computed
  * cached
  * derived from libtorrent
* Identify update triggers (polling, alerts, events)

---

### 2. Serialization contract

* Locate the code that serializes torrent details
* List every field emitted
* For each field:

  * source variable
  * type
  * nullability
  * default behavior if missing

Explicitly identify:

* fields conditionally omitted
* fields renamed or transformed

---

### 3. Transport & RPC layer

* Identify how torrent details are requested or streamed
* Determine:

  * request timing
  * refresh cadence
  * race conditions with torrent lifecycle
* Confirm whether **partial payloads** are possible

---

### 4. Frontend intake

* Identify the exact entry point where torrent details enter the frontend
* Determine:

  * sync vs async handling
  * overwrite vs merge behavior
  * stale-data handling
* Identify any defensive logic that:

  * drops fields
  * substitutes defaults
  * suppresses errors

---

### 5. Zod schema analysis (CRITICAL)

* Locate the Zod schema for torrent details
* For each field:

  * required vs optional
  * default() usage
  * transform() usage
* Identify:

  * fields that fail validation
  * fields that are silently stripped
  * schema/backend mismatches

Explicitly answer:

> What happens in the frontend when Zod validation fails?

---

### 6. UI binding & rendering

* Identify how the torrent details UI reads data
* Determine:

  * conditional rendering paths
  * fallback values
  * memoization / stale selectors
* Identify cases where UI displays:

  * old data
  * placeholder data
  * partial data without warning

---

### 7. Failure modes catalog

Produce a list of **distinct failure modes**, e.g.:

* backend emits field X late
* Zod strips field Y
* frontend state overwrites valid data with undefined
* UI renders before subscription stabilizes

Each failure mode must include:

* layer
* trigger
* observable symptom

---

## **Deliverable Format**

Produce a **structured investigation report** with sections:

1. **Confirmed Facts**
2. **Schema Mismatches**
3. **Silent Failure Points**
4. **Race Conditions**
5. **Unknowns / Gaps**
6. **Root Cause Hypotheses (ranked, evidence-based)**

No fixes.
No opinions.
No “probably”.

---

## **Success Criteria**

At the end of this investigation, it must be possible to answer:

> “Exactly where and why torrent details become wrong — and under what conditions.”

Only after that will fixes be allowed.

