#!/usr/bin/env bash
# Kolo mainnet SHOWCASE flow (real USDC, ~1.0 moved to throwaway demo wallets + ~0.1 gas).
#   Fork dry run:  RPC_URL=http://127.0.0.1:8599 DRY_RUN=1 STATE_FILE=… OUT=… ./scripts/mainnet-demo.sh
#   Real:          CONFIRM_MAINNET=yes ./scripts/mainnet-demo.sh
# Final state: #A completed (release + refunds), #B active mid-flight (invoice awaiting 2nd approval, live subscription),
#              #C tuition pot with Term 1 paid, Term 2 scheduled (the keeper pays it when due).
# STOPS at the first failed tx (no blind retries). Keys never printed. Titles are posted to the Fly server (hash-gated).
set -euo pipefail; set +x; export PATH=$HOME/.foundry/bin:$PATH; cd "$(dirname "$0")/.."
STATE=${STATE_FILE:-../notes/mainnet-deployment.json}; OUT=${OUT:-../notes/mainnet-demo-result.tsv}
RPC_URL=${RPC_URL:-https://rpc.mainnet.arc.io}; DRY_RUN=${DRY_RUN:-0}; export ETH_RPC_URL=$RPC_URL
API=${KOLO_API:-https://kolo-arc-api.fly.dev/api/kolo}
if [[ $DRY_RUN == 1 ]]; then [[ "$RPC_URL" == http://127.0.0.1:* ]] || { echo "DRY_RUN needs local fork"; exit 1; }
else [[ "${CONFIRM_MAINNET:-}" == yes ]] || { echo "set CONFIRM_MAINNET=yes"; exit 1; }; fi
set -a; . ~/.kolo/mainnet-demo-wallets.env; set +a
USDC=0x3600000000000000000000000000000000000000
get(){ jq -r --arg k "$1" '.[$k]' "$STATE"; }
F=$(get factory); SCHOOL_ID=$(get payee_school)
[[ "$(cast chain-id)" == 5042 ]] || exit 1
: > "$OUT"
bal(){ cast call $USDC "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
send(){ local name=$1 pkv=$2 to=$3; shift 3; local out
  out=$(cast send "$to" "$@" --private-key "${!pkv}" --json 2>&1) || { echo "FAIL $name: ${out:0:200}"; exit 1; }
  [[ "$(jq -r .status <<<"$out")" == 0x1 ]] || { echo "FAIL $name: status $(jq -r .status <<<"$out")"; exit 1; }
  printf '%s\t%s\t%s\n' "$name" "$(jq -r .transactionHash <<<"$out")" "$(( $(jq -r .gasUsed <<<"$out") ))" >> "$OUT"; echo "ok $name"; }
note(){ printf '%s\t%s\t\n' "$1" "$2" >> "$OUT"; echo "$1 = $2"; }
publish(){ [[ $DRY_RUN == 1 ]] && return 0; local i  # the server's pot list is cached for a few seconds, so retry (a title POST is not a tx)
  for i in 1 2 3 4 5 6; do curl -fsS -X POST "$API/meta" -H 'content-type: application/json' -d "$(jq -nc --argjson id "$1" --arg t "$2" '{potId:$id,title:$t}')" >/dev/null 2>&1 && { echo "title published for #$1"; return 0; }; sleep 6; done
  echo "WARN: title for #$1 not published (re-run the POST /meta by hand)"; }
potid(){ cast call $F "potCount()(uint256)" | awk '{print $1}'; }

if [[ -n "${RESUME_A:-}" ]]; then echo "resuming after pot A creation (#$RESUME_A); wallets already funded"
elif [[ $DRY_RUN == 1 ]]; then
  for a in $DEMO_ORG_ADDRESS $DEMO_COSIGNER1_ADDRESS $DEMO_COSIGNER2_ADDRESS; do cast rpc anvil_setBalance $a 0x6F05B59D3B20000 >/dev/null; done
  for pair in "$DEMO_ORG_ADDRESS 400000" "$DEMO_COSIGNER1_ADDRESS 300000" "$DEMO_COSIGNER2_ADDRESS 300000"; do set -- $pair; cast send $USDC "mint(address,uint256)" $1 $2 --private-key "$DEMO_ORG_PK" >/dev/null; done
else
  . scripts/lib-deployer-signer.sh
  for pair in "$DEMO_ORG_ADDRESS 400000" "$DEMO_COSIGNER1_ADDRESS 300000" "$DEMO_COSIGNER2_ADDRESS 300000"; do set -- $pair
    h=$(cast send $USDC "transfer(address,uint256)" "$1" "$2" "${SIGN[@]}" --json | jq -r .transactionHash); printf 'fund-%s\t%s\t\n' "${1:0:8}" "$h" >> "$OUT"; echo "funded $1 with $2 (6-dec units)"; done
fi
NOW=$(date +%s); DL=$((NOW+86400*30))
ORG=DEMO_ORG_PK; C1=DEMO_COSIGNER1_PK; C2=DEMO_COSIGNER2_PK
mkgroup(){ # title target
  cast abi-encode "f(address,address,address,uint256,bytes32,uint128,uint96,uint40,bool,uint8,address[],uint256[],address[],bytes32[],uint8[],uint128[])" \
  $DEMO_ORG_ADDRESS $USDC $F 0 $(cast keccak "$1") $2 0 $DL false 2 "[$DEMO_COSIGNER1_ADDRESS,$DEMO_COSIGNER2_ADDRESS]" "[0]" "[$DEMO_VENDOR_ADDRESS]" "[$(cast format-bytes32-string deposit)]" "[0]" "[300000]"; }

# ── A: completed pot — contributions → invoice → 2-of-2 approval → release → close → refunds ──────────────
TA="Kemi and Tunde's Housewarming"
if [[ -n "${RESUME_A:-}" ]]; then A=$RESUME_A; else send A-create $ORG $F "createGroupPot(bytes)" "$(mkgroup "$TA" 250000)"; A=$(potid); fi
:; AP=$(cast call $F "potAddress(uint256)(address)" $A); note A_id $A; note A_pot $AP; publish $A "$TA"
for v in ORG C1 C2; do send A-approve-$v ${!v} $USDC "approve(address,uint256)" $AP 250000; done
send A-contribute-ORG $ORG $AP "contribute(uint128,bytes32)" 100000 $(cast keccak "Kemi")
send A-contribute-C1  $C1  $AP "contribute(uint128,bytes32)" 100000 $(cast keccak "Tunde")
send A-contribute-C2  $C2  $AP "contribute(uint128,bytes32)" 50000  $(cast keccak "Ife")
send A-submitInvoice  $ORG $AP "submitInvoice(uint8,uint8,uint248,bytes32,bytes32)" 0 0 100000 $(cast keccak "Venue deposit - invoice 0042") $(cast format-bytes32-string "venue-deposit")
send A-approve-inv-C1 $C1  $AP "approve(uint256)" 1
send A-approve-inv-C2 $C2  $AP "approve(uint256)" 1
V0=$(bal $DEMO_VENDOR_ADDRESS)
send A-release $ORG $AP "release(uint256)" 1
[[ $(( $(bal $DEMO_VENDOR_ADDRESS) - V0 )) == 100000 ]] || { echo "FAIL vendor did not receive 100000"; exit 1; }
send A-close $ORG $AP "close()"
send A-approveClose $C1 $AP "approveClose()"
for v in ORG C1 C2; do send A-claimRefund-$v ${!v} $AP "claimRefund()"; done
[[ "$(bal $AP)" == 0 ]] || { echo "FAIL pot A not empty"; exit 1; }

# ── B: active pot — real contributions, a live subscription, an invoice waiting for its 2nd approval ───────
TB="Adaeze's Owambe"
send B-create $ORG $F "createGroupPot(bytes)" "$(mkgroup "$TB" 400000)"
B=$(potid); BP=$(cast call $F "potAddress(uint256)(address)" $B); note B_id $B; note B_pot $BP; publish $B "$TB"
for v in ORG C1 C2; do send B-approve-$v ${!v} $USDC "approve(address,uint256)" $BP 300000; done
send B-contribute-ORG $ORG $BP "contribute(uint128,bytes32)" 100000 $(cast keccak "Adaeze")
send B-contribute-C1  $C1  $BP "contribute(uint128,bytes32)" 80000  $(cast keccak "Obi")
send B-subscribe-C2   $C2  $BP "subscribe(uint96,uint32,uint32)" 50000 86400 3
send B-pull-sub1      $ORG $BP "pull(uint256)" 1
send B-contribute-C2  $C2  $BP "contribute(uint128,bytes32)" 40000  $(cast keccak "Zainab")
send B-submitInvoice  $ORG $BP "submitInvoice(uint8,uint8,uint248,bytes32,bytes32)" 0 0 120000 $(cast keccak "Catering and hall - invoice 0107") $(cast format-bytes32-string "catering-hall")
send B-approve-inv-C1 $C1  $BP "approve(uint256)" 1
echo "B balance: $(bal $BP)"

# ── C: tuition pot — verified school payee, term 1 paid now, term 2 scheduled (keeper pays it when due) ──────
TC="Chinedu's JSS3 Tuition - Term 1"
T=$(cast abi-encode "f(address,address,address,uint256,bytes32,uint96,uint40,bool,uint256,uint8,address[],uint40[],uint128[])" \
  $DEMO_ORG_ADDRESS $USDC $F 0 $(cast keccak "$TC") 0 $((NOW+86400*21)) true $SCHOOL_ID 1 "[$DEMO_COSIGNER1_ADDRESS]" "[$((NOW+3600)),$((NOW+86400*14))]" "[50000,50000]")
send C-create $ORG $F "createTuitionPot(bytes)" $T
C=$(potid); CP=$(cast call $F "potAddress(uint256)(address)" $C); note C_id $C; note C_pot $CP; publish $C "$TC"
send C-approve-ORG $ORG $USDC "approve(address,uint256)" $CP 300000
send C-approve-C1  $C1  $USDC "approve(address,uint256)" $CP 300000
send C-contribute-ORG $ORG $CP "contribute(uint128,bytes32)" 70000 $(cast keccak "Mum")
send C-contribute-C1  $C1  $CP "contribute(uint128,bytes32)" 50000 $(cast keccak "Uncle")
S0=$(bal $DEMO_SCHOOL_ADDRESS)
send C-payTerm0 $C2 $CP "payTerm(uint8)" 0
[[ $(( $(bal $DEMO_SCHOOL_ADDRESS) - S0 )) == 50000 ]] || { echo "FAIL school did not receive 50000"; exit 1; }
echo "C balance: $(bal $CP)"
echo "globalStats (locked, released, refunded): $(cast call $F "globalStats()(uint256,uint256,uint256)" | tr "\n" " ")"
for w in ORG C1 C2; do v=DEMO_$( [[ $w == ORG ]] && echo ORG || echo COSIGNER${w#C} )_ADDRESS; echo "$w balance $(bal ${!v})"; done
echo "DONE"
