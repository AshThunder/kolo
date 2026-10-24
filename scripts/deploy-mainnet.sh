#!/usr/bin/env bash
# Kolo — Arc MAINNET deploy. Idempotent + resumable. NO secrets are printed or written.
#
#   Real:     CONFIRM_MAINNET=yes ./scripts/deploy-mainnet.sh
#   Dry run:  RPC_URL=http://127.0.0.1:8599 DRY_RUN=1 ./scripts/deploy-mainnet.sh   (anvil fork only)
#
# State: notes/mainnet-deployment.json (addresses + tx hashes only). Re-running skips finished steps.
# Key:   ~/.kolo/mainnet-deployer.env loaded in-process, converted to a throwaway encrypted keystore in /dev/shm (deleted on exit); never in argv/logs.
set -euo pipefail
set +x
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")/.."                      # sandbox/
NOTES=${NOTES_DIR:-../notes}
STATE=${STATE_FILE:-$NOTES/mainnet-deployment.json}
LOG=${LOG_FILE:-$NOTES/MAINNET.md}
ENV_FILE=${KOLO_ENV_FILE:-$HOME/.kolo/mainnet-deployer.env}
RPC_URL=${RPC_URL:-https://rpc.mainnet.arc.io}
DRY_RUN=${DRY_RUN:-0}

# ── Verified constants (Circle/Arc docs, cross-checked on-chain below) ───────────────
CHAIN_ID=5042                                                       # docs.arc.io/arc/references/rpc-endpoints
USDC=0x3600000000000000000000000000000000000000                     # docs.arc.io/integrate/infrastructure (6-dec ERC-20 view)
CCTP_DOMAIN=26                                                      # developers.circle.com/cctp/references/contract-addresses
MESSAGE_TRANSMITTER_V2=0x81D40F21F12A8F0E3252Bccb954D722d4c464B64   # same page, MessageTransmitterV2, Arc row (mainnet)
TOKEN_MESSENGER_V2=0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d       # same page, TokenMessengerV2, Arc row (mainnet)
MIN_BALANCE_WEI=${MIN_BALANCE_WEI:-1000000000000000000}             # abort if < 1.0 USDC (native 18-dec)
MAX_GAS_PRICE_WEI=${MAX_GAS_PRICE_WEI:-100000000000}                # abort if > 100 gwei (normal: 20 gwei)

# ── Safety gates ─────────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == 1 ]]; then
  [[ "$RPC_URL" == http://127.0.0.1:* || "$RPC_URL" == http://localhost:* ]] || { echo "DRY_RUN requires a local anvil RPC"; exit 1; }
else
  [[ "${CONFIRM_MAINNET:-}" == yes ]] || { echo "Refusing: set CONFIRM_MAINNET=yes to broadcast on Arc MAINNET."; exit 1; }
fi
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE"; exit 1; }
[[ "$(stat -c %a "$ENV_FILE")" == 600 ]] || { echo "$ENV_FILE must be chmod 600"; exit 1; }
export KOLO_ENV_FILE=$ENV_FILE
. scripts/lib-deployer-signer.sh
export ETH_RPC_URL=$RPC_URL

log(){ printf '%s\n' "$*" | tee -a "$LOG"; }
[[ -f "$STATE" ]] || echo '{}' > "$STATE"
get(){ jq -r --arg k "$1" '.[$k] // empty' "$STATE"; }
put(){ local t; t=$(mktemp); jq --arg k "$1" --arg v "$2" '.[$k]=$v' "$STATE" > "$t" && mv "$t" "$STATE"; }
py(){ [[ "$(python3 -c "print(int($1))")" == 1 ]]; }
has_code(){ [[ "$(cast code "$1" 2>/dev/null)" != "0x" && -n "$(cast code "$1" 2>/dev/null)" ]]; }

# ── Preflight (read-only) ────────────────────────────────────────────────────────────
[[ "$(cast chain-id)" == "$CHAIN_ID" ]] || { echo "wrong chain id"; exit 1; }
has_code $USDC || { echo "USDC missing"; exit 1; }
[[ "$(cast call $USDC 'symbol()(string)' | tr -d '"')" == USDC && "$(cast call $USDC 'decimals()(uint8)')" == 6 ]] || { echo "USDC sanity failed"; exit 1; }
[[ "$(cast call $MESSAGE_TRANSMITTER_V2 'localDomain()(uint32)')" == "$CCTP_DOMAIN" ]] || { echo "CCTP domain mismatch"; exit 1; }
[[ "$(cast call $TOKEN_MESSENGER_V2 'localMessageTransmitter()(address)')" == "$MESSAGE_TRANSMITTER_V2" ]] || { echo "TokenMessenger/Transmitter mismatch"; exit 1; }
BAL=$(cast balance "$DEPLOYER"); GP=$(cast gas-price)
py "$BAL >= $MIN_BALANCE_WEI" || { echo "deployer balance too low: $BAL wei"; exit 1; }
py "$GP <= $MAX_GAS_PRICE_WEI" || { echo "gas price too high: $GP wei"; exit 1; }
START_BAL=$BAL
log ""; log "### Deploy run $(date -Is) — rpc=$([[ $DRY_RUN == 1 ]] && echo 'LOCAL FORK (dry run)' || echo 'ARC MAINNET') chain=$CHAIN_ID deployer=$DEPLOYER balance_wei=$BAL gas_price_wei=$GP"

forge build --quiet >/dev/null

# no in-flight tx allowed (resumability safety)
nonce_ok(){ [[ "$(cast nonce "$DEPLOYER" --block pending)" == "$(cast nonce "$DEPLOYER")" ]] || { echo "pending tx in flight; wait and re-run"; exit 1; }; }

# deploy <stateKey> <artifact path:Name> [ctor args...]
deploy(){
  local key=$1 target=$2; shift 2
  local cur; cur=$(get "$key")
  if [[ -n "$cur" ]] && has_code "$cur"; then log "- ✓ $key already deployed: \`$cur\`"; return; fi
  nonce_ok
  local out addr tx
  if [[ $# -gt 0 ]]; then out=$(forge create "$target" "${SIGN[@]}" --broadcast --json --constructor-args "$@")
  else out=$(forge create "$target" "${SIGN[@]}" --broadcast --json); fi
  addr=$(jq -r .deployedTo <<<"$out"); tx=$(jq -r .transactionHash <<<"$out")
  has_code "$addr" || { echo "deploy of $key failed"; exit 1; }
  put "$key" "$addr"; put "${key}_tx" "$tx"
  log "- ✅ $key deployed: \`$addr\` (tx \`$tx\`)"
}
# wire <stateKey> <target> <view sig> <expected> <send sig> <arg>
wire(){
  local key=$1 target=$2 viewsig=$3 expected=$4 sendsig=$5 arg=$6
  if [[ "$(cast call "$target" "$viewsig" | tr 'A-F' 'a-f')" == "$(echo "$expected" | tr 'A-F' 'a-f')" ]]; then log "- ✓ $key already set"; return; fi
  nonce_ok
  local tx; tx=$(cast send "$target" "$sendsig" "$arg" "${SIGN[@]}" --json | jq -r .transactionHash)
  [[ "$(cast call "$target" "$viewsig" | tr 'A-F' 'a-f')" == "$(echo "$expected" | tr 'A-F' 'a-f')" ]] || { echo "$key failed (state not updated)"; exit 1; }
  put "$key" "$tx"; log "- ✅ $key (tx \`$tx\`)"
}

# ── 1. contracts ─────────────────────────────────────────────────────────────────────
deploy registry     contracts/kolo/PayeeRegistry.sol:PayeeRegistry "$DEPLOYER"
deploy groupImpl    contracts/kolo/KoloGroupPot.sol:KoloGroupPot
deploy tuitionImpl  contracts/kolo/KoloTuitionPot.sol:KoloTuitionPot
# factory(usdc, registry, treasury, owner) — treasury = deployer, owner = deployer, feeBps = 0 (default)
deploy factory      contracts/kolo/KoloFactory.sol:KoloFactory "$USDC" "$(get registry)" "$DEPLOYER" "$DEPLOYER"
deploy receiver     contracts/kolo/KoloCctpReceiver.sol:KoloCctpReceiver "$MESSAGE_TRANSMITTER_V2" "$USDC" "$DEPLOYER"
deploy sweeper      contracts/kolo/KoloCctpReceiver.sol:KoloSweeperFactory "$USDC"

# ── 2. wiring ────────────────────────────────────────────────────────────────────────
F=$(get factory)
wire wire_groupImpl   "$F" 'groupPotImpl()(address)'   "$(get groupImpl)"   'setGroupPotImpl(address)'   "$(get groupImpl)"
wire wire_tuitionImpl "$F" 'tuitionPotImpl()(address)' "$(get tuitionImpl)" 'setTuitionPotImpl(address)' "$(get tuitionImpl)"
wire wire_receiver    "$F" 'cctpReceiver()(address)'   "$(get receiver)"    'setCctpReceiver(address)'   "$(get receiver)"

# ── 3. post-deploy assertions ────────────────────────────────────────────────────────
R=$(get registry)
[[ "$(cast call "$F" 'usdc()(address)')" == "$USDC" ]] || { echo "factory usdc mismatch"; exit 1; }
[[ "$(cast call "$F" 'registry()(address)')" == "$R" ]] || { echo "factory registry mismatch"; exit 1; }
[[ "$(cast call "$F" 'owner()(address)')" == "$DEPLOYER" && "$(cast call "$F" 'feeBps()(uint16)')" == 0 ]] || { echo "factory owner/fee mismatch"; exit 1; }
[[ "$(cast call "$(get receiver)" 'transmitter()(address)')" == "$MESSAGE_TRANSMITTER_V2" && "$(cast call "$(get receiver)" 'owner()(address)')" == "$DEPLOYER" ]] || { echo "receiver mismatch"; exit 1; }
[[ "$(cast call "$(get sweeper)" 'usdc()(address)')" == "$USDC" ]] || { echo "sweeper mismatch"; exit 1; }

# ── 4. OPTIONAL payees (only when real wallets are provided; NEVER placeholder addresses) ─
# DEMO_SCHOOL_WALLET / DEMO_SCHOOL_NAME, DEMO_VENDOR_WALLET / DEMO_VENDOR_NAME
register(){  # key kind wallet name
  local key=$1 kind=$2 wallet=$3 name=$4 verify=$5
  [[ -z "$wallet" ]] && return
  [[ -n "$(get "$key")" ]] && { log "- ✓ $key already registered (#$(get "$key"))"; return; }
  nonce_ok
  local id; id=$(cast call "$R" 'walletToPayeeId(address)(uint256)' "$wallet")
  if [[ "$id" == 0 ]]; then
    cast send "$R" 'registerPayee(uint8,address,bytes32,bytes32)' "$kind" "$wallet" "$(cast keccak "$name")" "$(cast keccak "doc:$name")" "${SIGN[@]}" >/dev/null
    id=$(cast call "$R" 'walletToPayeeId(address)(uint256)' "$wallet")
  fi
  if [[ "$verify" == 1 ]]; then nonce_ok; cast send "$R" 'verify(uint256,bytes32)' "$id" "$(cast keccak "doc:$name")" "${SIGN[@]}" >/dev/null || true; fi
  put "$key" "$id"; log "- ✅ $key payee #$id wallet=\`$wallet\` name=\"$name\" (nameHash keccak of name; verified=$verify)"
}
register payee_school 0 "${DEMO_SCHOOL_WALLET:-}" "${DEMO_SCHOOL_NAME:-}" 1
register payee_vendor 1 "${DEMO_VENDOR_WALLET:-}" "${DEMO_VENDOR_NAME:-}" 0

END_BAL=$(cast balance "$DEPLOYER")
SPENT=$(python3 -c "print($START_BAL - $END_BAL)")
log "- **Run complete.** gas spent this run: $SPENT wei = $(cast from-wei $SPENT) USDC; balance now $(cast from-wei $END_BAL) USDC"
log ""; log '```json'; jq 'with_entries(select(.key|test("_tx$|^wire_")|not))' "$STATE" | tee -a "$LOG"; log '```'
