#!/usr/bin/env bash
# Runs the accounting invariant campaign and fails unless successful releases AND refunds happened.
set -euo pipefail
rm -f /tmp/kolo-inv.log
FOUNDRY_INVARIANT_RUNS=${RUNS:-128} FOUNDRY_INVARIANT_DEPTH=${DEPTH:-40} forge test --match-contract KoloAccounting
read -r runs rel ref tr tf < <(awk '{r+=($1>0);f+=($2>0);tr+=$1;tf+=$2;n++} END{print n, r, f, tr, tf}' /tmp/kolo-inv.log)
echo "runs=$runs runsWithRelease=$rel runsWithRefund=$ref totalReleases=$tr totalRefunds=$tf"
[ "$tr" -gt 0 ] && [ "$tf" -gt 0 ] || { echo "FAIL: campaign never released or refunded"; exit 1; }
