// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./KoloTestBase.sol";
import {PayeeRegistry} from "../../kolo/PayeeRegistry.sol";

contract PayeeRegistryTest is KoloTestBase {
    function setUp() public { _setUp(); }

    // ── Register ──────────────────────────────────────────────────────────────

    function test_registerPayee_success() public {
        vm.prank(admin);
        uint256 id = registry.registerPayee(PayeeRegistry.Kind.School, alice, keccak256("name"), keccak256("doc"));
        assertEq(id, 1);
        assertEq(registry.payeeCount(), 1);
        assertEq(registry.walletOf(1), alice);
        assertEq(uint8(registry.kindOf(1)), uint8(PayeeRegistry.Kind.School));
        assertEq(uint8(registry.statusOf(1)), uint8(PayeeRegistry.Status.Registered));
    }

    function test_registerPayee_zeroWallet_reverts() public {
        vm.prank(admin);
        vm.expectRevert(PayeeRegistry.ZeroAddress.selector);
        registry.registerPayee(PayeeRegistry.Kind.School, address(0), bytes32(0), bytes32(0));
    }

    function test_registerPayee_duplicateWallet_reverts() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.School, alice, bytes32(0), bytes32(0));
        vm.expectRevert(PayeeRegistry.WalletAlreadyUsed.selector);
        registry.registerPayee(PayeeRegistry.Kind.Vendor, alice, bytes32(0), bytes32(0));
        vm.stopPrank();
    }

    function test_registerPayee_notRegistrar_reverts() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.registerPayee(PayeeRegistry.Kind.School, bob, bytes32(0), bytes32(0));
    }

    // ── Verify ────────────────────────────────────────────────────────────────

    function test_verify_success() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.School, alice, bytes32(0), bytes32(0));
        registry.verify(1, keccak256("doc"));
        vm.stopPrank();

        assertTrue(registry.isVerified(1));
        assertEq(uint8(registry.statusOf(1)), uint8(PayeeRegistry.Status.Verified));

        (,,,, bytes32 docHash, address verifier, uint256 verifiedAt,) = registry.payeeInfo(1);
        assertEq(docHash, keccak256("doc"));
        assertEq(verifier, admin);
        assertGt(verifiedAt, 0);
    }

    function test_verify_alreadyVerified_reverts() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.School, alice, bytes32(0), bytes32(0));
        registry.verify(1, bytes32(0));
        vm.expectRevert(PayeeRegistry.AlreadyVerified.selector);
        registry.verify(1, bytes32(0));
        vm.stopPrank();
    }

    function test_verify_notRegistered_reverts() public {
        vm.prank(admin);
        vm.expectRevert(PayeeRegistry.NotRegistered.selector);
        registry.verify(99, bytes32(0));
    }

    // ── Revoke ────────────────────────────────────────────────────────────────

    function test_revoke_success() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.Vendor, bob, bytes32(0), bytes32(0));
        registry.verify(1, bytes32(0));
        registry.revoke(1);
        vm.stopPrank();

        assertFalse(registry.isVerified(1));
        assertEq(uint8(registry.statusOf(1)), uint8(PayeeRegistry.Status.Revoked));
    }

    function test_revoke_alreadyRevoked_reverts() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.Vendor, bob, bytes32(0), bytes32(0));
        registry.revoke(1);
        vm.expectRevert(PayeeRegistry.AlreadyRevoked.selector);
        registry.revoke(1);
        vm.stopPrank();
    }

    // ── Wallet change timelock ────────────────────────────────────────────────

    function test_walletChange_happy() public {
        vm.prank(admin);
        registry.registerPayee(PayeeRegistry.Kind.Hospital, alice, bytes32(0), bytes32(0));

        // alice queues change to carol
        vm.prank(alice);
        registry.requestWalletChange(1, carol);

        // Check pending
        (address pending, uint256 execAfter) = registry.pendingWalletChange(1);
        assertEq(pending, carol);
        assertGt(execAfter, block.timestamp);

        // Before timelock: reverts
        vm.prank(admin);
        vm.expectRevert(PayeeRegistry.TimelockNotElapsed.selector);
        registry.executeWalletChange(1);

        // Warp past 48 hours
        skip(registry.WALLET_CHANGE_DELAY() + 1);

        vm.prank(admin);
        registry.executeWalletChange(1);

        assertEq(registry.walletOf(1), carol);
        assertEq(registry.walletToPayeeId(alice), 0);
        assertEq(registry.walletToPayeeId(carol), 1);
    }

    function test_walletChange_notPayeeWallet_reverts() public {
        vm.prank(admin);
        registry.registerPayee(PayeeRegistry.Kind.School, alice, bytes32(0), bytes32(0));

        vm.prank(bob);
        vm.expectRevert(PayeeRegistry.NotPayeeWallet.selector);
        registry.requestWalletChange(1, carol);
    }

    function test_walletChange_newWalletAlreadyUsed_reverts() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.School, alice, bytes32(0), bytes32(0));
        registry.registerPayee(PayeeRegistry.Kind.Vendor, carol, bytes32(0), bytes32(0));
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(PayeeRegistry.WalletAlreadyUsed.selector);
        registry.requestWalletChange(1, carol); // carol already registered
    }

    function test_executeWalletChange_noRequest_reverts() public {
        vm.prank(admin);
        registry.registerPayee(PayeeRegistry.Kind.School, alice, bytes32(0), bytes32(0));

        vm.prank(admin);
        vm.expectRevert(PayeeRegistry.NoWalletChangeRequest.selector);
        registry.executeWalletChange(1);
    }

    // ── payeeInfo ────────────────────────────────────────────────────────────

    function test_payeeInfo_fullFields() public {
        vm.startPrank(admin);
        registry.registerPayee(PayeeRegistry.Kind.Hospital, dave, keccak256("dave"), keccak256("doc1"));
        registry.verify(1, keccak256("doc2"));
        vm.stopPrank();

        (
            PayeeRegistry.Kind kind,
            PayeeRegistry.Status status,
            address wallet,
            bytes32 nameHash,
            bytes32 docHash,
            address verifier,
            uint256 verifiedAt,
            uint256 registeredAt
        ) = registry.payeeInfo(1);

        assertEq(uint8(kind),   uint8(PayeeRegistry.Kind.Hospital));
        assertEq(uint8(status), uint8(PayeeRegistry.Status.Verified));
        assertEq(wallet,        dave);
        assertEq(nameHash,      keccak256("dave"));
        assertEq(docHash,       keccak256("doc2"));
        assertEq(verifier,      admin);
        assertGt(verifiedAt,    0);
        assertGt(registeredAt,  0);
    }

    // ── walletToPayeeId reverse lookup ────────────────────────────────────────

    function test_walletToPayeeId() public {
        vm.prank(admin);
        registry.registerPayee(PayeeRegistry.Kind.Vendor, bob, bytes32(0), bytes32(0));
        assertEq(registry.walletToPayeeId(bob), 1);
        assertEq(registry.walletToPayeeId(carol), 0);
    }

    // ── recordRelease event ───────────────────────────────────────────────────

    function test_recordRelease_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit PayeeRegistry.Released(42, 1, 500e6);
        registry.recordRelease(42, 1, 500e6);
    }

    // ── REGISTRAR role management ─────────────────────────────────────────────

    function test_grantRegistrar() public {
        bytes32 role = registry.REGISTRAR_ROLE(); // read before prank so prank isn't consumed
        vm.prank(admin);
        registry.grantRole(role, alice);

        vm.prank(alice);
        uint256 id = registry.registerPayee(PayeeRegistry.Kind.School, carol, bytes32(0), bytes32(0));
        assertEq(id, 1);
    }
}
