// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./KoloTestBase.sol";
import {KoloTuitionPot} from "../../kolo/KoloTuitionPot.sol";
import {PayeeRegistry} from "../../kolo/PayeeRegistry.sol";
import {KoloFactory} from "../../kolo/KoloFactory.sol";

contract KoloTuitionPotTest is KoloTestBase {
    address internal school = makeAddr("school");
    uint256 internal schoolId;

    function setUp() public {
        _setUp();
        schoolId = _registerAndVerifySchool(school);
    }

    function _make3TermPot() internal returns (uint256, KoloTuitionPot) {
        uint40[]  memory dueDates = new uint40[](3);
        uint128[] memory amounts  = new uint128[](3);
        dueDates[0] = uint40(block.timestamp + 30 days);
        dueDates[1] = uint40(block.timestamp + 60 days);
        dueDates[2] = uint40(block.timestamp + 90 days);
        amounts[0]  = uint128(100 * USDC_1);
        amounts[1]  = uint128(100 * USDC_1);
        amounts[2]  = uint128(100 * USDC_1);

        address[] memory cs = new address[](0);
        return _createTuitionPot(
            alice, schoolId,
            uint40(block.timestamp + 120 days),
            1, cs, dueDates, amounts
        );
    }

    // ── Initialize ────────────────────────────────────────────────────────────

    function test_initialize_alreadyInit_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        vm.expectRevert(KoloTuitionPot.AlreadyInitialized.selector);
        p.initialize(new bytes(0));
    }

    function test_initialize_notSchool_reverts() public {
        // Vendor should fail
        address vendor = makeAddr("vendor");
        uint256 vid    = _registerAndVerifyVendor(vendor);

        uint40[]  memory dueDates = new uint40[](1); dueDates[0] = uint40(block.timestamp + 30 days);
        uint128[] memory amounts  = new uint128[](1); amounts[0]  = uint128(100 * USDC_1);
        address[] memory cs       = new address[](0);

        bytes memory params = abi.encode(
            alice, address(usdc), address(factory), uint256(0), bytes32(0),
            uint96(0), uint40(block.timestamp + 60 days), true, vid, uint8(1),
            cs, dueDates, amounts
        );

        vm.prank(alice);
        vm.expectRevert(KoloTuitionPot.NotVerifiedSchool.selector);
        factory.createTuitionPot(params);
    }

    // ── Contribute ────────────────────────────────────────────────────────────

    function test_contribute_happy() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));
        assertEq(p.totalContributed(), 300 * USDC_1);
    }

    function test_contribute_schoolRevoked_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        vm.prank(admin);
        registry.revoke(schoolId);

        vm.startPrank(alice);
        usdc.approve(address(p), 100 * USDC_1);
        vm.expectRevert(KoloTuitionPot.SchoolRevoked.selector);
        p.contribute(uint128(100 * USDC_1), bytes32(0));
        vm.stopPrank();
    }

    // ── payTerm ───────────────────────────────────────────────────────────────

    function test_payTerm_happy() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));

        // Term 0 is due in 30 days - PAY_WINDOW (3 days) = 27 days
        skip(27 days);

        uint256 schoolBefore = usdc.balanceOf(school);
        p.payTerm(0);
        assertGt(usdc.balanceOf(school), schoolBefore);
        (,, KoloTuitionPot.TermStatus ts,) = p.terms(0);
        assertEq(uint8(ts), uint8(KoloTuitionPot.TermStatus.Paid));
    }

    function test_payTerm_alreadyPaid_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));
        skip(27 days);
        p.payTerm(0);
        vm.expectRevert(KoloTuitionPot.TermAlreadyPaid.selector);
        p.payTerm(0);
    }

    function test_payTerm_tooEarly_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));
        // Skip less than PAY_WINDOW before dueDate
        skip(20 days); // dueDate - window = 27 days; 20 < 27
        vm.expectRevert(KoloTuitionPot.TermNotDue.selector);
        p.payTerm(0);
    }

    function test_payTerm_insufficientBalance_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        // Contribute less than term 0 amount
        _approveAndContributeTuition(alice, address(p), uint128(50 * USDC_1));
        skip(27 days);
        vm.expectRevert(KoloTuitionPot.InsufficientBalance.selector);
        p.payTerm(0);
    }

    function test_payTerm_schoolRevoked_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));
        skip(27 days);
        vm.prank(admin);
        registry.revoke(schoolId);
        vm.expectRevert(KoloTuitionPot.SchoolRevoked.selector);
        p.payTerm(0);
    }

    function test_payTerm_allTerms_triggersRefunding() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(350 * USDC_1)); // 50 leftover

        skip(27  days); p.payTerm(0);
        skip(30  days); p.payTerm(1);
        skip(30  days); p.payTerm(2);

        assertEq(uint8(p.state()), uint8(KoloTuitionPot.PotState.Refunding));
    }

    // ── Close + pro-rata leftover ─────────────────────────────────────────────

    function test_close_and_proRata_refund() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(200 * USDC_1));
        _approveAndContributeTuition(bob,   address(p), uint128(100 * USDC_1));

        // Pay term 0 only
        skip(27 days);
        p.payTerm(0);

        // Close early
        vm.prank(alice);
        p.close(bytes(""));

        // Pro-rata: 200 left (300 contributed - 100 released)
        // Alice: 200/300 × 200 = 133.33…, Bob: 100/300 × 200 = 66.66…
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        vm.prank(alice); p.claimRefund();
        vm.prank(bob);   p.claimRefund();
        uint256 aliceGot = usdc.balanceOf(alice) - aliceBefore;
        uint256 bobGot   = usdc.balanceOf(bob)   - bobBefore;
        assertEq(aliceGot + bobGot, 200 * USDC_1);
    }

    function test_claimRefund_double_reverts() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        p.close(bytes(""));
        vm.prank(alice); p.claimRefund();
        vm.prank(alice);
        vm.expectRevert(KoloTuitionPot.RefundAlreadyClaimed.selector);
        p.claimRefund();
    }

    // ── School revoked mid-pot → handleRevocation ────────────────────────────

    function test_schoolRevoked_handleRevocation() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));

        vm.prank(admin);
        registry.revoke(schoolId);

        // Anyone can call handleRevocation
        p.handleRevocation();

        assertTrue(p.paused());
        assertEq(uint8(p.state()), uint8(KoloTuitionPot.PotState.Refunding));

        // Contributors can still claim refund even while paused
        vm.prank(alice);
        p.claimRefund(); // must not revert
        assertGt(usdc.balanceOf(alice), 0);
    }

    // ── Pledge ────────────────────────────────────────────────────────────────

    function test_pledge_and_fulfill() public {
        (, KoloTuitionPot p) = _make3TermPot();
        uint40 due = uint40(block.timestamp + 10 days);
        vm.prank(alice);
        p.pledge(uint128(50 * USDC_1), due);

        _approveAndContributeTuition(alice, address(p), uint128(30 * USDC_1));
        (,, uint128 fulfilled) = p.pledgeOf(alice);
        assertEq(fulfilled, 30 * USDC_1);
    }

    // ── Subscriptions ─────────────────────────────────────────────────────────

    function test_subscribe_and_pull() public {
        (, KoloTuitionPot p) = _make3TermPot();

        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(10 * USDC_1), 30 days, 10);

        vm.prank(alice);
        usdc.approve(address(p), type(uint256).max);

        p.pull(subId);
        assertEq(p.contributed(alice), 10 * USDC_1);
    }

    function test_pull_schoolRevoked_deactivates_sub() public {
        (, KoloTuitionPot p) = _make3TermPot();
        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(10 * USDC_1), 30 days, 10);
        vm.prank(alice);
        usdc.approve(address(p), type(uint256).max);
        p.pull(subId); // first pull OK

        // revoke school and move to Refunding
        vm.prank(admin); registry.revoke(schoolId);
        p.handleRevocation();

        // pull again: state != Active → sub deactivated, no revert
        skip(30 days);
        p.pull(subId);
        (,,,,,,bool active) = p.subscriptions(subId);
        assertFalse(active);
    }

    // ── Global stats via factory ──────────────────────────────────────────────

    function test_globalStats_tuition() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));

        (uint256 locked1,,) = factory.globalStats();
        assertEq(locked1, 300 * USDC_1);

        skip(27 days);
        p.payTerm(0);

        (uint256 locked2, uint256 released2,) = factory.globalStats();
        assertEq(released2, 100 * USDC_1);
        assertEq(locked2,   200 * USDC_1);
    }

    // ── Fuzz: pro-rata refund sum ─────────────────────────────────────────────

    function testFuzz_tuition_proRata(uint64 a, uint64 b) public {
        vm.assume(a > 0 && b > 0);
        vm.assume(uint256(a) + uint256(b) >= 100 * USDC_1); // enough for one term
        vm.assume(uint256(a) + uint256(b) <= type(uint96).max); // prevent overflow

        // Mint exact fuzz amounts
        usdc.mint(alice, a);
        usdc.mint(bob,   b);

        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(a));
        _approveAndContributeTuition(bob,   address(p), uint128(b));

        skip(27 days);
        p.payTerm(0); // 100 USDC paid to school

        vm.prank(alice);
        p.close(bytes(""));

        uint256 remaining = uint256(p.totalContributed()) - uint256(p.totalReleased());

        uint256 ab = usdc.balanceOf(alice);
        uint256 bb = usdc.balanceOf(bob);
        vm.prank(alice); p.claimRefund();
        vm.prank(bob);   p.claimRefund();

        uint256 sum = (usdc.balanceOf(alice) - ab) + (usdc.balanceOf(bob) - bb);
        assertEq(sum, remaining);
    }

    // ── Pause never blocks refunds ────────────────────────────────────────────

    function test_pause_blocks_payTerm_not_refund() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));
        skip(27 days);

        vm.prank(alice); p.pause();

        // payTerm should revert because paused
        vm.expectRevert(); // Pausable: EnforcedPause
        p.payTerm(0);

        // Move to refunding (via handleRevocation; revoke first)
        vm.prank(admin); registry.revoke(schoolId);
        // handleRevocation re-pauses (already paused) but still sets Refunding
        p.handleRevocation();

        // claimRefund must work
        vm.prank(alice); p.claimRefund();
        assertGt(usdc.balanceOf(alice), 0);
    }

    // ── Invariant: balance == contributed - released - refunded ──────────────

    function test_invariant_balance() public {
        (, KoloTuitionPot p) = _make3TermPot();
        _approveAndContributeTuition(alice, address(p), uint128(300 * USDC_1));
        skip(27 days); p.payTerm(0);
        skip(30 days); p.payTerm(1);

        uint256 balance  = usdc.balanceOf(address(p));
        uint256 expected = p.totalContributed() - p.totalReleased() - p.totalRefunded();
        assertEq(balance, expected);
    }
}
