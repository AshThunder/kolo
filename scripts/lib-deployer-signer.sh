#!/usr/bin/env bash
# Sourced helper: turns the deployer key in ~/.kolo/mainnet-deployer.env into a throwaway encrypted
# keystore in RAM (/dev/shm, mode 700), exposes SIGN=(--keystore ... --password-file ...) for cast/forge.
# The raw key never appears in argv, logs, or files outside the 600-mode env file. Keystore is deleted on exit.
set -a; . "${KOLO_ENV_FILE:-$HOME/.kolo/mainnet-deployer.env}"; set +a
DEPLOYER=$KOLO_MAINNET_DEPLOYER_ADDRESS
# Build a throwaway encrypted keystore in RAM (/dev/shm, mode 700) so the raw key never appears in argv.
KS_DIR=$(mktemp -d /dev/shm/kolo-ks.XXXXXX); chmod 700 "$KS_DIR"; trap 'rm -rf "$KS_DIR"' EXIT
KS_PASS=$(head -c 24 /dev/urandom | base64); printf '%s' "$KS_PASS" > "$KS_DIR/pw"; chmod 600 "$KS_DIR/pw"
EXPECT=$DEPLOYER KOLO_PK=$KOLO_MAINNET_DEPLOYER_PK KS_PASS=$KS_PASS KS_OUT="$KS_DIR/deployer.json" node -e '
const c=require("crypto"),{privateKeyToAccount}=require("viem/accounts"),{keccak256,toBytes}=require("viem");
const pk=process.env.KOLO_PK, acct=privateKeyToAccount(pk), key=Buffer.from(pk.slice(2),"hex");
if(acct.address.toLowerCase()!==process.env.EXPECT.toLowerCase()){console.error("key does not match deployer address");process.exit(1);}
const salt=c.randomBytes(32), iv=c.randomBytes(16), n=8192,r=8,p=1;
const dk=c.scryptSync(process.env.KS_PASS,salt,32,{N:n,r,p,maxmem:128*1024*1024});
const ci=c.createCipheriv("aes-128-ctr",dk.subarray(0,16),iv), ct=Buffer.concat([ci.update(key),ci.final()]);
const mac=keccak256(Buffer.concat([dk.subarray(16,32),ct])).slice(2);
require("fs").writeFileSync(process.env.KS_OUT,JSON.stringify({version:3,id:c.randomUUID(),address:acct.address.slice(2).toLowerCase(),
 crypto:{ciphertext:ct.toString("hex"),cipherparams:{iv:iv.toString("hex")},cipher:"aes-128-ctr",kdf:"scrypt",
 kdfparams:{dklen:32,salt:salt.toString("hex"),n,r,p},mac}}),{mode:0o600});
console.error("keystore ok for "+acct.address);'
unset KOLO_MAINNET_DEPLOYER_PK KS_PASS || true
SIGN=(--keystore "$KS_DIR/deployer.json" --password-file "$KS_DIR/pw")
