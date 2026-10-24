// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./KoloTestBase.sol";
import {KoloCctpReceiver} from "../../kolo/KoloCctpReceiver.sol";
import {KoloDepositSweeper} from "../../kolo/KoloCctpReceiver.sol";
import {KoloSweeperFactory} from "../../kolo/KoloCctpReceiver.sol";
import {KoloGroupPot} from "../../kolo/KoloGroupPot.sol";

/**
 * @dev Mock CCTP V2 MessageTransmitter: always "succeeds" and mints `amount` to `recipient`.
 *      Encodes the minimal CCTP BurnMessage layout so the receiver can parse hookData.
 */
contract MockTransmitter {
    address public usdc;
    uint256 public mintAmount;

    constructor(address _usdc) { usdc = _usdc; }

    function setMintAmount(uint256 amt) external { mintAmount = amt; }

    function receiveMessage(bytes calldata, bytes calldata) external returns (bool) {
        // Mint to msg.sender (the KoloCctpReceiver)
        MockUSDC(usdc).mint(msg.sender, mintAmount);
        return true;
    }
}

/**
 * @dev Mock transmitter that always returns false (simulate failure).
 */
contract FailingTransmitter {
    function receiveMessage(bytes calldata, bytes calldata) external pure returns (bool) {
        return false;
    }
}

contract KoloCctpTest is KoloTestBase {
    MockTransmitter  internal transmitter;
    KoloCctpReceiver internal receiver;
    KoloGroupPot     internal pot;
    uint256          internal potId;

    function setUp() public {
        _setUp();
        transmitter = new MockTransmitter(address(usdc));
        receiver    = new KoloCctpReceiver(address(transmitter), address(usdc), admin);

        // Create a simple group pot
        (potId, pot) = _createSimpleGroupPot(alice, makeAddr("payee"), 0, uint40(block.timestamp + 30 days));

        // Allowlist the pot
        vm.prank(admin);
        receiver.allowPot(address(pot), true);
    }

    // ── Build a synthetic CCTP message with hookData ──────────────────────────

    function _buildMessage(address potAddr, address contributor, bytes32 memoHash)
        internal pure returns (bytes memory)
    {
        // 376 bytes (V2 header + burn body) + 96 bytes hookData
        bytes memory header  = new bytes(376);
        bytes memory hook    = abi.encode(potAddr, contributor, memoHash);
        return abi.encodePacked(header, hook);
    }

    // ── relay happy path ──────────────────────────────────────────────────────

    function test_relay_credits_contributor() public {
        transmitter.setMintAmount(25 * USDC_1);

        bytes memory msg_  = _buildMessage(address(pot), bob, keccak256("memo"));
        bytes memory attn  = bytes("");

        // pot needs to accept transferFrom from receiver
        // The receiver approves the pot inside relay()
        vm.prank(alice);
        receiver.relay(msg_, attn);

        assertEq(pot.contributed(bob), 25 * USDC_1);
        assertEq(pot.totalContributed(), 25 * USDC_1);
    }

    /// @dev Real CCTP V2 layout: 148-byte header + 228-byte burn body fields + hookData.
    function test_relay_realV2MessageLayout() public {
        transmitter.setMintAmount(7 * USDC_1);
        bytes memory header = abi.encodePacked(
            uint32(1), uint32(6), uint32(26), bytes32(uint256(1)),          // version, src, dst, nonce
            bytes32(uint256(uint160(alice))), bytes32(uint256(uint160(address(receiver)))), // sender, recipient
            bytes32(uint256(uint160(address(receiver)))), uint32(2000), uint32(2000)         // destCaller, finality
        );
        assertEq(header.length, 148);
        bytes memory body = abi.encodePacked(
            uint32(1), bytes32(uint256(1)), bytes32(uint256(uint160(address(receiver)))), uint256(7 * USDC_1),
            bytes32(uint256(uint160(alice))), uint256(0), uint256(0), uint256(0)             // sender, maxFee, feeExecuted, expiry
        );
        assertEq(body.length, 228);
        bytes memory msg_ = abi.encodePacked(header, body, abi.encode(address(pot), bob, keccak256("real")));
        receiver.relay(msg_, bytes(""));
        assertEq(pot.contributed(bob), 7 * USDC_1);
    }

    // ── replay protection ─────────────────────────────────────────────────────

    function test_relay_replay_reverts() public {
        transmitter.setMintAmount(10 * USDC_1);

        bytes memory msg_  = _buildMessage(address(pot), bob, keccak256("memo"));
        bytes memory attn  = bytes("");

        vm.prank(alice);
        receiver.relay(msg_, attn);

        vm.prank(alice);
        vm.expectRevert(KoloCctpReceiver.MessageAlreadyProcessed.selector);
        receiver.relay(msg_, attn);
    }

    // ── malformed hookData ────────────────────────────────────────────────────

    function test_relay_shortMessage_reverts() public {
        bytes memory shortMsg = new bytes(100); // < 376 bytes
        vm.expectRevert(KoloCctpReceiver.InvalidHookData.selector);
        receiver.relay(shortMsg, bytes(""));
    }

    function test_relay_shortHookData_reverts() public {
        bytes memory header   = new bytes(376);
        bytes memory shortHook = new bytes(80); // < 96 bytes
        bytes memory msg_ = abi.encodePacked(header, shortHook);
        // mark as new hash
        vm.expectRevert(KoloCctpReceiver.InvalidHookData.selector);
        receiver.relay(msg_, bytes(""));
    }

    // ── pot not allowlisted ───────────────────────────────────────────────────

    function test_relay_potNotAllowed_reverts() public {
        transmitter.setMintAmount(10 * USDC_1);
        address fakePot = makeAddr("fakePot");
        bytes memory msg_ = _buildMessage(fakePot, bob, bytes32(0));
        vm.expectRevert(KoloCctpReceiver.PotNotAllowed.selector);
        receiver.relay(msg_, bytes(""));
    }

    // ── transmitter failure ───────────────────────────────────────────────────

    function test_relay_transmitterFails_reverts() public {
        FailingTransmitter ft  = new FailingTransmitter();
        KoloCctpReceiver   rcv = new KoloCctpReceiver(address(ft), address(usdc), admin);
        vm.prank(admin);
        rcv.allowPot(address(pot), true);

        transmitter.setMintAmount(10 * USDC_1);
        bytes memory msg_ = _buildMessage(address(pot), bob, bytes32(0));
        vm.expectRevert(KoloCctpReceiver.RelayFailed.selector);
        rcv.relay(msg_, bytes(""));
    }

    // ── DepositSweeper ────────────────────────────────────────────────────────

    function test_sweeper_sweep_happy() public {
        KoloSweeperFactory sf = new KoloSweeperFactory(address(usdc));

        address sweeperAddr = sf.computeSweeperAddress(address(pot), carol, bytes32(0), 0);

        // "Circle Forwarding Service" mints to the sweeper address
        usdc.mint(sweeperAddr, 15 * USDC_1);

        // Deploy and sweep
        sf.deploySweeper(address(pot), carol, bytes32(0), 0);
        KoloDepositSweeper sweeper = KoloDepositSweeper(sweeperAddr);

        // pot needs to pull from sweeper; sweeper calls contributeFor
        sweeper.sweep();

        assertEq(pot.contributed(carol), 15 * USDC_1);
    }

    function test_sweeper_idempotent_zeroBalance() public {
        KoloSweeperFactory sf = new KoloSweeperFactory(address(usdc));
        sf.deploySweeper(address(pot), carol, bytes32(0), 0);
        address sweeperAddr = sf.computeSweeperAddress(address(pot), carol, bytes32(0), 0);
        KoloDepositSweeper sweeper = KoloDepositSweeper(sweeperAddr);

        // No USDC minted → sweep is a no-op
        uint256 before = usdc.balanceOf(address(pot));
        sweeper.sweep();
        assertEq(usdc.balanceOf(address(pot)), before); // unchanged
    }

    function test_sweeper_computeAddress_matches_deploy() public {
        KoloSweeperFactory sf = new KoloSweeperFactory(address(usdc));
        address predicted = sf.computeSweeperAddress(address(pot), dave, keccak256("m"), 42);
        address deployed  = sf.deploySweeper(address(pot), dave, keccak256("m"), 42);
        assertEq(predicted, deployed);
    }

    // ── rescueTokens ─────────────────────────────────────────────────────────

    function test_rescueTokens_onlyOwner() public {
        usdc.mint(address(receiver), 5 * USDC_1);
        vm.prank(alice);
        vm.expectRevert();
        receiver.rescueTokens(address(usdc), alice, 5 * USDC_1);

        vm.prank(admin);
        receiver.rescueTokens(address(usdc), admin, 5 * USDC_1);
        assertEq(usdc.balanceOf(admin), 5 * USDC_1);
    }
}
