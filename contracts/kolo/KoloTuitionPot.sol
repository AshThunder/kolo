// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {KoloFactory} from "./KoloFactory.sol";
import {PayeeRegistry} from "./PayeeRegistry.sol";

/**
 * @title  KoloTuitionPot
 * @notice EIP-1167 clone.  Pays tuition terms to a verified School wallet.
 *
 * Flow
 * ────
 * 1.  Contributors fund the pot.
 * 2.  `payTerm(i)` is permissionless; callable once `block.timestamp ≥ terms[i].dueDate - window`
 *     and `balance ≥ terms[i].amount`.
 * 3.  If school is revoked → pot pauses; contributors claimRefund() pro-rata.
 * 4.  After last term or organizer+co-sign `close()` → state Refunding; leftover pro-rata.
 *
 * Approved additions
 * ─────────────────
 * • pledge / pledgeOf
 * • subscribe / pull / cancelSubscription
 * • Global stats hook to factory
 * • Every money event indexed
 */
contract KoloTuitionPot is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 public constant MAX_TERMS         = 12;
    uint256 public constant GRACE_PERIOD      = 3 days;
    uint256 public constant PAY_WINDOW        = 3 days; // payable window before dueDate

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum PotState  { Active, Refunding, Closed }
    enum TermStatus { Pending, Paid }

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Term {
        uint40     dueDate;
        uint128    amount;
        TermStatus status;
        bytes32    invoiceHash; // optional: set by school off-chain, not enforced
    }

    struct Subscription {
        address subscriber;
        uint96  amountPerPull;
        uint32  interval;
        uint32  maxPulls;
        uint32  pullCount;
        uint40  nextDue;
        bool    active;
    }

    struct Pledge {
        uint128 amount;
        uint40  dueBy;
        uint128 fulfilled;
    }

    // ── Immutable-like ────────────────────────────────────────────────────────
    address  public factory;
    address  public usdc;

    uint256  public potId;
    address  public organizer;
    bytes32  public titleHash;
    uint96   public minContribution;
    uint40   public deadline;
    bool     public allowOverfund;
    uint256  public payeeId;      // must be a verified School in registry
    uint8    public threshold;
    uint8    public coSignerCount;
    address[10] public coSigners;

    uint8    public termCount;
    Term[12] public terms;

    // ── Mutable state ─────────────────────────────────────────────────────────
    PotState public state;
    bool     private _initialized;

    uint128  public totalContributed;
    uint128  public totalReleased;
    uint128  public totalRefunded;
    /// @dev Sum of contributed[] for addresses that have NOT yet claimed a refund.
    uint128  public totalUnrefundedContrib;

    mapping(address => uint128) public contributed;
    mapping(address => bool)    public refundClaimed;

    uint256  public subCount;
    mapping(uint256 => Subscription) public subscriptions;
    mapping(address => Pledge)       public pledges;

    // ── Errors ────────────────────────────────────────────────────────────────
    error AlreadyInitialized();
    error ZeroAddress();
    error NotOrganizer();
    error NotCoSigner();
    error PotNotActive();
    error PotNotRefunding();
    error BelowMinContribution();
    error DeadlinePassed();
    error AmountZero();
    error TermAlreadyPaid();
    error TermNotDue();
    error InsufficientBalance();
    error SchoolRevoked();
    error RefundAlreadyClaimed();
    error NothingToRefund();
    error InvalidTerms();
    error SubNotActive();
    error PullTooEarly();
    error ArrayLengthMismatch();
    error TooManyTerms();
    error TooManyCoSigners();
    error NotVerifiedSchool();
    error NotEnoughCoSigns();
    error PledgeDuePassed();
    error OverfundNotAllowed();

    // ── Events ────────────────────────────────────────────────────────────────
    event Contributed(uint256 indexed potId, address indexed contributor, uint256 amount, bytes32 memoHash);
    event TermPaid(uint256 indexed potId, uint8 indexed termIndex, address indexed school, uint256 amount);
    event Refunding(uint256 indexed potId, string reason);
    event Refunded(uint256 indexed potId, address indexed contributor, uint256 amount);
    event Closed(uint256 indexed potId);
    event Pledged(uint256 indexed potId, address indexed pledger, uint256 amount, uint256 dueBy);
    event Subscribed(uint256 indexed potId, uint256 indexed subId, address subscriber, uint96 amountPerPull, uint32 interval);
    event Pulled(uint256 indexed potId, uint256 indexed subId, address indexed subscriber, uint256 amount);
    event PullSkipped(uint256 indexed subId, string reason);
    event SubscriptionCancelled(uint256 indexed potId, uint256 indexed subId);

    // ── Initializer ───────────────────────────────────────────────────────────

    /**
     * @param params ABI-encoded (
     *   address organizer, address usdc, address factory,
     *   uint256 potId, bytes32 titleHash,
     *   uint96 minContribution, uint40 deadline, bool allowOverfund,
     *   uint256 payeeId,
     *   uint8 threshold, address[] coSigners,
     *   uint40[] termDueDates, uint128[] termAmounts
     * )
     */
    function initialize(bytes calldata params) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        (
            address _organizer,
            address _usdc,
            address _factory,
            uint256 _potId,
            bytes32 _titleHash,
            uint96  _minContrib,
            uint40  _deadline,
            bool    _allowOverfund,
            uint256 _payeeId,
            uint8   _threshold,
            address[] memory _coSigners,
            uint40[]  memory _dueDates,
            uint128[] memory _amounts
        ) = abi.decode(params, (
            address, address, address, uint256, bytes32,
            uint96, uint40, bool, uint256, uint8,
            address[], uint40[], uint128[]
        ));

        if (_organizer == address(0) || _usdc == address(0) || _factory == address(0))
            revert ZeroAddress();
        if (_dueDates.length == 0 || _dueDates.length > MAX_TERMS)  revert TooManyTerms();
        if (_dueDates.length != _amounts.length)                     revert ArrayLengthMismatch();
        if (_coSigners.length > 10)                                  revert TooManyCoSigners();

        // Verify payee is a School
        PayeeRegistry reg = PayeeRegistry(KoloFactory(_factory).registry());
        if (!reg.isVerified(_payeeId))                          revert NotVerifiedSchool();
        if (reg.kindOf(_payeeId) != PayeeRegistry.Kind.School) revert NotVerifiedSchool();

        organizer       = _organizer;
        usdc            = _usdc;
        factory         = _factory;
        potId           = _potId;
        titleHash       = _titleHash;
        minContribution = _minContrib;
        deadline        = _deadline;
        allowOverfund   = _allowOverfund;
        payeeId         = _payeeId;
        threshold       = _threshold == 0 ? 1 : _threshold;
        coSignerCount   = uint8(_coSigners.length);

        for (uint256 i; i < _coSigners.length; ++i) coSigners[i] = _coSigners[i];

        termCount = uint8(_dueDates.length);
        for (uint256 i; i < _dueDates.length; ++i) {
            terms[i] = Term({ dueDate: _dueDates[i], amount: _amounts[i], status: TermStatus.Pending, invoiceHash: bytes32(0) });
        }
    }

    // ── Trust-anchor enforcement (called by factory after initialize) ─────────

    bool private _canonicalsSet;

    function setCanonicals(address _usdc, address _factory, uint256 _potId) external {
        if (_canonicalsSet)        revert AlreadyInitialized();
        if (msg.sender != factory) revert NotOrganizer();
        _canonicalsSet = true;
        usdc    = _usdc;
        factory = _factory;
        potId   = _potId;
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
        _requireSchoolVerified();
        if (state != PotState.Active)    revert PotNotActive();
        if (paused())                    revert EnforcedPause();
        if (block.timestamp > deadline)  revert DeadlinePassed();
        if (amount < minContribution)    revert BelowMinContribution();

        uint128 newTotal = totalContributed + amount;
        if (!allowOverfund) {
            uint128 needed = _remainingNeeded();
            if (needed > 0 && newTotal > needed) revert OverfundNotAllowed();
        }

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        contributed[contributor]  += amount;
        totalContributed           = newTotal;
        totalUnrefundedContrib    += amount;

        Pledge storage pl = pledges[contributor];
        if (pl.amount > pl.fulfilled) {
            uint128 r = amount < (pl.amount - pl.fulfilled) ? amount : (pl.amount - pl.fulfilled);
            pl.fulfilled += r;
        }

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Contribute, amount);
        emit Contributed(potId, contributor, amount, memoHash);
    }

    // ── Term payment ──────────────────────────────────────────────────────────

    /**
     * @notice Pay term `i`.  Permissionless once within the pay window.
     *         Resolves the school's current wallet from the registry.
     */
    function payTerm(uint8 i) external nonReentrant whenNotPaused {
        _requireSchoolVerified();
        if (state != PotState.Active) revert PotNotActive();
        if (i >= termCount)           revert InvalidTerms();

        Term storage t = terms[i];
        if (t.status == TermStatus.Paid) revert TermAlreadyPaid();

        uint256 windowStart = uint256(t.dueDate) - PAY_WINDOW;
        if (block.timestamp < windowStart) revert TermNotDue();

        uint256 available = uint256(totalContributed) - uint256(totalReleased) - uint256(totalRefunded);
        if (available < uint256(t.amount)) revert InsufficientBalance();

        t.status = TermStatus.Paid;
        totalReleased += t.amount;

        uint256 amount = uint256(t.amount);
        uint256 fee;
        uint16 feeBps = KoloFactory(factory).feeBps();
        if (feeBps > 0) {
            fee    = (amount * feeBps) / 10_000;
            amount -= fee;
            IERC20(usdc).safeTransfer(KoloFactory(factory).treasury(), fee);
        }

        address school = PayeeRegistry(KoloFactory(factory).registry()).walletOf(payeeId);
        if (school == address(0)) revert ZeroAddress();

        IERC20(usdc).safeTransfer(school, amount);

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Release, uint256(t.amount));

        PayeeRegistry(KoloFactory(factory).registry()).recordRelease(potId, payeeId, amount);
        emit TermPaid(potId, i, school, amount);

        // check if last term paid
        _checkAllTermsPaid();
    }

    // ── Close / refund ────────────────────────────────────────────────────────

    /// @dev Tracks co-sign approvals for early close.  bit i = coSigners[i] approved;
    ///      bit 127 = organizer.  Reset to 0 whenever close is not yet complete.
    uint128 public closeApprovalBitmap;
    uint8   public closeApprovalCount;

    error NotEnoughCloseApprovals();

    /**
     * @notice Organizer + co-signer threshold to close early.
     *         The organizer always must call this to express intent.
     *         When threshold == 1 the organizer's call is sufficient.
     *         When threshold > 1, each required co-signer also calls approveClose().
     *         After close, contributors claim leftover pro-rata.
     */
    function close(bytes calldata /* reserved */) external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (state != PotState.Active) revert PotNotActive();

        // Mark organizer approval (bit 127)
        uint128 orgBit = uint128(1) << 127;
        if ((closeApprovalBitmap & orgBit) == 0) {
            closeApprovalBitmap |= orgBit;
            closeApprovalCount  += 1;
        }

        if (closeApprovalCount >= threshold) {
            _doClose();
        }
        // If threshold > 1, organizer's intent is recorded; co-signers must now call approveClose()
    }

    /**
     * @notice Co-signer approves an early close that the organizer has already initiated.
     */
    function approveClose() external {
        if (state != PotState.Active) revert PotNotActive();
        if ((closeApprovalBitmap & (uint128(1) << 127)) == 0) revert NotOrganizer(); // organizer must go first

        (bool isCS, uint8 idx) = _coSignerIndex(msg.sender);
        if (!isCS) revert NotCoSigner();

        uint128 bit = uint128(1) << idx;
        if ((closeApprovalBitmap & bit) != 0) return; // idempotent
        closeApprovalBitmap |= bit;
        closeApprovalCount  += 1;

        if (closeApprovalCount >= threshold) {
            _doClose();
        }
    }

    function _doClose() internal {
        state = PotState.Refunding;
        emit Closed(potId);
        emit Refunding(potId, "organizer closed");
    }

    function claimRefund() external nonReentrant {
        // Pause never blocks refunds
        if (state != PotState.Refunding) revert PotNotRefunding();
        if (refundClaimed[msg.sender])   revert RefundAlreadyClaimed();

        uint128 contrib = contributed[msg.sender];
        if (contrib == 0) revert NothingToRefund();

        uint128 remaining = totalContributed - totalReleased - totalRefunded;
        if (remaining == 0) revert NothingToRefund();

        uint128 denom  = totalUnrefundedContrib;
        uint128 refund = (denom == contrib)
            ? remaining
            : uint128((uint256(contrib) * uint256(remaining)) / uint256(denom));

        refundClaimed[msg.sender]  = true;
        totalRefunded             += refund;
        totalUnrefundedContrib    -= contrib;

        IERC20(usdc).safeTransfer(msg.sender, refund);

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Refund, refund);
        emit Refunded(potId, msg.sender, refund);
    }

    // ── School-revocation handler ─────────────────────────────────────────────

    /**
     * @notice Anyone may call this if the school has been revoked.
     *         Pauses the pot and moves to Refunding so contributors can exit.
     */
    function handleRevocation() external {
        if (state != PotState.Active) return;
        PayeeRegistry reg = PayeeRegistry(KoloFactory(factory).registry());
        if (reg.isVerified(payeeId)) revert NotVerifiedSchool(); // still verified — no action
        // school revoked — pause if not already paused
        if (!paused()) _pause();
        state = PotState.Refunding;
        emit Refunding(potId, "school revoked");
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

    // ── Subscriptions ─────────────────────────────────────────────────────────

    function subscribe(uint96 amountPerPull, uint32 interval, uint32 maxPulls) external returns (uint256 subId) {
        if (state != PotState.Active) revert PotNotActive();
        if (amountPerPull == 0)       revert AmountZero();
        if (interval == 0)            revert AmountZero();
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

    function pull(uint256 subId) external nonReentrant {
        Subscription storage sub = subscriptions[subId];
        if (!sub.active)                   revert SubNotActive();
        if (block.timestamp < sub.nextDue) revert PullTooEarly();
        if (state != PotState.Active)      { sub.active = false; return; }
        if (block.timestamp > deadline)    { sub.active = false; return; }
        if (sub.maxPulls > 0 && sub.pullCount >= sub.maxPulls) { sub.active = false; return; }

        uint96    amount     = sub.amountPerPull;
        address   subscriber = sub.subscriber;

        uint256 allowance = IERC20(usdc).allowance(subscriber, address(this));
        if (allowance < amount) { emit PullSkipped(subId, "insufficient allowance"); sub.nextDue = uint40(block.timestamp + sub.interval); return; }
        uint256 bal = IERC20(usdc).balanceOf(subscriber);
        if (bal < amount)       { emit PullSkipped(subId, "insufficient balance");   sub.nextDue = uint40(block.timestamp + sub.interval); return; }

        sub.pullCount += 1;
        sub.nextDue    = uint40(block.timestamp + sub.interval);
        if (sub.maxPulls > 0 && sub.pullCount >= sub.maxPulls) sub.active = false;

        contributed[subscriber]   += amount;
        totalContributed          += amount;
        totalUnrefundedContrib    += amount;

        IERC20(usdc).safeTransferFrom(subscriber, address(this), amount);

        KoloFactory(factory).recordMove(KoloFactory.MoveKind.Contribute, amount);
        emit Pulled(potId, subId, subscriber, amount);
    }

    function cancelSubscription(uint256 subId) external {
        Subscription storage sub = subscriptions[subId];
        if (sub.subscriber != msg.sender) revert NotCoSigner();
        sub.active = false;
        emit SubscriptionCancelled(potId, subId);
    }

    // ── Guardian pause ────────────────────────────────────────────────────────

    function pause() external {
        if (msg.sender != organizer && !_isCoSigner(msg.sender)) revert NotOrganizer();
        _pause();
    }

    function unpause() external {
        if (msg.sender != organizer && !_isCoSigner(msg.sender)) revert NotOrganizer();
        _unpause();
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function potBalance() external view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }

    function leftover() public view returns (uint128) {
        if (totalContributed <= totalReleased + totalRefunded) return 0;
        return totalContributed - totalReleased - totalRefunded;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _requireSchoolVerified() internal view {
        PayeeRegistry reg = PayeeRegistry(KoloFactory(factory).registry());
        if (!reg.isVerified(payeeId)) revert SchoolRevoked();
    }

    function _remainingNeeded() internal view returns (uint128) {
        uint128 total;
        for (uint8 i; i < termCount; ++i) {
            if (terms[i].status == TermStatus.Pending) total += terms[i].amount;
        }
        return total;
    }

    function _checkAllTermsPaid() internal {
        for (uint8 i; i < termCount; ++i) {
            if (terms[i].status == TermStatus.Pending) return;
        }
        // All terms paid → leftover refund
        state = PotState.Refunding;
        emit Refunding(potId, "all terms paid");
    }

    function _coSignerIndex(address s) internal view returns (bool found, uint8 idx) {
        for (uint8 i; i < coSignerCount; ++i) {
            if (coSigners[i] == s) return (true, i);
        }
        return (false, 0);
    }

    function _isCoSigner(address s) internal view returns (bool) {
        (bool f,) = _coSignerIndex(s);
        return f;
    }
}
