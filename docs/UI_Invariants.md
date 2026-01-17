

\# UI Invariants (Authoritative)



\## 1. Truth Ownership



1\. The UI \*\*never owns truth\*\* about:



&nbsp;  \* torrent state

&nbsp;  \* filesystem state

&nbsp;  \* disk space

&nbsp;  \* permissions

&nbsp;  \* existence of files



2\. The UI may only render:



&nbsp;  \* daemon-reported facts (Transmission RPC)

&nbsp;  \* host-agent-reported facts (local only)

&nbsp;  \* derived/computed views (pure functions)



If the UI cannot prove a fact, it must render \*\*unknown\*\*, not inferred.



---



\## 2. Absence vs Disablement



1\. A feature that is unavailable \*\*must not exist in the UI\*\*.



2\. Disabled controls are allowed \*\*only\*\* when:



&nbsp;  \* the feature exists

&nbsp;  \* but is temporarily blocked by state (e.g. paused torrent)



3\. Capability-based disablement is forbidden.



> Capability absence ⇒ UI absence

> Capability presence ⇒ full behavior



---



\## 3. No Simulation



1\. The UI must not simulate:



&nbsp;  \* filesystem results

&nbsp;  \* disk space

&nbsp;  \* file existence

&nbsp;  \* recovery outcomes



2\. Mock data is forbidden outside of:



&nbsp;  \* development builds

&nbsp;  \* tests

&nbsp;  \* storybooks



If real data is unavailable, render \*\*nothing\*\* or \*\*unknown\*\*.



---



\## 4. Locality Rule



1\. Host-backed features are available \*\*only\*\* when:



&nbsp;  \* daemon endpoint is loopback, and

&nbsp;  \* host agent is present



2\. When locality is false:



&nbsp;  \* host-backed UI does not exist

&nbsp;  \* no partial fallbacks

&nbsp;  \* no “manual substitute” implied



Remote ≠ degraded local

Remote = different product surface



---



\## 5. Single Gate Rule



1\. Each domain has exactly \*\*one gate\*\*:



&nbsp;  \* recovery

&nbsp;  \* set-location

&nbsp;  \* destructive actions



2\. UI components must not:



&nbsp;  \* re-run sequences

&nbsp;  \* probe state independently

&nbsp;  \* guess outcomes



All entry points converge into the same gate.



---



\## 6. Deterministic Rendering



1\. Given the same:



&nbsp;  \* daemon snapshot

&nbsp;  \* host facts

&nbsp;  \* UI state



…the UI must render identically.



2\. Time-based behavior must be explicit:



&nbsp;  \* timers are centralized

&nbsp;  \* no ad-hoc intervals in components



---



\## 7. No Side Effects in Views



1\. View components must not:



&nbsp;  \* call RPC

&nbsp;  \* call host agent

&nbsp;  \* write persistence

&nbsp;  \* trigger recovery

&nbsp;  \* mutate global state



Views render. Nothing else.



---



\## 8. Failure Is Normal



1\. UI must assume:



&nbsp;  \* daemon can restart

&nbsp;  \* UI can crash

&nbsp;  \* host agent can disappear



2\. Recovery from reconnection must not:



&nbsp;  \* rely on previous UI memory

&nbsp;  \* depend on optimistic assumptions



Stateless reconnection is mandatory.



---



\## 9. Naming Rule



1\. User-facing language must map to \*\*architecture\*\*, not implementation:



&nbsp;  \* “Transmission” = RPC-only mode

&nbsp;  \* “TinyTorrent” = local host + UI



2\. No transport terms in UI:



&nbsp;  \* no websocket

&nbsp;  \* no polling

&nbsp;  \* no protocol names



---



\## 10. Violation = Bug



Any violation of the above:



\* is not a UX discussion

\* is not a design tradeoff

\* is not “temporary”



It is a \*\*bug\*\*.





