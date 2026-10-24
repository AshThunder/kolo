// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {KoloFactory} from "./KoloFactory.sol";
import {PayeeRegistry} from "./PayeeRegistry.sol";

/**
 * @title  KoloGroupPot
 * @notice EIP-1167 clone.  Group gifts, events, trips.
 *
 * Flow
 * ────
 * 1.  Contributors call contribute() or are credited via contributeFor().
 * 2.  Organizer submits an invoice referencing a milestone.
 * 3.  Co-signers approve (tx or EIP-712 sig via SignatureChecker → ERC-1271 compat).
 * 4.  At threshold the invoice becomes Approved; organizer calls release().
 * 5.  Missed deadline+grace → Refunding.  Anyone calls claimRefund().
 * 6.  After the final release, leftover → pro-rata claimRefund().
 *
 * Approved additions (spec §10)
 * ─────────────────────────────
 * • pledge / pledgeOf
 * • subscribe / pull / cancelSubscription
 * • milestones (set at creation, invoices reference milestoneId)
 * • disputes: flagInvoice / resolve
 * • EIP-712 co-signer approvals via SignatureChecker (ERC-1271)
 * • Global stats hook to factory on every money move
 * • Every money event indexed by potId + amount
 */
contract KoloGroupPot is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ── Constants ─────────────────────────────────────────────────────────────
    uint8  public constant MAX_PAYEES         = 5;
    uint8  public constant MAX_COSIGNERS      = 10;
    uint256 public constant MAX_MILESTONES    = 20;
    uint256 public constant GRACE_PERIOD      = 3 days;
    uint256 public constant DISPUTE_COOLDOWN  = 1 days;

    bytes32 private constant APPROVAL_TYPEHASH =
        keccak256("ApproveInvoice(uint256 potId,uint256 invoiceId,uint256 nonce)");

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum PotState  { Active, Refunding, Closed }
    enum InvStatus { None, PendingApproval, Approved, Released, Cancelled, Disputed }
    enum MilestoneStatus { Open, Partial, Done }

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Invoice {
        uint8       payeeIdx;       // index into payees[]
        uint8       milestoneId;
        InvStatus   status;
        uint248     amount;
        bytes32     invoiceHash;
        bytes32     uri;
        uint128     approvalBitmap; // bit i = coSigner[i] approved
        uint128     resolveBitmap;  // bit i = coSigner[i] voted on current dispute; bit127 = organizer
        uint8       approvalCount;
        uint8       disputeCount;   // uphold votes
        uint8       resolveCount;   // total resolve votes
    }

    struct Milestone {
        bytes32          label;
        uint8            payeeIdx;
        uint128          cap;        // max total for this milestone
        uint128          released;
        MilestoneStatus  status;
    }

    struct Subscription {
        address subscriber;
        uint96  amountPerPull;
        uint32  interval;       // seconds
        uint32  maxPulls;
        uint32  pullCount;
        uint40  nextDue;
        bool    active;
    }

    struct Pledge {
        uint128 amount;
        uint40  dueBy;
        uint128 fulfilled;  // reduced as contributions come in
    }

    // ── Immutable-like (set once in initialize) ───────────────────────────────
    address     public factory;
    address     public usdc;

    uint256     public potId;
    address     public organizer;
    bytes32     public titleHash;
    uint128     public target;
    uint96      public minContribution;
    uint40      public deadline;
    bool        public allowOverfund;

    // payees (≤5) — immutable after init
    uint8       public payeeCount;
    uint256[5]  public payeeIds;        // registry IDs (0 = raw address)
    address[5]  public payeeAddresses;  // resolved at init for raw-address payees

    // co-signers + threshold
    uint8       public coSignerCount;
    uint8       public threshold;
    address[10] public coSigners;

    // milestones (≤20)
    uint8       public milestoneCount;
    Milestone[20] public milestones;

    // ── Mutable state ─────────────────────────────────────────────────────────
    PotState    public state;
    bool        private _initialized;

    uint128     public totalContributed;
    uint128     public totalReleased;
    uint128     public totalRefunded;
    /// @dev Tracks the sum of contributed[] for addresses that have NOT yet claimed a refund.
    ///      Used as the denominator in pro-rata refund math so each claimant gets
    ///      their proportional share of whatever balance remains, not a share that
    ///      shrinks as earlier claimants take theirs.
    uint128     public totalUnrefundedContrib;

    mapping(address => uint128) public contributed;
    mapping(address => bool)    public refundClaimed;

    uint16      public invoiceCount;
    mapping(uint256 => Invoice) public invoices;

    uint256     public subCount;
    mapping(uint256 => Subscription) public subscriptions;

    mapping(address => Pledge)  public pledges;

    // EIP-712 nonces (per cosigner, prevents sig replay)
    mapping(address => uint256) public approvalNonces;

    // dispute rate-limit per address
    mapping(address => uint40)  public lastFlagTime;

    // close approval bitmap (bit i = coSigners[i]; bit127 = organizer)
    uint128  public closeApprovalBitmap;
    uint8    public closeApprovalCount;

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyInitialized();
    error ZeroAddress();
    error NotOrganizer();
    error NotCoSigner();
    error NotContributor();
    error PotNotActive();
    error PotNotRefunding();
    error BelowMinContribution();
    error OverfundNotAllowed();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error AmountZero();
    error AmountExceedsMilestoneCap();
    error InvalidPayeeIdx();
    error InvalidMilestoneId();
    error InvoiceNotPending();
    error InvoiceNotApproved();
    error InvoiceAlreadyApproved();
    error AlreadyApprovedThisInvoice();
    error ThresholdZero();
    error InvoiceDisputed();
    error InvoiceNotDisputed();
    error AlreadyFlagged();
    error DisputeCooldown();
    error AlreadyVotedOnDispute();
    error AlreadyApprovedClose();
    error RefundAlreadyClaimed();
    error NothingToRefund();
    error InvalidThreshold();
    error SignatureAlreadyUsed();
    error PullTooEarly();
    error SubNotActive();
    error ArrayLengthMismatch();
    error TooManyPayees();
    error TooManyCosigners();
    error TooManyMilestones();
    error PayeeRegistryRevoked();
    error PledgeDuePassed();

    // ── Events ────────────────────────────────────────────────────────────────
    event Contributed(uint256 indexed potId, address indexed contributor, uint256 amount, bytes32 memoHash);
    event InvoiceSubmitted(uint256 indexed potId, uint256 indexed invoiceId, uint8 payeeIdx, uint256 amount);
    event InvoiceApproved(uint256 indexed potId, uint256 indexed invoiceId, address coSigner);
    event Released(uint256 indexed potId, uint256 indexed invoiceId, uint256 indexed payeeId, uint256 amount);
    event InvoiceCancelled(uint256 indexed potId, uint256 indexed invoiceId);
    event Refunding(uint256 indexed potId);
    event Refunded(uint256 indexed potId, address indexed contributor, uint256 amount);
    event Pledged(uint256 indexed potId, address indexed pledger, uint256 amount, uint256 dueBy);
    event Subscribed(uint256 indexed potId, uint256 indexed subId, address subscriber, uint96 amountPerPull, uint32 interval);
    event Pulled(uint256 indexed potId, uint256 indexed subId, address indexed subscriber, uint256 amount);
    event PullSkipped(uint256 indexed subId, string reason);
    event SubscriptionCancelled(uint256 indexed potId, uint256 indexed subId);
    event InvoiceFlagged(uint256 indexed potId, uint256 indexed invoiceId, address indexed flagger, bytes32 reasonHash);
    event DisputeResolved(uint256 indexed potId, uint256 indexed invoiceId, bool uphold);
    event MilestoneCompleted(uint256 indexed potId, uint8 milestoneId);
    event Paused(uint256 indexed potId);
    event Unpaused(uint256 indexed potId);
    event Closed(uint256 indexed potId);

    // ── Initializer (EIP-1167 clone pattern) ─────────────────────────────────

    /**
     * @notice One-time initializer called by factory.
     * @param  params  ABI-encoded (
     *   address organizer,
     *   address usdc,
     *   address factory,
     *   uint256 potId,
     *   bytes32 titleHash,
     *   uint128 target,
     *   uint96  minContribution,
     *   uint40  deadline,
     *   bool    allowOverfund,
     *   uint8   threshold,
     *   address[] coSigners,
     *   uint256[] payeeIds,       // registry IDs (0 means use payeeAddresses[i])
     *   address[] payeeAddresses, // for non-registry payees
     *   bytes32[] milestoneLabels,
     *   uint8[]   milestonePayeeIdxs,
     *   uint128[] milestoneCaps
     * )
     */
    function initialize(bytes calldata params) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        _initScalars(params);
        _initArrays(params);
    }

    /// @dev Decode + store scalar fields.  Separate function reduces stack depth.
    function _initScalars(bytes calldata params) private {
        (
            address _organizer,
            address _usdc,
            address _factory,
            uint256 _potId,
            bytes32 _titleHash,
            uint128 _target,
            uint96  _minContrib,
            uint40  _deadline,
            bool    _allowOverfund,
            uint8   _threshold
        ) = abi.decode(params, (
            address, address, address, uint256,
            bytes32, uint128, uint96, uint40, bool, uint8
        ));

        if (_organizer == address(0) || _usdc == address(0) || _factory == address(0))
            revert ZeroAddress();

        organizer       = _organizer;
        usdc            = _usdc;
        factory         = _factory;
        potId           = _potId;
        titleHash       = _titleHash;
        target          = _target;
        minContribution = _minContrib;
        deadline        = _deadline;
        allowOverfund   = _allowOverfund;
        threshold       = _threshold == 0 ? 1 : _threshold;
    }

    /// @dev Decode + store array fields.  Separate function reduces stack depth.
    function _initArrays(bytes calldata params) private {
        (,,,,,,,,,, // skip scalar fields
            address[] memory _coSigners,
            uint256[] memory _payeeIds,
            address[] memory _payeeAddresses,
            bytes32[] memory _mlLabels,
            uint8[]   memory _mlPayeeIdxs,
            uint128[] memory _mlCaps
        ) = abi.decode(params, (
            address, address, address, uint256,
            bytes32, uint128, uint96, uint40, bool, uint8,
            address[], uint256[], address[],
            bytes32[], uint8[], uint128[]
        ));

        if (_payeeIds.length == 0 || _payeeIds.length > MAX_PAYEES) revert TooManyPayees();
        if (_coSigners.length > MAX_COSIGNERS)                       revert TooManyCosigners();
        if (_mlLabels.length > MAX_MILESTONES)                       revert TooManyMilestones();
        if (_mlLabels.length != _mlPayeeIdxs.length || _mlLabels.length != _mlCaps.length)
            revert ArrayLengthMismatch();
        if (threshold > _coSigners.length + 1) revert InvalidThreshold(); // +1 for organizer

        payeeCount = uint8(_payeeIds.length);
        for (uint256 i; i < _payeeIds.length; ++i) {
            payeeIds[i]      = _payeeIds[i];
            payeeAddresses[i] = _payeeAddresses.length > i ? _payeeAddresses[i] : address(0);
        }

        coSignerCount = uint8(_coSigners.length);
        for (uint256 i; i < _coSigners.length; ++i) {
            coSigners[i] = _coSigners[i];
        }

        milestoneCount = uint8(_mlLabels.length);
        for (uint256 i; i < _mlLabels.length; ++i) {
            milestones[i] = Milestone({
                label:    _mlLabels[i],
                payeeIdx: _mlPayeeIdxs[i],
                cap:      _mlCaps[i],
                released: 0,
                status:   MilestoneStatus.Open
            });
        }
    }

    // ── Trust-anchor enforcement (called by factory after initialize) ─────────

    /**
     * @notice Overwrite usdc / factory / potId with factory-canonical values.
     *         May only be called by the factory address that was set in initialize(),
     *         and only once (guarded by _canonicalsSet).
     *         Called automatically by KoloFactory._enforceCanonicals() right after
     *         initialize(); prevents trust-anchor injection via user-supplied params.
     */
    bool private _canonicalsSet;

    function setCanonicals(address _usdc, address _factory, uint256 _potId) external {
        if (_canonicalsSet)        revert AlreadyInitialized();
        if (msg.sender != factory) revert NotOrganizer(); // factory address came from init
        _canonicalsSet = true;
        usdc    = _usdc;
        factory = _factory;
        potId   = _potId;
    }

    // ── EIP-712 domain separator (computed inline; no base-class constructor) ─

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("KoloGroupPot"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    // ── Contribution ──────────────────────────────────────────────────────────

    function contribute(uint128 amount, bytes32 memoHash) external nonReentrant {
        _contribute(msg.sender, amount, memoHash);
    }

    function contributeFor(address contributor, uint128 amount, bytes32 memoHash) external nonReentrant {
        if (contributor == address(0)) revert ZeroAddress();
        _contribute(contributor, amount, memoHash);
    }

    function _contribute(address contributor, uint128 amount, bytes32 memoHash) internal {
        if (state != PotState.Active)        revert PotNotActive();
        if (paused())                        revert EnforcedPause();
        if (block.timestamp > deadline)      revert DeadlinePassed();
        if (amount < minContribution)        revert BelowMinContribution();

        uint128 newTotal = totalContributed + amount;
        if (!allowOverfund && target > 0 && newTotal > target) revert OverfundNotAllowed();

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);

        contributed[contributor]   += amount;
        totalContributed            = newTotal;
        totalUnrefundedContrib     += amount;

        // reduce outstanding pledge
        Pledge storage pl = pledges[contributor];
        if (pl.amount > pl.fulfilled) {
            uint128 reduction = amount < (pl.amount - pl.fulfilled) ? amount : (pl.amount - pl.fulfilled);
            pl.fulfilled += reduction;
        }

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Contribute, amount);
        emit Contributed(potId, contributor, amount, memoHash);
    }

    // ── Pledges ───────────────────────────────────────────────────────────────

    function pledge(uint128 amount, uint40 dueBy) external {
        if (amount == 0) revert AmountZero();
        if (block.timestamp >= dueBy) revert PledgeDuePassed();
        pledges[msg.sender] = Pledge({ amount: amount, dueBy: dueBy, fulfilled: 0 });
        emit Pledged(potId, msg.sender, amount, dueBy);
    }

    function pledgeOf(address addr) external view returns (uint128 amount, uint40 dueBy, uint128 fulfilled) {
        Pledge storage pl = pledges[addr];
        return (pl.amount, pl.dueBy, pl.fulfilled);
    }

    // ── Subscriptions (pull-payment pattern) ────────────────────────

    function subscribe(uint96 amountPerPull, uint32 interval, uint32 maxPulls) external returns (uint256 subId) {
        if (state != PotState.Active)     revert PotNotActive();
        if (amountPerPull == 0)           revert AmountZero();
        if (interval == 0)                revert AmountZero(); // reuse error; interval must be >0

        unchecked { subId = ++subCount; }

        subscriptions[subId] = Subscription({
            subscriber:    msg.sender,
            amountPerPull: amountPerPull,
            interval:      interval,
            maxPulls:      maxPulls,
            pullCount:     0,
            nextDue:       uint40(block.timestamp),
            active:        true
        });

        emit Subscribed(potId, subId, msg.sender, amountPerPull, interval);
    }

    /**
     * @notice Permissionless pull — anyone may call; soft-fails on balance/allowance.
     */
    function pull(uint256 subId) external nonReentrant {
        Subscription storage sub = subscriptions[subId];
        if (!sub.active)                         revert SubNotActive();
        if (block.timestamp < sub.nextDue)       revert PullTooEarly();
        if (state != PotState.Active)            { sub.active = false; return; }
        if (paused())                            return;
        if (block.timestamp > deadline)          { sub.active = false; return; }
        if (sub.maxPulls > 0 && sub.pullCount >= sub.maxPulls) {
            sub.active = false;
            return;
        }

        uint96 amount = sub.amountPerPull;
        address subscriber = sub.subscriber;

        // Soft-fail: insufficient allowance or balance → emit PullSkipped, no revert
        uint256 allowance = IERC20(usdc).allowance(subscriber, address(this));
        if (allowance < amount) {
            emit PullSkipped(subId, "insufficient allowance");
            sub.nextDue = uint40(block.timestamp + sub.interval);
            return;
        }
        uint256 bal = IERC20(usdc).balanceOf(subscriber);
        if (bal < amount) {
            emit PullSkipped(subId, "insufficient balance");
            sub.nextDue = uint40(block.timestamp + sub.interval);
            return;
        }

        // Checks-effects-interactions
        sub.pullCount += 1;
        sub.nextDue    = uint40(block.timestamp + sub.interval);
        if (sub.maxPulls > 0 && sub.pullCount >= sub.maxPulls) sub.active = false;

        contributed[subscriber]    += amount;
        totalContributed           += amount;
        totalUnrefundedContrib     += amount;

        IERC20(usdc).safeTransferFrom(subscriber, address(this), amount);

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Contribute, amount);
        emit Pulled(potId, subId, subscriber, amount);
    }

    function cancelSubscription(uint256 subId) external {
        Subscription storage sub = subscriptions[subId];
        if (sub.subscriber != msg.sender) revert NotContributor();
        sub.active = false;
        emit SubscriptionCancelled(potId, subId);
    }

    // ── Invoice submission ────────────────────────────────────────────────────

    function submitInvoice(
        uint8   payeeIdx,
        uint8   milestoneId,
        uint248 amount,
        bytes32 invoiceHash,
        bytes32 uri
    ) external returns (uint16 invoiceId) {
        if (msg.sender != organizer)           revert NotOrganizer();
        if (state != PotState.Active)          revert PotNotActive();
        if (payeeIdx >= payeeCount)            revert InvalidPayeeIdx();
        if (amount == 0)                       revert AmountZero();
        if (milestoneCount > 0) {
            if (milestoneId >= milestoneCount) revert InvalidMilestoneId();
            Milestone storage ms = milestones[milestoneId];
            if (ms.payeeIdx != payeeIdx)       revert InvalidPayeeIdx();
            if (ms.released + amount > ms.cap) revert AmountExceedsMilestoneCap();
        }
        // resolve payee — must still be verified if it's a registry payee
        _requirePayeeActive(payeeIdx);

        unchecked { invoiceId = ++invoiceCount; }

        invoices[invoiceId] = Invoice({
            payeeIdx:       payeeIdx,
            milestoneId:    milestoneId,
            status:         InvStatus.PendingApproval,
            amount:         amount,
            invoiceHash:    invoiceHash,
            uri:            uri,
            approvalBitmap: 0,
            resolveBitmap:  0,
            approvalCount:  0,
            disputeCount:   0,
            resolveCount:   0
        });

        emit InvoiceSubmitted(potId, invoiceId, payeeIdx, amount);
    }

    // ── Approvals (tx or EIP-712 sig via SignatureChecker) ────────────────────

    function approve(uint256 invoiceId) external {
        _doApprove(invoiceId, msg.sender);
    }

    /**
     * @notice Approve via EIP-712 signature (gasless; relayer pays).
     *         Compatible with ERC-1271 smart-account co-signers.
     */
    function approveWithSig(uint256 invoiceId, address coSigner, bytes calldata sig) external {
        uint256 nonce = approvalNonces[coSigner];
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(APPROVAL_TYPEHASH, potId, invoiceId, nonce))
        );
        // EIP-712 domain separator uses address(this); use custom DS for clones
        bytes32 cloneDigest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), keccak256(abi.encode(APPROVAL_TYPEHASH, potId, invoiceId, nonce))));
        bool valid = SignatureChecker.isValidSignatureNow(coSigner, cloneDigest, sig);
        if (!valid) revert NotCoSigner();

        approvalNonces[coSigner] += 1;
        _doApprove(invoiceId, coSigner);
    }

    function _doApprove(uint256 invoiceId, address signer) internal {
        Invoice storage inv = invoices[invoiceId];
        if (inv.status == InvStatus.None)     revert InvoiceNotPending();
        if (inv.status != InvStatus.PendingApproval) revert InvoiceNotPending();
        if (inv.status == InvStatus.Disputed) revert InvoiceDisputed();

        (bool isCS, uint8 idx) = _coSignerIndex(signer);
        if (!isCS && signer != organizer) revert NotCoSigner();

        uint128 bit = isCS ? uint128(1) << idx : uint128(1) << 127; // bit 127 = organizer
        if ((inv.approvalBitmap & bit) != 0) revert AlreadyApprovedThisInvoice();

        inv.approvalBitmap |= bit;
        inv.approvalCount  += 1;

        emit InvoiceApproved(potId, invoiceId, signer);

        if (inv.approvalCount >= threshold) {
            inv.status = InvStatus.Approved;
        }
    }

    // ── Release ───────────────────────────────────────────────────────────────

    function release(uint256 invoiceId) external nonReentrant {
        if (msg.sender != organizer) revert NotOrganizer();

        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvStatus.Approved) revert InvoiceNotApproved();

        // Re-validate registry payee at release time (may have been revoked since approval)
        _requirePayeeActive(inv.payeeIdx);

        uint256 amount = uint256(inv.amount);
        if (amount > uint256(totalContributed) - uint256(totalReleased) - uint256(totalRefunded))
            revert NothingToRefund(); // reuse; means "insufficient balance"

        inv.status = InvStatus.Released;

        // Update milestone
        if (milestoneCount > 0) {
            Milestone storage ms = milestones[inv.milestoneId];
            ms.released += uint128(amount);
            if (ms.released >= ms.cap) {
                ms.status = MilestoneStatus.Done;
                emit MilestoneCompleted(potId, inv.milestoneId);
            } else if (ms.released > 0) {
                ms.status = MilestoneStatus.Partial;
            }
        }

        totalReleased += uint128(amount);

        // apply protocol fee
        uint256 fee;
        uint16 feeBps = KoloFactory(factory).feeBps();
        if (feeBps > 0) {
            fee    = (amount * feeBps) / 10_000;
            amount -= fee;
            IERC20(usdc).safeTransfer(KoloFactory(factory).treasury(), fee);
        }

        address recipient = _resolvePayee(inv.payeeIdx);
        if (recipient == address(0)) revert ZeroAddress();

        uint256 registryPayeeId = payeeIds[inv.payeeIdx];

        IERC20(usdc).safeTransfer(recipient, amount);

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Release, uint128(amount + fee));

        if (registryPayeeId != 0) {
            PayeeRegistry(KoloFactory(factory).registry()).recordRelease(potId, registryPayeeId, amount);
        }

        emit Released(potId, invoiceId, registryPayeeId, amount);

        // Check if all milestones done or balance depleted → auto-close
        _checkClose();
    }

    function cancelInvoice(uint256 invoiceId) external {
        if (msg.sender != organizer) revert NotOrganizer();
        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvStatus.PendingApproval && inv.status != InvStatus.Disputed)
            revert InvoiceNotPending();
        inv.status = InvStatus.Cancelled;
        emit InvoiceCancelled(potId, invoiceId);
    }

    // ── Disputes ──────────────────────────────────────────────────────────────

    function flagInvoice(uint256 invoiceId, bytes32 reasonHash) external {
        if (contributed[msg.sender] == 0) revert NotContributor();
        // Only enforce cooldown after the first flag (lastFlagTime == 0 means never flagged)
        if (lastFlagTime[msg.sender] != 0 &&
            block.timestamp < uint256(lastFlagTime[msg.sender]) + DISPUTE_COOLDOWN)
            revert DisputeCooldown();

        Invoice storage inv = invoices[invoiceId];
        if (inv.status == InvStatus.None)       revert InvoiceNotPending();
        if (inv.status == InvStatus.Released)   revert InvoiceNotPending();
        if (inv.status == InvStatus.Disputed)   revert AlreadyFlagged();
        if (inv.status == InvStatus.Cancelled)  revert InvoiceNotPending();

        inv.status           = InvStatus.Disputed;
        inv.approvalBitmap   = 0;
        inv.resolveBitmap    = 0;
        inv.approvalCount    = 0;
        inv.disputeCount     = 0;
        inv.resolveCount     = 0;

        lastFlagTime[msg.sender] = uint40(block.timestamp);

        emit InvoiceFlagged(potId, invoiceId, msg.sender, reasonHash);
    }

    function resolve(uint256 invoiceId, bool uphold) external {
        (bool isCS, uint8 csIdx) = _coSignerIndex(msg.sender);
        if (!isCS && msg.sender != organizer) revert NotCoSigner();

        Invoice storage inv = invoices[invoiceId];
        if (inv.status != InvStatus.Disputed) revert InvoiceNotDisputed();

        // Prevent the same signer voting twice on the same dispute
        uint128 bit = isCS ? uint128(1) << csIdx : uint128(1) << 127; // bit127 = organizer
        if ((inv.resolveBitmap & bit) != 0) revert AlreadyVotedOnDispute();
        inv.resolveBitmap |= bit;

        uint8 total = coSignerCount + 1; // +1 for organizer
        uint8 th    = threshold;

        inv.resolveCount += 1;
        if (uphold) inv.disputeCount += 1;

        bool upholdReached  = inv.disputeCount >= th;
        bool rejectReached  = (inv.resolveCount - inv.disputeCount) >= th;

        if (upholdReached) {
            // dispute upheld → back to PendingApproval with fresh votes
            inv.status = InvStatus.PendingApproval;
            emit DisputeResolved(potId, invoiceId, true);
        } else if (rejectReached || inv.resolveCount >= total) {
            // dispute rejected → Cancelled
            inv.status = InvStatus.Cancelled;
            emit DisputeResolved(potId, invoiceId, false);
        }
    }

    // ── Deadline / refund management ──────────────────────────────────────────

    /**
     * @notice Transition to Refunding if deadline+grace has passed without full release,
     *         or if an unresolved dispute exists past deadline+grace.
     */
    function triggerRefunding() external {
        if (state != PotState.Active) revert PotNotActive();
        uint256 gracedDeadline = uint256(deadline) + GRACE_PERIOD;
        if (block.timestamp <= gracedDeadline) revert DeadlineNotPassed();

        // If there is any open Disputed invoice still unresolved, move to Refunding
        // (permissive: anyone can call after grace)
        state = PotState.Refunding;
        emit Refunding(potId);
    }

    function claimRefund() external nonReentrant {
        if (state == PotState.Active) {
            // leftover after all milestones released
            _requireLeftoverRefund();
        } else if (state != PotState.Refunding) {
            revert PotNotRefunding();
        }

        if (refundClaimed[msg.sender]) revert RefundAlreadyClaimed();
        uint128 contrib = contributed[msg.sender];
        if (contrib == 0) revert NothingToRefund();

        uint128 remaining = totalContributed - totalReleased - totalRefunded;
        if (remaining == 0) revert NothingToRefund();

        // pro-rata: share = contrib × remaining / totalUnrefundedContrib
        // totalUnrefundedContrib is the sum of contributed[] for all addresses that
        // have NOT yet claimed, so this claimant's share scales correctly regardless
        // of claim order.  The last claimant gets all remaining dust.
        uint128 denom = totalUnrefundedContrib;
        uint128 refund = (denom == contrib)
            ? remaining                                               // last claimant
            : uint128((uint256(contrib) * uint256(remaining)) / uint256(denom));

        refundClaimed[msg.sender]  = true;
        totalRefunded             += refund;
        totalUnrefundedContrib    -= contrib;

        IERC20(usdc).safeTransfer(msg.sender, refund);

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Refund, refund);
        emit Refunded(potId, msg.sender, refund);
    }

    // ── Guardian pause (never blocks refunds) ─────────────────────────────────

    function pause() external {
        if (msg.sender != organizer && !_isCoSigner(msg.sender)) revert NotOrganizer();
        _pause();
        emit Paused(potId);
    }

    function unpause() external {
        if (msg.sender != organizer && !_isCoSigner(msg.sender)) revert NotOrganizer();
        _unpause();
        emit Unpaused(potId);
    }

    // claimRefund is not gated by whenNotPaused → refunds always work

    // ── Views ─────────────────────────────────────────────────────────────────

    function potBalance() external view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }

    function leftover() public view returns (uint128) {
        if (totalContributed <= totalReleased + totalRefunded) return 0;
        return totalContributed - totalReleased - totalRefunded;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _resolvePayee(uint8 idx) internal view returns (address) {
        uint256 pid = payeeIds[idx];
        if (pid != 0) {
            PayeeRegistry reg = PayeeRegistry(KoloFactory(factory).registry());
            return reg.walletOf(pid);
        }
        return payeeAddresses[idx];
    }

    function _requirePayeeActive(uint8 idx) internal view {
        uint256 pid = payeeIds[idx];
        if (pid != 0) {
            PayeeRegistry reg = PayeeRegistry(KoloFactory(factory).registry());
            if (!reg.isVerified(pid)) revert PayeeRegistryRevoked();
        } else {
            if (payeeAddresses[idx] == address(0)) revert ZeroAddress();
        }
    }

    function _coSignerIndex(address signer) internal view returns (bool found, uint8 idx) {
        for (uint8 i; i < coSignerCount; ++i) {
            if (coSigners[i] == signer) return (true, i);
        }
        return (false, 0);
    }

    function _isCoSigner(address signer) internal view returns (bool) {
        (bool found,) = _coSignerIndex(signer);
        return found;
    }

    /// @dev Called from claimRefund when state==Active: reverts since organizer must explicitly close.
    function _requireLeftoverRefund() internal pure {
        // Leftover refunds require explicit organizer close() or triggerRefunding().
        // Contributors should not be able to pull leftover without organizer consent while pot is Active.
        revert PotNotRefunding();
    }

    /**
     * @notice Organizer closes the pot early (e.g. after final release), allowing leftover refunds.
     *         When threshold == 1, organizer closes unilaterally.
     *         When threshold > 1, co-signers must approve via approveClose().
     */
    function close() external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (state != PotState.Active) revert PotNotActive();

        uint128 orgBit = uint128(1) << 127;
        if ((closeApprovalBitmap & orgBit) == 0) {
            closeApprovalBitmap |= orgBit;
            closeApprovalCount  += 1;
        }

        if (closeApprovalCount >= threshold) {
            state = PotState.Refunding;
            emit Closed(potId);
            emit Refunding(potId);
        }
    }

    /**
     * @notice Co-signer approves an organizer-initiated close.
     */
    function approveClose() external {
        if (state != PotState.Active) revert PotNotActive();
        if ((closeApprovalBitmap & (uint128(1) << 127)) == 0) revert NotOrganizer();

        (bool isCS, uint8 idx) = _coSignerIndex(msg.sender);
        if (!isCS) revert NotCoSigner();

        uint128 bit = uint128(1) << idx;
        if ((closeApprovalBitmap & bit) != 0) return; // idempotent
        closeApprovalBitmap |= bit;
        closeApprovalCount  += 1;

        if (closeApprovalCount >= threshold) {
            state = PotState.Refunding;
            emit Closed(potId);
            emit Refunding(potId);
        }
    }

    function _checkClose() internal {
        // Transition to Refunding when all milestones are Done so leftover can be claimed.
        // For pots with no milestones, the organizer must call close() explicitly.
        if (milestoneCount == 0) return;
        bool allDone = true;
        for (uint8 i; i < milestoneCount; ++i) {
            if (milestones[i].status != MilestoneStatus.Done) { allDone = false; break; }
        }
        if (allDone) {
            state = PotState.Refunding; // leftover → claimRefund
            emit Refunding(potId);
        }
    }

    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
    }
}
