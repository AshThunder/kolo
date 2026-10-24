// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./KoloTestBase.sol";

/// @dev Stateful fuzz handler: random contributions, invoices, approvals, releases,
///      disputes, closes, refunds and time warps against one GroupPot (fee on).
contract GroupPotHandler is Test {
    KoloGroupPot public pot; MockUSDC public usdc; address public org; address[] public actors;
    uint256 public ghostIn; uint256 public ghostOut; // USDC that entered / left the pot
    mapping(address => uint256) public ghostRefund;
    uint256 public releases; uint256 public refunds;

    constructor(KoloGroupPot p, MockUSDC u, address o, address[] memory a) { pot = p; usdc = u; org = o; actors = a; }
    function _actor(uint256 s) internal view returns (address) { return actors[s % actors.length]; }

    function contribute(uint256 who, uint128 amt) external {
        address a = _actor(who); amt = uint128(bound(amt, 1, 500e6));
        vm.startPrank(a); usdc.approve(address(pot), amt);
        try pot.contribute(amt, bytes32(0)) { ghostIn += amt; } catch {}
        vm.stopPrank();
    }
    function invoiceAndRelease(uint248 amt, bool flag) external {
        amt = uint248(bound(amt, 1, 400e6));
        vm.prank(org);
        try pot.submitInvoice(0, 0, amt, keccak256(abi.encode(amt)), bytes32(0)) returns (uint16 id) {
            if (flag) { vm.prank(actors[0]); try pot.flagInvoice(id, bytes32("x")) {} catch {} }
            vm.prank(org); try pot.approve(id) {} catch {}
            for (uint256 i; i < actors.length; i++) { vm.prank(actors[i]); try pot.approve(id) {} catch {} }
            uint256 b = usdc.balanceOf(address(pot));
            vm.prank(org); try pot.release(id) { ghostOut += b - usdc.balanceOf(address(pot)); releases++; } catch {}
        } catch {}
    }
    function close(uint256 who) external {
        vm.prank(org); try pot.close() {} catch {}
        vm.prank(_actor(who)); try pot.approveClose() {} catch {}
    }
    function warp(uint32 dt) external { vm.warp(block.timestamp + bound(dt, 1, 2 days)); }
    function refund(uint256 who) external {
        address a = _actor(who); uint256 b = usdc.balanceOf(a);
        vm.prank(a);
        try pot.claimRefund() { uint256 d = usdc.balanceOf(a) - b; ghostRefund[a] += d; ghostOut += d; refunds++; } catch {}
    }
    function actorCount() external view returns (uint256) { return actors.length; }
}

contract KoloAccountingInvariantTest is KoloTestBase {
    GroupPotHandler handler; KoloGroupPot pot;
    address vendor = makeAddr("vendor");

    function setUp() public {
        _setUp();
        vm.prank(admin); factory.setFee(50); // 0.5% fee so fee accounting is exercised
        address[] memory payeeAddrs = new address[](1); payeeAddrs[0] = vendor;
        uint256[] memory ids = new uint256[](1);
        address[] memory cos = new address[](2); cos[0] = bob; cos[1] = carol;
        (, pot) = _createGroupPot(alice, payeeAddrs, ids, 1_000e6, uint40(block.timestamp + 30 days), 2, cos, new bytes32[](0), new uint8[](0), new uint128[](0));
        address[] memory actors = new address[](3); actors[0] = bob; actors[1] = carol; actors[2] = dave;
        handler = new GroupPotHandler(pot, usdc, alice, actors);
        targetContract(address(handler));
    }

    /// pot balance always equals contributed − released − refunded
    function invariant_balanceMatchesLedger() public view {
        assertEq(usdc.balanceOf(address(pot)), uint256(pot.totalContributed()) - pot.totalReleased() - pot.totalRefunded());
    }
    /// money out never exceeds money in, and ghost flows match the pot's counters
    function invariant_conservation() public view {
        assertLe(uint256(pot.totalReleased()) + pot.totalRefunded(), pot.totalContributed());
        assertEq(handler.ghostIn(), pot.totalContributed());
        assertEq(handler.ghostOut(), uint256(pot.totalReleased()) + pot.totalRefunded());
    }
    /// no contributor ever gets back more than they put in
    function invariant_refundNeverExceedsContribution() public view {
        for (uint256 i; i < handler.actorCount(); i++) { address a = handler.actors(i); assertLe(handler.ghostRefund(a), pot.contributed(a)); }
    }
    uint256 public runs; uint256 public runsWithRelease; uint256 public runsWithRefund;
    function afterInvariant() public {
        vm.writeLine("/tmp/kolo-inv.log", string.concat(vm.toString(handler.releases()), " ", vm.toString(handler.refunds())));
    }
    /// factory global stats agree with the single pot
    function invariant_factoryStats() public view {
        (uint256 locked, uint256 released, uint256 refunded) = factory.globalStats();
        assertEq(locked, usdc.balanceOf(address(pot)));
        assertEq(released, pot.totalReleased());
        assertEq(refunded, pot.totalRefunded());
    }
}

contract KoloAccountingCoverage is KoloAccountingInvariantTest {
    /// fuzzed amounts through a full contribute → release → close → refund path; asserts both money-out paths really execute
    function testFuzz_releaseThenRefund(uint128 a, uint128 b, uint248 inv) public {
        a = uint128(bound(a, 50e6, 450e6)); b = uint128(bound(b, 50e6, 450e6));
        handler.contribute(0, a); handler.contribute(1, b);
        handler.invoiceAndRelease(uint248(bound(inv, 1, a + b - 1)), false);
        handler.close(0); handler.refund(0); handler.refund(1);
        assertGt(handler.releases(), 0); assertEq(handler.refunds(), 2);
        assertEq(usdc.balanceOf(address(pot)), 0); // last claimant sweeps dust
        invariant_balanceMatchesLedger(); invariant_conservation(); invariant_refundNeverExceedsContribution(); invariant_factoryStats();
    }

    function test_handlerReachesReleaseAndRefund() public {
        handler.contribute(0, 300e6); handler.contribute(1, 300e6);
        assertEq(handler.ghostIn(), 600e6);
        handler.invoiceAndRelease(100e6, false);
        assertGt(handler.releases(), 0);
        handler.close(0); handler.refund(0);
        assertGt(handler.refunds(), 0);
    }
}
