# Kolo Contracts — Security Review

**Date:** October 2026 (test counts refreshed 23 Oct 2026)
**Scope:** `contracts/kolo/` — PayeeRegistry, KoloFactory, KoloGroupPot, KoloTuitionPot, KoloCctpReceiver, KoloSweeperFactory
**Test result (current):** 94/94 passing (`forge test`). The 83/83 figure below is the count at the time of the original review. Server API tests: 40/40 (`bun test server/src/__tests__`).

> This is an internal review by the authors, not a third-party audit.

---

## Summary

Six High-severity findings were identified and fixed. Zero Medium or above remain open.

---

## Findings Fixed

### H1 — Trust-Anchor Injection via Factory Init Params
**Location:** `KoloFactory._register` / `KoloGroupPot.initialize` / `KoloTuitionPot.initialize`

**What was wrong:** `createGroupPot` and `createTuitionPot` forwarded the caller's `params` bytes directly to `initialize()` without enforcing that the embedded `usdc`, `factory`, and `potId` values matched the factory's own canonical values. A malicious creator could supply a custom USDC address (e.g. a fee-stealing or re-entrant token), a rogue factory (bypassing global stats accounting), or an arbitrary `potId`.

**Fix:** Both pot contracts now expose a `setCanonicals(address usdc, address factory, uint256 potId)` function that can only be called once and only by the factory address set during `initialize()`. `KoloFactory._enforceCanonicals()` calls this immediately after every `initialize()` call, overwriting whatever the caller encoded.

---

### H2 — Dispute Resolution Double-Vote
**Location:** `KoloGroupPot.resolve`

**What was wrong:** `resolve()` incremented `resolveCount` / `disputeCount` on every call but did not track which signer had already voted. A single co-signer or organizer could call `resolve()` repeatedly and unilaterally reach threshold.

**Fix:** Added `resolveBitmap` (uint128) to the `Invoice` struct. Each eligible signer sets their bit on first vote; a second vote from the same address reverts with `AlreadyVotedOnDispute()`. The bitmap is reset to 0 in `flagInvoice()` whenever a new dispute starts.

---

### H3 — Early `close()` Ignores Co-Signer Threshold (TuitionPot)
**Location:** `KoloTuitionPot.close`

**What was wrong:** `close()` was gated only on `msg.sender == organizer`, ignoring the configured `threshold` and co-signers, allowing the organizer to unilaterally force `Refunding`.

**Fix:** `close()` now records organizer approval via `closeApprovalBitmap` (bit 127). When `threshold > 1`, each required co-signer calls `approveClose()`; the pot transitions to `Refunding` only when `closeApprovalCount >= threshold`. `KoloGroupPot` received the same `close()` / `approveClose()` pattern.

---

### H4 — Residual Token Allowance After `relay()` / `sweep()`
**Location:** `KoloCctpReceiver.relay`, `KoloDepositSweeper.sweep`

**What was wrong:** After the `contributeFor` call, any residual allowance to the pot was not zeroed. If the pot pulled less than the approved amount, the leftover allowance could be drained later by a compromised or upgraded pot.

**Fix:** Both functions now unconditionally read the remaining allowance after the call and call `safeDecreaseAllowance(pot, residual)` to zero it out, on both success and failure paths.

---

### H5 — `release()` Skips Registry Re-Verification
**Location:** `KoloGroupPot.release`

**What was wrong:** `submitInvoice()` validated registry payee status via `_requirePayeeActive()`, but `release()` only resolved the wallet without re-checking. A payee revoked between approval and release could still receive funds.

**Fix:** `release()` now calls `_requirePayeeActive(inv.payeeIdx)` before sending funds. If the payee was revoked after invoice approval, the release reverts with `PayeeRegistryRevoked`.

---

### H6 — Leftover Refund Not Reachable Without Milestones (GroupPot)
**Location:** `KoloGroupPot._requireLeftoverRefund`, `_checkClose`

**What was wrong:** For pots with no milestones, `_checkClose()` returned early without transitioning to `Refunding`. The only way to refund a leftover (after final release) was `triggerRefunding()`, which requires deadline + grace period to pass — blocking immediate exit.

**Fix:** Added `close()` / `approveClose()` to `KoloGroupPot`. The organizer calls `close()` after the final release; once threshold is met, the pot moves to `Refunding` and contributors can claim the leftover. `_checkClose()` still auto-transitions when all milestones are Done.

---

## Test Coverage

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| KoloGroupPotTest | 42 | 42 | 0 |
| KoloTuitionPotTest | 20 | 20 | 0 |
| PayeeRegistryTest | 17 | 17 | 0 |
| KoloCctpTest | 11 | 11 | 0 |
| KoloAccountingCoverage | 3 | 3 | 0 |
| KoloAccountingInvariantTest | 1 | 1 | 0 |
| **Total** | **94** | **94** | **0** |

Includes the stateful accounting invariant tests (`KoloAccountingInvariantTest`, `KoloAccountingCoverage`). Fuzz tests: `testFuzz_proRata_conservation` (256 runs) and `testFuzz_tuition_proRata` (256 runs) both pass.

---

## Bug Fixes (Non-Audit)

These were test failures from prior sessions, not security issues:

1. **Pro-rata refund math** — replaced `contrib * remaining / totalContributed` with `contrib * remaining / totalUnrefundedContrib` (new field tracking unclaimed contributions) and "last claimant gets all remaining" shortcut. Ensures Σ refunds = remaining exactly.
2. **DisputeCooldown false positive** — only enforce cooldown when `lastFlagTime[msg.sender] != 0`.
3. **`payTerm` pause check** — added `whenNotPaused` to `KoloTuitionPot.payTerm`.
4. **`handleRevocation` double-pause** — only calls `_pause()` when `!paused()`.
5. **`_getMilestone` return order** — test helper had `cap` and `released` swapped.
6. **`test_grantRegistrar` prank bug** — `vm.prank` was consumed by `registry.REGISTRAR_ROLE()` getter call before `grantRole`; fixed by reading the role into a local variable first.
7. **Fuzz balance** — fuzz tests now mint exact amounts for each fuzz input.
