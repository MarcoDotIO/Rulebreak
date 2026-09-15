# End-to-end acceptance scenarios (RB-013 prep / RB-010 companion)

Owner: UI Design Goblin. Executable Playwright (or equivalent) checks land with `tests/e2e` after the UI can talk to real fixtures.

| ID | Scenario | Expected evidence | Depends on |
| --- | --- | --- | --- |
| A1 | Known trade-failure sequence (scripted) | Finding `confirmed`; rule id visible; responsible action id visible | RB-006–RB-009 |
| A2 | Clean fixed-target control | No false vulnerable badge; legitimate trade still works | RB-006, RB-009 |
| A3 | Ordinary legitimate trades on fixed target | No conservation violation | RB-006 |
| A4 | Replay divergence | UI shows diverged / not_reproduced distinctly | RB-009 |
| A5 | Reconnect with duplicate event ids | Timeline dedupes; no double entries | RB-008 |
| A6 | Stop control mid-run | Campaign stops; terminal state persisted | RB-008 |
| A7 | Live mode without spend approval | Start refused; no paid calls | RB-003, RB-004 |
| A8 | Secrets not in frontend bundle | Grep/build check for operator token / API keys | RB-010, RB-012 |

Label every recorded run: **live**, **scripted**, **mocked**, or **recorded**.

Independent challenge (not author-only): verifier/replay evidence from Engineer Overlord must be reproducible from the UI/finding export path.
