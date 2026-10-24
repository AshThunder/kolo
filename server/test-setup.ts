// Preloaded by bunfig.toml: every test file runs in one process, so point the data files at a throwaway dir before any module loads.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
const dir = mkdtempSync(tmpdir() + '/kolo-test-')
process.env.KOLO_META_FILE = dir + '/meta.json'
process.env.KOLO_PAYEES_FILE = dir + '/payees.json'
process.env.KOLO_APPLICATIONS_FILE = dir + '/applications.json'
delete process.env.KEEPER_PRIVATE_KEY
process.env.KOLO_ADMIN_TOKEN = 'test-admin-token-0123456789'
process.env.KOLO_NETWORK = 'testnet' // the unit tests pin the Arc testnet addresses
process.env.KOLO_CCTP_FILE = dir + '/cctp.json'
process.env.KOLO_RATE_LIMIT = 'off' // security.test.ts turns it back on
