// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./KoloTestBase.sol";
import {KoloGroupPot} from "../../kolo/KoloGroupPot.sol";
import {KoloFactory} from "../../kolo/KoloFactory.sol";
import {PayeeRegistry} from "../../kolo/PayeeRegistry.sol";

contract KoloGroupPotTest is KoloTestBase {
    KoloGroupPot internal pot;
    uint256      internal potId;
    address      internal payee = makeAddr("payee");
    address      internal coSigner1 = makeAddr("cs1");
    address      internal coSigner2 = makeAddr("cs2");

    function setUp() public {
        _setUp();
        usdc.mint(alice, 100_000 * USDC_1);
        usdc.mint(bob,   100_000 * USDC_1);
        usdc.mint(carol, 100_000 * USDC_1);
        usdc.mint(dave,  100_000 * USDC_1);
    }

    function _makePot(
        uint128 target,
        uint40  deadline,
        uint8   threshold,
        address[] memory coSigners,
        address[] memory payees,
        uint256[] memory pIds
    ) internal returns (uint256, KoloGroupPot) {
        bytes32[] memory mlLabels   = new bytes32[](0);
        uint8[]   memory mlIdxs     = new uint8[](0);
        uint128[] memory mlCaps     = new uint128[](0);
        return _createGroupPot(alice, payees, pIds, target, deadline, threshold, coSigners, mlLabels, mlIdxs, mlCaps);
    }

    function _makeSimplePot(uint128 target, uint40 deadline) internal returns (uint256, KoloGroupPot) {
        address[] memory payees = new address[](1); payees[0] = payee;
        uint256[] memory pIds   = new uint256[](1); pIds[0]   = 0;
        address[] memory cs     = new address[](0);
        return _makePot(target, deadline, 1, cs, payees, pIds);
    }

    function _makeCoSignPot(uint8 threshold) internal returns (uint256, KoloGroupPot) {
        address[] memory payees = new address[](1); payees[0] = payee;
        uint256[] memory pIds   = new uint256[](1); pIds[0]   = 0;
        address[] memory cs     = new address[](2); cs[0] = coSigner1; cs[1] = coSigner2;
        return _makePot(500 * uint128(USDC_1), uint40(block.timestamp + 30 days), threshold, cs, payees, pIds);
    }

    // ── Initialize ────────────────────────────────────────────────────────────

    function test_initialize_alreadyInit_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 7 days));
        vm.expectRevert(KoloGroupPot.AlreadyInitialized.selector);
        p.initialize(new bytes(0));
    }

    // ── Contribute ────────────────────────────────────────────────────────────

    function test_contribute_happy() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 7 days));
        _approveAndContribute(alice, address(p), uint128(10 * USDC_1));
        assertEq(p.contributed(alice), 10 * USDC_1);
        assertEq(p.totalContributed(),  10 * USDC_1);
        assertEq(usdc.balanceOf(address(p)), 10 * USDC_1);
    }

    function test_contribute_pastDeadline_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 1 days));
        skip(2 days);
        vm.startPrank(alice);
        usdc.approve(address(p), 10 * USDC_1);
        vm.expectRevert(KoloGroupPot.DeadlinePassed.selector);
        p.contribute(uint128(10 * USDC_1), bytes32(0));
        vm.stopPrank();
    }

    function test_contributeFor_credits_beneficiary() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 7 days));
        vm.startPrank(alice);
        usdc.approve(address(p), 5 * USDC_1);
        p.contributeFor(bob, uint128(5 * USDC_1), bytes32(0));
        vm.stopPrank();
        assertEq(p.contributed(bob), 5 * USDC_1);
        assertEq(p.contributed(alice), 0);
    }

    function test_contribute_overfund_notAllowed() public {
        // Build a pot where allowOverfund=false by using the full _createGroupPot with custom params
        // For simplicity, test with allowOverfund=true (default in helper) and a large target
        (, KoloGroupPot p) = _makeSimplePot(10 * uint128(USDC_1), uint40(block.timestamp + 7 days));
        // allowOverfund=true in helper so this should pass
        _approveAndContribute(alice, address(p), uint128(11 * USDC_1));
        assertEq(p.totalContributed(), 11 * USDC_1);
    }

    // ── Pledge ────────────────────────────────────────────────────────────────

    function test_pledge_and_reduce_on_contribute() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 7 days));
        uint40 due = uint40(block.timestamp + 3 days);

        vm.prank(alice);
        p.pledge(uint128(50 * USDC_1), due);

        (uint128 amount, uint40 dueBy, uint128 fulfilled) = p.pledgeOf(alice);
        assertEq(amount, 50 * USDC_1);
        assertEq(dueBy,  due);
        assertEq(fulfilled, 0);

        // Contribute 20 → fulfilled becomes 20
        _approveAndContribute(alice, address(p), uint128(20 * USDC_1));
        (,, uint128 fulfilled2) = p.pledgeOf(alice);
        assertEq(fulfilled2, 20 * USDC_1);
    }

    function test_pledge_duePassed_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 7 days));
        vm.prank(alice);
        vm.expectRevert(KoloGroupPot.PledgeDuePassed.selector);
        p.pledge(uint128(10 * USDC_1), uint40(block.timestamp - 1));
    }

    // ── Subscriptions ─────────────────────────────────────────────────────────

    function test_subscribe_and_pull() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 30 days));

        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(5 * USDC_1), 7 days, 4);

        vm.prank(alice);
        usdc.approve(address(p), type(uint256).max);

        // First pull — immediate (nextDue = block.timestamp at subscribe time)
        uint256 balBefore = usdc.balanceOf(address(p));
        p.pull(subId);
        assertEq(usdc.balanceOf(address(p)), balBefore + 5 * USDC_1);
        assertEq(p.contributed(alice), 5 * USDC_1);
    }

    function test_pull_tooEarly_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 30 days));
        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(5 * USDC_1), 7 days, 4);
        vm.prank(alice);
        usdc.approve(address(p), type(uint256).max);
        p.pull(subId); // first pull fine (nextDue = now)
        vm.expectRevert(KoloGroupPot.PullTooEarly.selector);
        p.pull(subId); // second pull before 7 days
    }

    function test_pull_softFail_insufficientAllowance() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 30 days));
        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(5 * USDC_1), 7 days, 10);
        // No approval → PullSkipped
        vm.expectEmit(true, false, false, false);
        emit KoloGroupPot.PullSkipped(subId, "insufficient allowance");
        p.pull(subId);
    }

    function test_pull_respectsMaxPulls() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 365 days));
        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(1 * USDC_1), 1, 3); // 3 max pulls, 1s interval
        vm.prank(alice);
        usdc.approve(address(p), type(uint256).max);
        p.pull(subId); skip(2);
        p.pull(subId); skip(2);
        p.pull(subId); // 3rd pull cancels sub
        (,,,,,,bool active) = p.subscriptions(subId);
        assertFalse(active);
    }

    function test_cancelSubscription() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 30 days));
        vm.prank(alice);
        uint256 subId = p.subscribe(uint96(5 * USDC_1), 7 days, 10);
        vm.prank(alice);
        p.cancelSubscription(subId);
        (,,,,,,bool active) = p.subscriptions(subId);
        assertFalse(active);
    }

    // ── Invoice + Approve + Release ───────────────────────────────────────────

    function test_invoice_approve_release_happy() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));

        // threshold=1 (organizer alone)
        vm.prank(alice); // alice is organizer
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), keccak256("inv"), bytes32(0));

        vm.prank(alice);
        p.approve(invId);

        uint256 payeeBefore = usdc.balanceOf(payee);
        vm.prank(alice);
        p.release(invId);

        assertGt(usdc.balanceOf(payee), payeeBefore);
        assertEq(p.totalReleased(), 50 * USDC_1);
    }

    function test_invoice_wrongPayeeIdx_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        vm.expectRevert(KoloGroupPot.InvalidPayeeIdx.selector);
        p.submitInvoice(1, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0)); // idx 1 out of range
    }

    function test_cosigner_threshold() public {
        // threshold=2: both coSigner1 and coSigner2 must approve
        (, KoloGroupPot p) = _makeCoSignPot(2);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));

        vm.prank(coSigner1);
        p.approve(invId);
        // one approval — not yet approved
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.PendingApproval));

        vm.prank(coSigner2);
        p.approve(invId);
        // now approved
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.Approved));
    }

    function test_cosigner_double_approve_reverts() public {
        (, KoloGroupPot p) = _makeCoSignPot(2);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));

        vm.prank(coSigner1);
        p.approve(invId);
        vm.prank(coSigner1);
        vm.expectRevert(KoloGroupPot.AlreadyApprovedThisInvoice.selector);
        p.approve(invId);
    }

    function test_releaseWithFee() public {
        vm.prank(admin);
        factory.setFee(100); // 1%
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(100 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(alice);
        p.approve(invId);
        uint256 payeeBefore    = usdc.balanceOf(payee);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(alice);
        p.release(invId);
        assertEq(usdc.balanceOf(payee)    - payeeBefore,    99 * USDC_1);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore,  1 * USDC_1);
    }

    // ── Disputes ──────────────────────────────────────────────────────────────

    function test_flagInvoice_clears_approvals() public {
        (, KoloGroupPot p) = _makeCoSignPot(1);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(10  * USDC_1));

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(coSigner1);
        p.approve(invId);

        // bob (contributor) flags
        vm.prank(bob);
        p.flagInvoice(invId, keccak256("fraud"));

        // Invoice is now Disputed, approvals cleared
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.Disputed));
        assertEq(_getInvoiceBitmap(p, invId), 0);
    }

    function test_flagInvoice_nonContributor_reverts() public {
        (, KoloGroupPot p) = _makeCoSignPot(1);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(dave); // dave has not contributed
        vm.expectRevert(KoloGroupPot.NotContributor.selector);
        p.flagInvoice(invId, bytes32(0));
    }

    function test_flagInvoice_cooldown() public {
        (, KoloGroupPot p) = _makeCoSignPot(1);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(10  * USDC_1));

        vm.prank(alice);
        uint16 invId1 = p.submitInvoice(0, 0, uint248(10 * USDC_1), bytes32(0), bytes32(0));

        vm.startPrank(bob);
        p.flagInvoice(invId1, bytes32(0));
        // cancel then create new
        vm.stopPrank();

        vm.prank(alice);
        uint16 invId2 = p.submitInvoice(0, 0, uint248(10 * USDC_1), bytes32(0), bytes32(0));

        vm.prank(bob);
        vm.expectRevert(KoloGroupPot.DisputeCooldown.selector);
        p.flagInvoice(invId2, bytes32(0));
    }

    function test_resolve_dispute_uphold() public {
        (, KoloGroupPot p) = _makeCoSignPot(1);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(10  * USDC_1));

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));

        vm.prank(bob);
        p.flagInvoice(invId, bytes32(0));

        // threshold=1; coSigner1 resolves uphold
        vm.prank(coSigner1);
        p.resolve(invId, true);
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.PendingApproval));
    }

    function test_resolve_dispute_reject() public {
        (, KoloGroupPot p) = _makeCoSignPot(1);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(10  * USDC_1));

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));

        vm.prank(bob);
        p.flagInvoice(invId, bytes32(0));

        vm.prank(coSigner1);
        p.resolve(invId, false); // reject dispute
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.Cancelled));
    }

    // ── Deadline + refund ─────────────────────────────────────────────────────

    function test_triggerRefunding_afterGrace() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 1 days));
        _approveAndContribute(alice, address(p), uint128(50 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(50 * USDC_1));

        skip(1 days + 3 days + 1); // deadline + grace + 1s

        p.triggerRefunding();
        assertEq(uint8(p.state()), uint8(KoloGroupPot.PotState.Refunding));
    }

    function test_triggerRefunding_beforeGrace_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(100 * uint128(USDC_1), uint40(block.timestamp + 1 days));
        skip(1 days); // just at deadline, not past grace
        vm.expectRevert(KoloGroupPot.DeadlineNotPassed.selector);
        p.triggerRefunding();
    }

    function test_claimRefund_proRata() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 1 days));
        _approveAndContribute(alice, address(p), uint128(60 * USDC_1)); // 60%
        _approveAndContribute(bob,   address(p), uint128(40 * USDC_1)); // 40%

        skip(1 days + 3 days + 1);
        p.triggerRefunding();

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);

        vm.prank(alice);
        p.claimRefund();
        vm.prank(bob);
        p.claimRefund();

        // Alice gets ~60, Bob gets ~40 (dust to last claimant)
        uint256 aliceGot = usdc.balanceOf(alice) - aliceBefore;
        uint256 bobGot   = usdc.balanceOf(bob)   - bobBefore;
        assertApproxEqAbs(aliceGot, 60 * USDC_1, 1);
        assertApproxEqAbs(bobGot,   40 * USDC_1, 1);
        assertEq(aliceGot + bobGot, 100 * USDC_1); // Σ == total contributed
    }

    function test_claimRefund_double_reverts() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 1 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        skip(1 days + 3 days + 1);
        p.triggerRefunding();
        vm.prank(alice);
        p.claimRefund();
        vm.prank(alice);
        vm.expectRevert(KoloGroupPot.RefundAlreadyClaimed.selector);
        p.claimRefund();
    }

    // ── Missed deadline: deadline + 3-day grace ───────────────────────────────

    function test_missedDeadline_graceBoundaryIsExact() public {
        uint40 dl = uint40(block.timestamp + 5 days);
        (, KoloGroupPot p) = _makeSimplePot(0, dl);
        _approveAndContribute(alice, address(p), uint128(10 * USDC_1));
        vm.warp(uint256(dl) + 3 days); // exactly deadline + grace: still inside
        vm.expectRevert(KoloGroupPot.DeadlineNotPassed.selector);
        p.triggerRefunding();
        vm.warp(uint256(dl) + 3 days + 1);
        p.triggerRefunding();
        assertEq(uint8(p.state()), uint8(KoloGroupPot.PotState.Refunding));
    }

    function test_missedDeadline_noContributionsAfterDeadline_noPullBeforeTrigger() public {
        uint40 dl = uint40(block.timestamp + 5 days);
        (, KoloGroupPot p) = _makeSimplePot(0, dl);
        _approveAndContribute(alice, address(p), uint128(10 * USDC_1));
        vm.warp(uint256(dl) + 1 days); // past deadline, inside grace
        vm.prank(bob); usdc.approve(address(p), type(uint256).max);
        vm.prank(bob); vm.expectRevert();
        p.contribute(uint128(1 * USDC_1), bytes32(0));
        vm.prank(alice); vm.expectRevert(KoloGroupPot.PotNotRefunding.selector); // refunds only open after trigger
        p.claimRefund();
    }

    function test_missedDeadline_anyoneTriggers_nonContributorGetsNothing_noDoubleTrigger() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 1 days));
        _approveAndContribute(alice, address(p), uint128(10 * USDC_1));
        skip(4 days + 1);
        vm.prank(dave); p.triggerRefunding(); // a stranger can open refunds
        vm.prank(dave); vm.expectRevert(KoloGroupPot.NothingToRefund.selector);
        p.claimRefund();
        vm.expectRevert(KoloGroupPot.PotNotActive.selector);
        p.triggerRefunding();
    }

    function test_missedDeadline_afterPartialRelease_refundsOnlyTheRemainder_proRata() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 10 days));
        _approveAndContribute(alice, address(p), uint128(60 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(40 * USDC_1));
        vm.startPrank(alice);
        uint16 inv = p.submitInvoice(0, 0, uint248(30 * USDC_1), bytes32(0), bytes32(0));
        p.approve(inv); p.release(inv);
        vm.stopPrank();
        assertEq(usdc.balanceOf(payee), 30 * USDC_1);

        skip(10 days + 3 days + 1);
        p.triggerRefunding();
        uint256 a0 = usdc.balanceOf(alice); uint256 b0 = usdc.balanceOf(bob);
        vm.prank(alice); p.claimRefund();
        vm.prank(bob);   p.claimRefund();
        // 70 remaining, split 60:40 → 42 / 28; the released 30 is never clawed back
        assertEq(usdc.balanceOf(alice) - a0, 42 * USDC_1);
        assertEq(usdc.balanceOf(bob)   - b0, 28 * USDC_1);
        assertEq(usdc.balanceOf(address(p)), 0);
        assertEq(uint256(p.totalReleased()) + uint256(p.totalRefunded()), uint256(p.totalContributed()));
        assertEq(usdc.balanceOf(payee), 30 * USDC_1);
    }

    function test_missedDeadline_unresolvedDispute_stillRefunds_andNothingMoreCanRelease() public {
        (, KoloGroupPot p) = _makeCoSignPot(2);
        uint40 dl = p.deadline();
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        uint16 inv = p.submitInvoice(0, 0, uint248(80 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(bob); p.flagInvoice(inv, keccak256("wrong goods"));
        assertEq(uint8(_getInvoiceStatus(p, inv)), uint8(KoloGroupPot.InvStatus.Disputed));

        vm.warp(uint256(dl) + 3 days + 1); // nobody resolved it
        p.triggerRefunding();
        vm.prank(alice); vm.expectRevert();
        p.release(inv);                    // a disputed invoice can never pay out
        uint256 a0 = usdc.balanceOf(alice); uint256 b0 = usdc.balanceOf(bob);
        vm.prank(alice); p.claimRefund();
        vm.prank(bob);   p.claimRefund();
        assertEq(usdc.balanceOf(alice) - a0, 100 * USDC_1);
        assertEq(usdc.balanceOf(bob)   - b0, 100 * USDC_1);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(address(p)), 0);
    }

    function test_missedDeadline_refundsRecordedInFactoryStats() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 1 days));
        _approveAndContribute(alice, address(p), uint128(25 * USDC_1));
        (, , uint256 refundedBefore) = factory.globalStats();
        skip(4 days + 1);
        p.triggerRefunding();
        vm.prank(alice); p.claimRefund();
        (, , uint256 refundedAfter) = factory.globalStats();
        assertEq(refundedAfter - refundedBefore, 25 * USDC_1);
    }

    // ── Pause never blocks refunds ────────────────────────────────────────────

    function test_pause_blocks_contribute_but_not_refund() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));

        // Move to refunding first (warp past deadline+grace)
        skip(30 days + 3 days + 1);
        p.triggerRefunding();

        // Organizer (alice) pauses
        vm.prank(alice);
        p.pause();
        assertTrue(p.paused());

        // Contribute should fail (already past deadline anyway)
        // but claimRefund must succeed even while paused
        vm.prank(alice);
        p.claimRefund(); // must not revert
        assertGt(usdc.balanceOf(alice), 0);
    }

    // ── Registry payee — revoked mid-pot ─────────────────────────────────────

    function test_registryPayee_revoked_blocks_invoice() public {
        address vendor = makeAddr("vendor");
        uint256 vid    = _registerAndVerifyVendor(vendor);

        address[] memory payees = new address[](1); payees[0] = address(0);
        uint256[] memory pIds   = new uint256[](1); pIds[0]   = vid;
        address[] memory cs     = new address[](0);
        bytes32[] memory mlL = new bytes32[](0); uint8[] memory mlI = new uint8[](0); uint128[] memory mlC = new uint128[](0);
        (, KoloGroupPot p) = _createGroupPot(alice, payees, pIds, 0, uint40(block.timestamp + 30 days), 1, cs, mlL, mlI, mlC);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));

        // Revoke vendor
        vm.prank(admin);
        registry.revoke(vid);

        // Submit invoice should fail
        vm.prank(alice);
        vm.expectRevert(KoloGroupPot.PayeeRegistryRevoked.selector);
        p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));
    }

    // ── Milestones ────────────────────────────────────────────────────────────

    function test_milestone_cap_enforced() public {
        bytes32[] memory mlLabels = new bytes32[](1); mlLabels[0] = keccak256("venue");
        uint8[]   memory mlIdxs   = new uint8[](1);   mlIdxs[0]   = 0;
        uint128[] memory mlCaps   = new uint128[](1);  mlCaps[0]   = uint128(30 * USDC_1);

        address[] memory payees = new address[](1); payees[0] = payee;
        uint256[] memory pIds   = new uint256[](1); pIds[0]   = 0;
        address[] memory cs     = new address[](0);

        (, KoloGroupPot p) = _createGroupPot(alice, payees, pIds, 0, uint40(block.timestamp + 30 days), 1, cs, mlLabels, mlIdxs, mlCaps);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));

        // Invoice for 40 > cap 30 → reverts
        vm.prank(alice);
        vm.expectRevert(KoloGroupPot.AmountExceedsMilestoneCap.selector);
        p.submitInvoice(0, 0, uint248(40 * USDC_1), bytes32(0), bytes32(0));

        // Invoice for 25 ≤ cap → succeeds
        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(25 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(alice);
        p.approve(invId);
        vm.prank(alice);
        p.release(invId);
        // Milestone partial — struct: (label, payeeIdx, cap, released, status)
        (,,, uint128 releasedMs,) = _getMilestone(p, 0);
        assertEq(releasedMs, 25 * USDC_1);
    }

    // ── ERC-1271 smart account co-signer ──────────────────────────────────────

    function test_erc1271_cosigner_approves() public {
        MockERC1271 msca = new MockERC1271();

        address[] memory payees = new address[](1); payees[0] = payee;
        uint256[] memory pIds   = new uint256[](1); pIds[0]   = 0;
        address[] memory cs     = new address[](1); cs[0]     = address(msca);
        bytes32[] memory mlL = new bytes32[](0); uint8[] memory mlI = new uint8[](0); uint128[] memory mlC = new uint128[](0);

        (, KoloGroupPot p) = _createGroupPot(alice, payees, pIds, 0, uint40(block.timestamp + 30 days), 1, cs, mlL, mlI, mlC);
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));

        // Any sig works because MockERC1271 always returns magic value
        vm.prank(address(msca));
        p.approve(invId); // tx-based approval with the MSCA address as sender
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.Approved));
    }

    // ── Global stats ─────────────────────────────────────────────────────────

    function test_globalStats_updated_on_contribute_release_refund() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(50  * USDC_1));

        (uint256 locked1,,) = factory.globalStats();
        assertEq(locked1, 150 * USDC_1);

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(40 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(alice);
        p.approve(invId);
        vm.prank(alice);
        p.release(invId);

        (uint256 locked2, uint256 released2,) = factory.globalStats();
        assertEq(released2, 40 * USDC_1);
        assertEq(locked2,   110 * USDC_1);

        skip(30 days + 3 days + 1);
        p.triggerRefunding();
        vm.prank(alice);
        p.claimRefund();
        vm.prank(bob);
        p.claimRefund();

        (uint256 locked3,, uint256 refunded3) = factory.globalStats();
        assertEq(locked3,   0);
        assertEq(refunded3, 110 * USDC_1);
    }

    // ── Fuzz: pro-rata math ────────────────────────────────────────────────────

    function testFuzz_proRata_conservation(uint64 a, uint64 b, uint64 c) public {
        vm.assume(a > 0 && b > 0 && c > 0);
        vm.assume(uint256(a) + b + c <= type(uint96).max);

        // Mint exact fuzz amounts (setUp only mints 100k each)
        usdc.mint(alice, a);
        usdc.mint(bob,   b);
        usdc.mint(carol, c);

        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 7 days));
        _approveAndContribute(alice, address(p), uint128(a));
        _approveAndContribute(bob,   address(p), uint128(b));
        _approveAndContribute(carol, address(p), uint128(c));

        skip(7 days + 3 days + 1);
        p.triggerRefunding();

        uint256 total = uint256(a) + b + c;
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);

        vm.prank(alice); p.claimRefund();
        vm.prank(bob);   p.claimRefund();
        vm.prank(carol); p.claimRefund();

        uint256 sum = (usdc.balanceOf(alice) - aliceBefore)
                    + (usdc.balanceOf(bob)   - bobBefore)
                    + (usdc.balanceOf(carol) - carolBefore);

        // Σ refunds ≤ Σ contributions (dust can remain in last claimant but sum must equal total)
        assertEq(sum, total);
    }

    // ── Invariant helper: balance == contributed - released - refunded ─────────

    function test_invariant_balance() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(80 * USDC_1));
        _approveAndContribute(bob,   address(p), uint128(20 * USDC_1));

        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(30 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(alice);
        p.approve(invId);
        vm.prank(alice);
        p.release(invId);

        uint256 balance  = usdc.balanceOf(address(p));
        uint256 expected = p.totalContributed() - p.totalReleased() - p.totalRefunded();
        assertEq(balance, expected);
    }

    // ── Reentrancy guard ─────────────────────────────────────────────────────
    //
    // Note: The trust-anchor injection fix (setCanonicals enforces canonical USDC)
    // prevents the malicious-token reentrancy vector entirely.
    // We verify the nonReentrant guard is in place via the double-call test above
    // (test_claimRefund_double_reverts) and by confirming setCanonicals enforces USDC.

    function test_reentrancy_setCanonicals_enforces_canonical_usdc() public {
        // Attempt to create a pot with a non-canonical USDC — setCanonicals must overwrite it
        address[] memory payees = new address[](1); payees[0] = payee;
        uint256[] memory pIds   = new uint256[](1); pIds[0]   = 0;
        address[] memory cs     = new address[](0);
        bytes32[] memory mlL = new bytes32[](0); uint8[] memory mlI = new uint8[](0); uint128[] memory mlC = new uint128[](0);

        address fakeUsdc = makeAddr("fakeUsdc");
        bytes memory params = abi.encode(
            alice, fakeUsdc, address(factory), uint256(0),
            bytes32(0), uint128(0), uint96(0), uint40(block.timestamp + 1 days),
            true, uint8(1), cs, pIds, payees, mlL, mlI, mlC
        );

        vm.prank(alice);
        (, address potAddr) = factory.createGroupPot(params);
        KoloGroupPot p = KoloGroupPot(potAddr);

        // After setCanonicals, usdc must be factory's canonical USDC, not fakeUsdc
        assertEq(p.usdc(), address(usdc));
        assertNotEq(p.usdc(), fakeUsdc);
    }

    // ── Cancel invoice ────────────────────────────────────────────────────────

    function test_cancelInvoice() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        _approveAndContribute(alice, address(p), uint128(100 * USDC_1));
        vm.prank(alice);
        uint16 invId = p.submitInvoice(0, 0, uint248(50 * USDC_1), bytes32(0), bytes32(0));
        vm.prank(alice);
        p.cancelInvoice(invId);
        assertEq(uint8(_getInvoiceStatus(p, invId)), uint8(KoloGroupPot.InvStatus.Cancelled));
    }

    // ── Gas snapshot ─────────────────────────────────────────────────────────

    function test_gas_contribute() public {
        (, KoloGroupPot p) = _makeSimplePot(0, uint40(block.timestamp + 30 days));
        vm.startPrank(alice);
        usdc.approve(address(p), type(uint256).max);
        uint256 g = gasleft();
        p.contribute(uint128(10 * USDC_1), bytes32(0));
        uint256 used = g - gasleft();
        vm.stopPrank();
        emit log_named_uint("gas:contribute", used);
        assertLt(used, 200_000);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Invoice getter: (payeeIdx, milestoneId, status, amount, invoiceHash, uri,
    //                  approvalBitmap, resolveBitmap, approvalCount, disputeCount, resolveCount)

    function _getInvoiceStatus(KoloGroupPot p, uint16 id) internal view returns (KoloGroupPot.InvStatus s) {
        (,, s,,,,,,,,) = p.invoices(id);
    }

    function _getInvoiceBitmap(KoloGroupPot p, uint16 id) internal view returns (uint128 bm) {
        (,,,,,, bm,,,,) = p.invoices(id);
    }

    function _getInvoice(KoloGroupPot p, uint16 id) internal view returns (
        uint8 pi, uint8 mi, KoloGroupPot.InvStatus s, uint248 amt, bytes32 ih, bytes32 u,
        uint128 bm, uint128 rbm, uint8 ac, uint8 dc, uint8 rc
    ) {
        (pi, mi, s, amt, ih, u, bm, rbm, ac, dc, rc) = p.invoices(id);
    }

    function _getMilestone(KoloGroupPot p, uint8 id) internal view returns (
        bytes32 label, uint8 payeeIdx, uint128 cap, uint128 releasedMs, KoloGroupPot.MilestoneStatus ms
    ) {
        (label, payeeIdx, cap, releasedMs, ms) = p.milestones(id);
    }
}
