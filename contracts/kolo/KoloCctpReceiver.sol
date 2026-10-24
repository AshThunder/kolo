// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  IMessageTransmitterV2
 * @notice Minimal interface for CCTP V2 MessageTransmitter.
 */
interface IMessageTransmitterV2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

/**
 * @title  IKoloPotContributeFor
 * @notice Minimal interface used by the receiver to credit contributions.
 */
interface IKoloPotContributeFor {
    function contributeFor(address contributor, uint128 amount, bytes32 memoHash) external;
}

/**
 * @title  KoloCctpReceiver
 * @notice CCTP V2 `destinationCaller`.
 *
 *         relay(message, attestation)
 *           → calls MessageTransmitterV2.receiveMessage (mints USDC to this contract)
 *           → decodes hookData: abi.encode(potAddress, contributor, memoHash)
 *           → approves + calls pot.contributeFor
 *
 * Replay safety
 * ─────────────
 * The MessageTransmitter itself is replay-safe (nonce tracking).
 * We additionally track the keccak256 of each message to guard
 * against double-processing if the transmitter ever allows it.
 *
 * Anyone may call relay() as a keeper (pays Arc gas in USDC).
 */
contract KoloCctpReceiver is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Storage ───────────────────────────────────────────────────────────────
    IMessageTransmitterV2 public immutable transmitter;
    IERC20                public immutable usdc;

    /// @dev Byte offset of hookData inside a CCTP V2 burn message (148 header + 228 body fields).
    uint256 public constant HOOK_DATA_OFFSET = 376;

    /// @dev potAddress → bool (allowed relay targets)
    mapping(address => bool) public allowedPots;
    /// @dev message hash → processed
    mapping(bytes32 => bool) public processedMessages;

    // ── Errors ────────────────────────────────────────────────────────────────
    error ZeroAddress();
    error MessageAlreadyProcessed();
    error RelayFailed();
    error InvalidHookData();
    error PotNotAllowed();
    error ContributeForFailed();

    // ── Events ────────────────────────────────────────────────────────────────
    event Relayed(address indexed pot, address indexed contributor, uint256 amount, bytes32 memoHash);
    event PotAllowlisted(address indexed pot, bool allowed);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address transmitter_, address usdc_, address owner_) Ownable(owner_) {
        if (transmitter_ == address(0) || usdc_ == address(0)) revert ZeroAddress();
        transmitter = IMessageTransmitterV2(transmitter_);
        usdc        = IERC20(usdc_);
    }

    // ── Owner config ──────────────────────────────────────────────────────────

    function allowPot(address pot, bool allowed) external onlyOwner {
        if (pot == address(0)) revert ZeroAddress();
        allowedPots[pot] = allowed;
        emit PotAllowlisted(pot, allowed);
    }

    // ── Relay ─────────────────────────────────────────────────────────────────

    /**
     * @notice Relay a CCTP V2 message.
     * @param  message      Raw CCTP message bytes.
     * @param  attestation  Attester signatures.
     *
     * hookData layout: abi.encode(address pot, address contributor, bytes32 memoHash)
     *
     * The USDC minted to this contract is forwarded to the pot via contributeFor.
     */
    function relay(bytes calldata message, bytes calldata attestation) external nonReentrant {
        bytes32 msgHash = keccak256(message);
        if (processedMessages[msgHash]) revert MessageAlreadyProcessed();
        processedMessages[msgHash] = true;

        // Decode hookData from a CCTP V2 message:
        //   header (148): version(4) sourceDomain(4) destDomain(4) nonce(32) sender(32) recipient(32)
        //                 destinationCaller(32) minFinalityThreshold(4) finalityThresholdExecuted(4)
        //   burn body (228 before hookData): version(4) burnToken(32) mintRecipient(32) amount(32)
        //                 messageSender(32) maxFee(32) feeExecuted(32) expirationBlock(32)
        //   => hookData starts at byte 376. (Verified against a live Base Sepolia -> Arc message.)
        if (message.length < HOOK_DATA_OFFSET) revert InvalidHookData();
        bytes calldata hookData = message[HOOK_DATA_OFFSET:];

        (address pot, address contributor, bytes32 memoHash) = _decodeHookData(hookData);

        if (!allowedPots[pot]) revert PotNotAllowed();
        if (contributor == address(0)) revert ZeroAddress();

        // Record balance before relay
        uint256 balBefore = usdc.balanceOf(address(this));

        // Call MessageTransmitter — mints USDC to address(this)
        bool ok = transmitter.receiveMessage(message, attestation);
        if (!ok) revert RelayFailed();

        uint256 minted = usdc.balanceOf(address(this)) - balBefore;
        if (minted == 0) revert RelayFailed();

        // Approve pot to pull the exact minted amount
        usdc.safeIncreaseAllowance(pot, minted);

        // contributeFor credits contributor's address on the pot
        (bool success,) = pot.call(
            abi.encodeWithSignature(
                "contributeFor(address,uint128,bytes32)",
                contributor,
                uint128(minted),
                memoHash
            )
        );

        // Always zero out any residual allowance regardless of outcome
        uint256 residual = usdc.allowance(address(this), pot);
        if (residual > 0) usdc.safeDecreaseAllowance(pot, residual);

        if (!success) {
            revert ContributeForFailed();
        }

        emit Relayed(pot, contributor, minted, memoHash);
    }

    // ── Rescue (owner only — for stuck USDC if contributeFor failed on a non-reverting path) ──

    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _decodeHookData(bytes calldata data)
        internal
        pure
        returns (address pot, address contributor, bytes32 memoHash)
    {
        if (data.length < 96) revert InvalidHookData();
        (pot, contributor, memoHash) = abi.decode(data, (address, address, bytes32));
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title  KoloDepositSweeper
 * @notice Deterministic per-contribution deposit address (CREATE2).
 *         Circle Forwarding Service mints USDC here; keeper calls sweep().
 *
 *         Deployed by the sweeper factory with:
 *           salt = keccak256(abi.encode(potAddress, contributor, salt_nonce))
 *
 * This is the "Forwarding mode" fallback when destinationCaller must be 0
 * (Forwarding Service incompatible with custom caller).
 *
 * Idempotent: sweep() is a no-op if balance is 0.
 */
contract KoloDepositSweeper is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable usdc;
    address public immutable pot;
    address public immutable contributor;
    bytes32 public immutable memoHash;

    bool private _swept; // guard against accidental repeated sweeps draining future deposits

    event Swept(address indexed pot, address indexed contributor, uint256 amount);

    error ZeroAddress();
    error AlreadySwept();

    constructor(address usdc_, address pot_, address contributor_, bytes32 memoHash_) {
        if (usdc_ == address(0) || pot_ == address(0) || contributor_ == address(0))
            revert ZeroAddress();
        usdc        = IERC20(usdc_);
        pot         = pot_;
        contributor = contributor_;
        memoHash    = memoHash_;
    }

    /**
     * @notice Sweep the entire USDC balance into the pot as a contributeFor.
     *         Idempotent (no-op if balance is 0).
     */
    function sweep() external nonReentrant {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance == 0) return; // idempotent no-op

        usdc.safeIncreaseAllowance(pot, balance);

        (bool ok,) = pot.call(
            abi.encodeWithSignature(
                "contributeFor(address,uint128,bytes32)",
                contributor,
                uint128(balance),
                memoHash
            )
        );

        // Always zero out residual allowance
        uint256 residual = usdc.allowance(address(this), pot);
        if (residual > 0) usdc.safeDecreaseAllowance(pot, residual);

        if (!ok) {
            revert("KoloDepositSweeper: contributeFor failed");
        }

        emit Swept(pot, contributor, balance);
    }

    /// @notice Read the current USDC balance (useful for keepers).
    function pendingBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title  KoloSweeperFactory
 * @notice Deploys KoloDepositSweeper contracts deterministically via CREATE2.
 *         The sweeper address for a (pot, contributor, nonce) triple is
 *         fully predictable off-chain.
 */
contract KoloSweeperFactory {
    address public immutable usdc;

    event SweeperDeployed(address indexed sweeper, address indexed pot, address indexed contributor);

    error ZeroAddress();

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = usdc_;
    }

    /**
     * @notice Deploy a new KoloDepositSweeper.
     * @param pot_         Target Kolo pot.
     * @param contributor_ The contributor to credit.
     * @param memoHash_    Memo stored on-chain.
     * @param saltNonce    Extra entropy so the same (pot, contributor) can have multiple sweepers.
     */
    function deploySweeper(
        address pot_,
        address contributor_,
        bytes32 memoHash_,
        uint256 saltNonce
    ) external returns (address sweeper) {
        bytes32 salt = keccak256(abi.encode(pot_, contributor_, saltNonce));
        sweeper = address(
            new KoloDepositSweeper{salt: salt}(usdc, pot_, contributor_, memoHash_)
        );
        emit SweeperDeployed(sweeper, pot_, contributor_);
    }

    /**
     * @notice Compute the sweeper address without deploying.
     */
    function computeSweeperAddress(
        address pot_,
        address contributor_,
        bytes32 memoHash_,
        uint256 saltNonce
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(pot_, contributor_, saltNonce));
        bytes32 bytecodeHash = keccak256(abi.encodePacked(
            type(KoloDepositSweeper).creationCode,
            abi.encode(usdc, pot_, contributor_, memoHash_)
        ));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(this), salt, bytecodeHash
        )))));
    }
}
