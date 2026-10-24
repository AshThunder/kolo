// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {PayeeRegistry} from "./PayeeRegistry.sol";

/**
 * @title  KoloFactory
 * @notice Deploys EIP-1167 minimal proxies for GroupPot and TuitionPot,
 *         maintains the global platform counters (totalLocked / totalReleased /
 *         totalRefunded), and holds protocol configuration.
 *
 * Only registered clones (pots deployed by this factory) may call the stat-
 * update hook `recordMove`.  Every other caller is rejected.
 *
 * Protocol fee
 * ────────────
 * Default 0 bps; capped at 100 bps (1%).  Charged at release time by the pot.
 */
contract KoloFactory is Ownable2Step {
    using Clones for address;

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum PotType { Group, Tuition }

    // ── Storage ───────────────────────────────────────────────────────────────
    address public immutable usdc;
    PayeeRegistry public immutable registry;

    address public groupPotImpl;
    address public tuitionPotImpl;
    address public cctpReceiver;

    address public treasury;
    uint16  public feeBps;          // protocol fee (default 0, cap 100)
    uint16  public constant FEE_CAP = 100;

    // global stats — updated by pots via recordMove
    uint256 public totalLocked;     // Σ contributions not yet released or refunded
    uint256 public totalReleased;
    uint256 public totalRefunded;

    uint256 public potCount;
    mapping(address => bool)    public isClone;   // registered pot clones
    mapping(uint256 => address) public potAddress;
    mapping(uint256 => PotType) public potType;

    // ── Errors ────────────────────────────────────────────────────────────────
    error ZeroAddress();
    error FeeTooHigh();
    error NotAClone();
    error ImplNotSet();

    // ── Events ────────────────────────────────────────────────────────────────
    event PotCreated(uint256 indexed potId, PotType indexed potType, address pot, address indexed organizer);
    event ImplUpdated(PotType potType, address impl);
    event FeeUpdated(uint16 feeBps);
    event TreasuryUpdated(address indexed treasury);
    event CctpReceiverUpdated(address indexed receiver);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address usdc_,
        address registry_,
        address treasury_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (usdc_ == address(0) || registry_ == address(0) || treasury_ == address(0))
            revert ZeroAddress();
        usdc     = usdc_;
        registry = PayeeRegistry(registry_);
        treasury = treasury_;
    }

    // ── Owner config ──────────────────────────────────────────────────────────

    function setGroupPotImpl(address impl) external onlyOwner {
        if (impl == address(0)) revert ZeroAddress();
        groupPotImpl = impl;
        emit ImplUpdated(PotType.Group, impl);
    }

    function setTuitionPotImpl(address impl) external onlyOwner {
        if (impl == address(0)) revert ZeroAddress();
        tuitionPotImpl = impl;
        emit ImplUpdated(PotType.Tuition, impl);
    }

    function setCctpReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        cctpReceiver = receiver;
        emit CctpReceiverUpdated(receiver);
    }

    function setFee(uint16 bps) external onlyOwner {
        if (bps > FEE_CAP) revert FeeTooHigh();
        feeBps = bps;
        emit FeeUpdated(bps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    // ── Pot creation ──────────────────────────────────────────────────────────

    /**
     * @notice Create a new GroupPot clone.
     * @param  params  ABI-encoded initialiser payload (see KoloGroupPot.initialize).
     *                 After initialization the factory calls `setCanonicals` to overwrite
     *                 usdc/factory/potId with the factory's own values, preventing trust-anchor
     *                 injection via user-supplied params.
     * @return potId   1-based sequential pot ID.
     */
    function createGroupPot(bytes calldata params) external returns (uint256 potId, address pot) {
        if (groupPotImpl == address(0)) revert ImplNotSet();
        potId = _nextPotId();
        pot   = groupPotImpl.clone();
        _register(potId, pot, PotType.Group, params);
        _enforceCanonicals(pot, potId);
    }

    /**
     * @notice Create a new TuitionPot clone.
     *         After initialization canonical usdc/factory/potId are enforced.
     */
    function createTuitionPot(bytes calldata params) external returns (uint256 potId, address pot) {
        if (tuitionPotImpl == address(0)) revert ImplNotSet();
        potId = _nextPotId();
        pot   = tuitionPotImpl.clone();
        _register(potId, pot, PotType.Tuition, params);
        _enforceCanonicals(pot, potId);
    }

    // ── Stat hook (called by pots) ────────────────────────────────────────────

    enum MoveKind { Contribute, Release, Refund }

    /**
     * @notice Update global counters.
     *         Only registered clones may call this.
     */
    function recordMove(MoveKind kind, uint256 amount) external {
        if (!isClone[msg.sender]) revert NotAClone();
        if (kind == MoveKind.Contribute) {
            totalLocked += amount;
        } else if (kind == MoveKind.Release) {
            totalLocked  -= amount;
            totalReleased += amount;
        } else {
            totalLocked   -= amount;
            totalRefunded += amount;
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function globalStats() external view returns (uint256 locked, uint256 released, uint256 refunded) {
        return (totalLocked, totalReleased, totalRefunded);
    }

    // ── Trust-anchor enforcement ───────────────────────────────────────────────

    /**
     * @dev After initializing a clone, call setCanonicals() on it to overwrite
     *      any usdc/factory/potId values the caller encoded in params.
     *      This prevents trust-anchor injection while avoiding re-encoding params
     *      (which causes Yul stack-too-deep with 16+ ABI arguments).
     *
     *      setCanonicals() on each pot reverts if called by anyone except the factory
     *      and only during initialization (before the pot is registered as active).
     */
    function _enforceCanonicals(address pot, uint256 canonPotId) internal {
        (bool ok, bytes memory err) = pot.call(
            abi.encodeWithSignature("setCanonicals(address,address,uint256)", usdc, address(this), canonPotId)
        );
        if (!ok) {
            if (err.length > 0) {
                assembly { revert(add(err, 32), mload(err)) }
            }
            revert("KoloFactory: setCanonicals failed");
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _nextPotId() internal returns (uint256 id) {
        unchecked { id = ++potCount; }
    }

    function _register(uint256 potId, address pot, PotType t, bytes calldata params) internal {
        isClone[pot]       = true;
        potAddress[potId]  = pot;
        potType[potId]     = t;

        // Initialise the clone (delegatecall NOT used; the pot's own initialize)
        (bool ok, bytes memory err) = pot.call(
            abi.encodeWithSignature("initialize(bytes)", params)
        );
        if (!ok) {
            // bubble up revert reason
            if (err.length > 0) {
                assembly { revert(add(err, 32), mload(err)) }
            }
            revert("KoloFactory: init failed");
        }

        // Organizer is encoded first in all pot init structs; decode just for event
        address organizer;
        if (params.length >= 32) {
            (organizer) = abi.decode(params[:32], (address));
        }

        emit PotCreated(potId, t, pot, organizer);
    }
}
