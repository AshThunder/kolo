// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {PayeeRegistry}    from "../kolo/PayeeRegistry.sol";
import {KoloFactory}      from "../kolo/KoloFactory.sol";
import {KoloGroupPot}     from "../kolo/KoloGroupPot.sol";
import {KoloTuitionPot}   from "../kolo/KoloTuitionPot.sol";
import {KoloCctpReceiver} from "../kolo/KoloCctpReceiver.sol";
import {KoloSweeperFactory} from "../kolo/KoloCctpReceiver.sol";

/**
 * @title  DeployKolo
 * @notice Full deployment + post-deploy setup for the Kolo contract stack on Arc Testnet.
 *
 * Contracts deployed (in order):
 *   1. PayeeRegistry       — verified payee directory
 *   2. KoloGroupPot impl   — EIP-1167 logic contract (never called directly)
 *   3. KoloTuitionPot impl — EIP-1167 logic contract (never called directly)
 *   4. KoloFactory         — clone factory + global stats
 *   5. KoloCctpReceiver    — CCTP V2 relay (MessageTransmitterV2 = 0xE737…CE275)
 *   6. KoloSweeperFactory  — CREATE2 deposit-address factory
 *
 * Post-deploy setup:
 *   • factory.setGroupPotImpl / setTuitionPotImpl / setCctpReceiver
 *   • Register TEST payee #1: "TEST Venue Vendor ABC" (Kind.Vendor) — Registered only
 *   • Register TEST payee #2: "TEST Sunrise Academy"  (Kind.School) — Registered + Verified
 *
 * Arc Testnet constants (from docs.arc.io + developers.circle.com):
 *   USDC ERC-20             0x3600000000000000000000000000000000000000
 *   CCTP MessageTransmitterV2  0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275  (domain 26)
 */
contract DeployKolo is Script {

    // ── Arc Testnet constants ──────────────────────────────────────────────────

    /// @dev USDC ERC-20 on Arc Testnet (6-decimal ERC-20 view; same pool as native gas).
    address constant USDC = 0x3600000000000000000000000000000000000000;

    /// @dev CCTP V2 MessageTransmitterV2 on Arc Testnet (domain 26).
    ///      Source: https://docs.arc.io/arc/references/contract-addresses (Testnet table)
    ///              https://developers.circle.com/cctp/references/contract-addresses (Arc Testnet row)
    address constant CCTP_MESSAGE_TRANSMITTER_V2 = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    // ── Placeholder payee wallets (test-only; in production use real institution wallets) ──

    /// @dev TEST Venue Vendor wallet — a distinct deterministic address so the reverse-lookup
    ///      (walletToPayeeId) doesn't collide with the deployer.
    address constant TEST_VENDOR_WALLET  = 0x1111111111111111111111111111111111111111;

    /// @dev TEST School wallet — same note as above.
    address constant TEST_SCHOOL_WALLET  = 0x2222222222222222222222222222222222222222;

    // ── Script entry-point ────────────────────────────────────────────────────

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== Kolo Deploy Script ===");
        console.log("Deployer   :", deployer);
        console.log("Chain ID   :", block.chainid);
        console.log("USDC       :", USDC);
        console.log("MessageTransmitterV2:", CCTP_MESSAGE_TRANSMITTER_V2);
        console.log("");

        vm.startBroadcast(deployerKey);

        // ── 1. PayeeRegistry ──────────────────────────────────────────────────
        PayeeRegistry registry = new PayeeRegistry(deployer);
        console.log("PayeeRegistry      :", address(registry));

        // ── 2 & 3. Pot implementation contracts ───────────────────────────────
        // These are bare (un-initialized) logic contracts; clones delegate to them.
        // They must NOT be used directly — initialize() can only be called once.
        KoloGroupPot   groupImpl   = new KoloGroupPot();
        KoloTuitionPot tuitionImpl = new KoloTuitionPot();
        console.log("KoloGroupPot impl  :", address(groupImpl));
        console.log("KoloTuitionPot impl:", address(tuitionImpl));

        // ── 4. KoloFactory ────────────────────────────────────────────────────
        KoloFactory factory = new KoloFactory(
            USDC,
            address(registry),
            deployer,   // treasury — receives protocol fees (0 bps default)
            deployer    // initialOwner
        );
        console.log("KoloFactory        :", address(factory));

        // Wire implementations + CCTP receiver (set after receiver is deployed)
        factory.setGroupPotImpl(address(groupImpl));
        factory.setTuitionPotImpl(address(tuitionImpl));

        // ── 5. KoloCctpReceiver ───────────────────────────────────────────────
        KoloCctpReceiver receiver = new KoloCctpReceiver(
            CCTP_MESSAGE_TRANSMITTER_V2,
            USDC,
            deployer    // owner
        );
        console.log("KoloCctpReceiver   :", address(receiver));

        // Register receiver address in factory
        factory.setCctpReceiver(address(receiver));

        // ── 6. KoloSweeperFactory ─────────────────────────────────────────────
        KoloSweeperFactory sweeperFactory = new KoloSweeperFactory(USDC);
        console.log("KoloSweeperFactory :", address(sweeperFactory));

        // ── Post-deploy: register test payees ─────────────────────────────────

        // Test payee #1 — Venue Vendor (Registered, NOT verified)
        // nameHash = keccak256("TEST Venue Vendor ABC")
        // docHash  = keccak256("TEST_VENDOR_REGISTRATION_DOC_001")
        uint256 vendorId = registry.registerPayee(
            PayeeRegistry.Kind.Vendor,
            TEST_VENDOR_WALLET,
            keccak256("TEST Venue Vendor ABC"),
            keccak256("TEST_VENDOR_REGISTRATION_DOC_001")
        );
        console.log("TEST Vendor payeeId:", vendorId);
        console.log("  wallet           :", TEST_VENDOR_WALLET);
        console.log("  status           : Registered (not verified)");

        // Test payee #2 — School (Registered + Verified immediately)
        // In production, verify() is a separate step after KYC review.
        // nameHash = keccak256("TEST Sunrise Academy")
        // docHash  = keccak256("TEST_SCHOOL_KYC_DOC_002")
        uint256 schoolId = registry.registerPayee(
            PayeeRegistry.Kind.School,
            TEST_SCHOOL_WALLET,
            keccak256("TEST Sunrise Academy"),
            keccak256("TEST_SCHOOL_KYC_DOC_002")
        );
        // Verify the school (deployer has REGISTRAR_ROLE from PayeeRegistry constructor)
        registry.verify(schoolId, keccak256("TEST_SCHOOL_KYC_DOC_002"));
        console.log("TEST School payeeId:", schoolId);
        console.log("  wallet           :", TEST_SCHOOL_WALLET);
        console.log("  status           : Verified");

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("");
        console.log("=== Deployment complete ===");
        console.log("PayeeRegistry      :", address(registry));
        console.log("KoloGroupPot impl  :", address(groupImpl));
        console.log("KoloTuitionPot impl:", address(tuitionImpl));
        console.log("KoloFactory        :", address(factory));
        console.log("KoloCctpReceiver   :", address(receiver));
        console.log("KoloSweeperFactory :", address(sweeperFactory));
        console.log("TEST Vendor payeeId:", vendorId, " wallet:", TEST_VENDOR_WALLET);
        console.log("TEST School payeeId:", schoolId, " wallet:", TEST_SCHOOL_WALLET);
    }
}
