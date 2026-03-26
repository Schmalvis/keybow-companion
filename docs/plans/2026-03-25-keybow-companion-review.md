# Plan Review: Keybow Companion Implementation Plan

**Reviewer:** Code Review Agent
**Date:** 2026-03-25
**Verdict:** Issues Found

---

## Summary

The 13-task plan is well-structured and covers most of the design spec. The TDD approach is consistently applied, task ordering is largely correct, and the security-flagged shell execution issue has been resolved -- the plan uses execFile throughout. However, there are several important issues that need attention before implementation begins.

---

## 1. Shell Execution Security (PASSED)

The plan correctly uses execFile throughout (child_process.execFile with argument arrays). The CLAUDE.md, app-switcher.ts, and auto-switch.ts all use execFileAsync with proper argument separation. No instances of unsafe shell invocation were found. The sanitizeProcessName method adds defense-in-depth.

---

## 2. Critical Issues

### 2.1 IPC Server listens on all interfaces (CRITICAL)
**Location:** Task 11, ipc-server.ts -- this.server.listen(IPC_PORT)

net.Server.listen(port) with no host argument binds to 0.0.0.0 (all interfaces), exposing the IPC port to the local network. Any machine on the same network could send commands to the native host bridge.

**Fix:** Change to this.server.listen(IPC_PORT, '127.0.0.1') to bind to localhost only.

### 2.2 IPC Server has no authentication (CRITICAL)
**Location:** Task 11, ipc-server.ts

Any local process can connect to TCP port 23847 and send arbitrary JSON commands. Combined with 2.1, this is an unauthenticated command channel. The spec's "URL Allowlist" mitigation partially addresses this, but a shared secret or named pipe would be more robust.

**Fix:** Use a Windows named pipe (e.g., \\.\pipe\keybow-companion) instead of a TCP port. Named pipes support ACLs and are not network-accessible. Alternatively, generate a random token on startup and require it in all IPC messages.

### 2.3 native-host.js missing Chrome native messaging framing (CRITICAL)
**Location:** Task 11, extension/native-host.js

The plan does not show the native-host.js implementation. Chrome's native messaging protocol uses length-prefixed binary framing (4-byte little-endian length prefix on stdin/stdout), NOT newline-delimited JSON. If the implementation uses newline-delimited JSON for the Chrome-to-native-host communication, it will not work.

**Fix:** The plan must include the native-host.js code with proper 4-byte length-prefix read/write for stdin/stdout, and newline-delimited JSON for the TCP connection to the Electron app.

### 2.4 IPC JSON parsing has no error handling (CRITICAL)
**Location:** Task 11, ipc-server.ts -- JSON.parse(line)

A malformed JSON message will throw and crash the server. The JSON.parse call inside the socket data handler has no try/catch.

**Fix:** Wrap in try/catch and log the error, discarding malformed messages.

---

## 3. Important Issues

### 3.1 Schema version migration not implemented (IMPORTANT)
**Location:** Task 3, profiles.ts

The spec requires schema version migration (older versions run migration functions sequentially) and refusing to load newer versions. The plan's loadConfig() only checks version === CURRENT_VERSION or creates a default. There is no migration path or "version too new" error.

**Fix:** Add migration logic and a version-too-new check as specified in the design spec's "Schema Versioning" section.

### 3.2 Firmware does not validate LED hex color values (IMPORTANT)
**Location:** Task 8, firmware/code.py -- parse_command()

The firmware accepts any string after LED:<grid>: and passes it to set_led() via int(value[i:i+2], 16). Invalid hex (e.g., LED:A1:ZZZZZZ) will raise an unhandled exception in CircuitPython.

**Fix:** Add a try/except around the hex parsing, or validate with a regex before parsing.

### 3.3 Firmware parse_command does not handle LED:ALL (IMPORTANT)
**Location:** Task 8, firmware/code.py

The spec defines LED:ALL:<RRGGBB> and LED:ALL:OFF commands. The firmware's parse_command only handles individual key targets (grid_to_num(target) will fail for target == "ALL").

**Fix:** Add a branch for target == 'ALL' that iterates all 16 keys.

### 3.4 Firmware does not handle PROFILE: command (IMPORTANT)
**Location:** Task 8, firmware/code.py

The spec defines PROFILE:<name> as an informational message the firmware should accept. The firmware only parses PING and LED: prefixes; a PROFILE: message will be silently discarded (not harmful, but inconsistent with spec).

**Fix:** Add PROFILE: handling (can be a no-op, but should be explicitly recognized to avoid "unknown command" scenarios).

### 3.5 sanitizeProcessName test expectation is inconsistent (IMPORTANT)
**Location:** Task 5, test file

The test expects sanitizeProcessName('slack; rm -rf /') to return 'slackrm-rf'. The regex /[^a-zA-Z0-9.\-]/g strips spaces, semicolons, and slashes -- the result matches by accident. However, allowing dots in process names could enable path traversal (e.g., ..\..\something). The regex character class hyphen placement (\-) should be at the start or end to avoid ambiguity.

**Fix:** Tighten the regex. Consider restricting to [a-zA-Z0-9-] only plus .exe suffix validation.

### 3.6 No error feedback (red flash) implementation (IMPORTANT)
**Location:** Task 6, action-executor.ts

The spec requires: "If an action fails, the companion sends LED:FF0000 (red flash) followed by a 500ms delay and then restores the key's previous color." The action executor does not implement this error flash pattern.

**Fix:** Add error flash logic in the action executor's catch blocks.

---

## 4. Spec Coverage Gaps

### 4.1 Missing: Reconnect LED restore
The spec says "On reconnect: re-send all LED colors for the active profile to restore key state." Task 4 (serial.ts) does not show this behavior in the reconnection logic.

### 4.2 Missing: Extension registry registration
The spec requires registering the native messaging host manifest in the Windows registry at HKCU\Software\Google\Chrome\NativeMessagingHosts\com.keybow.companion. No task includes a registration step or install script.

### 4.3 Missing: Tray "Reconnect Device" menu item
The spec's system tray menu includes a "Reconnect Device" option. Task 9's tray menu implementation should be verified to include this.

### 4.4 Missing: Edge browser support
The spec says the extension supports both Chrome and Edge. The native-messaging.json only references Chrome. Edge needs a separate registry key at HKCU\Software\Microsoft\Edge\NativeMessagingHosts\.

---

## 5. Task Ordering Assessment

The dependency chain is correct:
- Tasks 1-2 (scaffolding, types) have no dependencies
- Task 3 (profiles) depends on Task 2 (types)
- Task 4 (serial) depends on Tasks 2-3
- Task 5 (app-switcher) is independent
- Task 6 (action executor) depends on Tasks 3-5
- Task 7 (auto-switch) depends on Tasks 3, 5
- Task 8 (firmware) is independent (could be done earlier)
- Task 9 (main entry) depends on Tasks 3-7
- Task 10 (UI) depends on Task 9
- Task 11 (extension) depends on Task 6
- Tasks 12-13 (integration) depend on all above

One note: Task 8 (firmware) has no automated tests. Given this is CircuitPython on hardware, manual testing is reasonable, but the plan should note this explicitly.

---

## 6. Test Coverage Assessment

Tests are provided for Tasks 2-7 and cover core logic well. Notable gaps:
- No tests for ipc-server.ts or native-host.ts (Task 11)
- No tests for the preload script IPC bridge (Task 9)
- No tests for profile deletion cascading to autoSwitch and profileOrder
- No test for the "version too new" config scenario (because migration logic is missing)

---

## 7. Suggestions (Nice to Have)

- Wrap the firmware's while True loop in try/except for graceful error recovery
- Back up profiles.json to a .bak file before overwriting
- Handle EADDRINUSE for the IPC server port with a clear error message
