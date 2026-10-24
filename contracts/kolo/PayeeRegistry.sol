// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  PayeeRegistry
 * @notice Verified on-chain directory of payees (Schools, Vendors, Hospitals).
 *         Kolo pots reference a payeeId and resolve the current wallet only if
 *         the payee is still verified.
 *
 * Roles
 * ─────
 * DEFAULT_ADMIN_ROLE  — owner; can grant/revoke REGISTRAR_ROLE.
 * REGISTRAR_ROLE      — trusted multisig; can register, verify, revoke, and
 *                       execute queued wallet changes.
 *
 * Wallet-change timelock
 * ──────────────────────
 * A registered payee may call `requestWalletChange(newWallet)`.
 * A registrar must call `executeWalletChange(id)` after WALLET_CHANGE_DELAY
 * (48 hours) has elapsed.  This prevents a sudden address-swap attack.
 */
contract PayeeRegistry is AccessControl {
    // ── Constants ─────────────────────────────────────────────────────────────
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    uint256 public constant WALLET_CHANGE_DELAY = 48 hours;

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum Kind { School, Vendor, Hospital }
    enum Status { Unregistered, Registered, Verified, Revoked }

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Payee {
        Kind     kind;
        Status   status;
        address  wallet;
        bytes32  nameHash;   // keccak256 of off-chain display name
        bytes32  docHash;    // keccak256 of KYC / registration document
        address  verifier;
        uint40   verifiedAt;
        uint40   registeredAt;
    }

    struct WalletChangeRequest {
        address  newWallet;
        uint40   queuedAt;
        bool     pending;
    }

    uint256 public payeeCount;
    mapping(uint256 => Payee)               private _payees;
    mapping(uint256 => WalletChangeRequest) private _walletChangeRequests;
    /// @dev reverse lookup: wallet → payeeId (0 = not registered)
    mapping(address => uint256)             public walletToPayeeId;

    // ── Errors ────────────────────────────────────────────────────────────────
    error ZeroAddress();
    error NotRegistered();
    error AlreadyVerified();
    error NotVerified();
    error AlreadyRevoked();
    error WalletAlreadyUsed();
    error NoWalletChangeRequest();
    error TimelockNotElapsed();
    error NotPayeeWallet();

    // ── Events ────────────────────────────────────────────────────────────────
    event PayeeRegistered(uint256 indexed id, Kind kind, address wallet, bytes32 nameHash);
    event Verified(uint256 indexed id, address indexed registrar, bytes32 docHash, uint256 timestamp);
    event Revoked(uint256 indexed id, address indexed registrar);
    event WalletChangeQueued(uint256 indexed id, address indexed newWallet, uint256 executeAfter);
    event WalletChangeExecuted(uint256 indexed id, address indexed oldWallet, address indexed newWallet);
    event Released(uint256 indexed potId, uint256 indexed payeeId, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    // ── Registrar actions ─────────────────────────────────────────────────────

    /**
     * @notice Register a new payee.
     * @return id  The new payee ID (1-based).
     */
    function registerPayee(
        Kind    kind,
        address wallet,
        bytes32 nameHash,
        bytes32 docHash
    ) external onlyRole(REGISTRAR_ROLE) returns (uint256 id) {
        if (wallet == address(0))             revert ZeroAddress();
        if (walletToPayeeId[wallet] != 0)     revert WalletAlreadyUsed();

        unchecked { id = ++payeeCount; }

        _payees[id] = Payee({
            kind:         kind,
            status:       Status.Registered,
            wallet:       wallet,
            nameHash:     nameHash,
            docHash:      docHash,
            verifier:     address(0),
            verifiedAt:   0,
            registeredAt: uint40(block.timestamp)
        });

        walletToPayeeId[wallet] = id;

        emit PayeeRegistered(id, kind, wallet, nameHash);
    }

    /**
     * @notice Verify a registered payee (after KYC / document review).
     */
    function verify(uint256 id, bytes32 docHash) external onlyRole(REGISTRAR_ROLE) {
        Payee storage p = _requireRegistered(id);
        if (p.status == Status.Verified) revert AlreadyVerified();

        p.status     = Status.Verified;
        p.verifier   = msg.sender;
        p.verifiedAt = uint40(block.timestamp);
        if (docHash != bytes32(0)) p.docHash = docHash;

        emit Verified(id, msg.sender, p.docHash, block.timestamp);
    }

    /**
     * @notice Revoke a payee.  Pots referencing this payee will freeze.
     */
    function revoke(uint256 id) external onlyRole(REGISTRAR_ROLE) {
        Payee storage p = _requireRegistered(id);
        if (p.status == Status.Revoked) revert AlreadyRevoked();

        p.status = Status.Revoked;

        emit Revoked(id, msg.sender);
    }

    // ── Payee-initiated wallet change ─────────────────────────────────────────

    /**
     * @notice Queue a wallet change.  Must be called by the payee's current wallet.
     */
    function requestWalletChange(uint256 id, address newWallet) external {
        if (newWallet == address(0))           revert ZeroAddress();
        if (walletToPayeeId[newWallet] != 0)   revert WalletAlreadyUsed();

        Payee storage p = _requireRegistered(id);
        if (p.wallet != msg.sender)            revert NotPayeeWallet();

        _walletChangeRequests[id] = WalletChangeRequest({
            newWallet: newWallet,
            queuedAt:  uint40(block.timestamp),
            pending:   true
        });

        emit WalletChangeQueued(id, newWallet, block.timestamp + WALLET_CHANGE_DELAY);
    }

    /**
     * @notice Execute a queued wallet change after the timelock has elapsed.
     *         Must be called by a REGISTRAR (extra check in addition to the delay).
     */
    function executeWalletChange(uint256 id) external onlyRole(REGISTRAR_ROLE) {
        WalletChangeRequest storage req = _walletChangeRequests[id];
        if (!req.pending)                                          revert NoWalletChangeRequest();
        if (block.timestamp < uint256(req.queuedAt) + WALLET_CHANGE_DELAY) revert TimelockNotElapsed();

        Payee storage p = _payees[id];
        address oldWallet = p.wallet;
        address newWallet = req.newWallet;

        // free old slot, assign new
        walletToPayeeId[oldWallet] = 0;
        walletToPayeeId[newWallet] = id;
        p.wallet = newWallet;

        delete _walletChangeRequests[id];

        emit WalletChangeExecuted(id, oldWallet, newWallet);
    }

    // ── Factory hook: emit Released event ─────────────────────────────────────

    /**
     * @notice Called by pots (via factory) to record a payment to this payee.
     *         Anyone may call this; it only emits an event (no state change).
     */
    function recordRelease(uint256 potId, uint256 payeeId, uint256 amount) external {
        emit Released(potId, payeeId, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function isVerified(uint256 id) external view returns (bool) {
        return _payees[id].status == Status.Verified;
    }

    function walletOf(uint256 id) external view returns (address) {
        return _payees[id].wallet;
    }

    function kindOf(uint256 id) external view returns (Kind) {
        return _payees[id].kind;
    }

    function statusOf(uint256 id) external view returns (Status) {
        return _payees[id].status;
    }

    /**
     * @notice Full payee info as required by spec §10.
     */
    function payeeInfo(uint256 id) external view returns (
        Kind    kind,
        Status  status,
        address wallet,
        bytes32 nameHash,
        bytes32 docHash,
        address verifier,
        uint256 verifiedAt,
        uint256 registeredAt
    ) {
        Payee storage p = _payees[id];
        return (p.kind, p.status, p.wallet, p.nameHash, p.docHash,
                p.verifier, p.verifiedAt, p.registeredAt);
    }

    function pendingWalletChange(uint256 id) external view returns (address newWallet, uint256 executeAfter) {
        WalletChangeRequest storage req = _walletChangeRequests[id];
        if (!req.pending) return (address(0), 0);
        return (req.newWallet, uint256(req.queuedAt) + WALLET_CHANGE_DELAY);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _requireRegistered(uint256 id) internal view returns (Payee storage p) {
        p = _payees[id];
        if (p.status == Status.Unregistered) revert NotRegistered();
    }
}
