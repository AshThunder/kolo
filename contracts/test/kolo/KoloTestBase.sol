// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PayeeRegistry} from "../../kolo/PayeeRegistry.sol";
import {KoloFactory} from "../../kolo/KoloFactory.sol";
import {KoloGroupPot} from "../../kolo/KoloGroupPot.sol";
import {KoloTuitionPot} from "../../kolo/KoloTuitionPot.sol";

/// @dev Minimal ERC-20 mock for testing.
contract MockUSDC {
    string  public name     = "USD Coin";
    string  public symbol   = "USDC";
    uint8   public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply   += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount,      "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 delta) external returns (bool) {
        allowance[msg.sender][spender] += delta;
        return true;
    }

    function decreaseAllowance(address spender, uint256 delta) external returns (bool) {
        allowance[msg.sender][spender] -= delta;
        return true;
    }
}

/// @dev Malicious re-entrant token that tries to re-enter claimRefund on transfer.
contract MaliciousUSDC is MockUSDC {
    address public target;
    bool    public armed;

    function arm(address _target) external { target = _target; armed = true; }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (armed && target != address(0)) {
            armed = false; // prevent infinite recursion
            // attempt re-entry
            (bool ok,) = target.call(abi.encodeWithSignature("claimRefund()"));
            ok; // ignore
        }
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}

/// @dev Mock ERC-1271 smart account (always returns valid signature magic value).
contract MockERC1271 {
    bytes4 constant MAGIC = 0x1626ba7e;
    function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) {
        return MAGIC;
    }
}

/// @dev Base test contract with helpers shared across all Kolo test files.
abstract contract KoloTestBase is Test {
    MockUSDC        internal usdc;
    PayeeRegistry   internal registry;
    KoloFactory     internal factory;
    KoloGroupPot    internal groupImpl;
    KoloTuitionPot  internal tuitionImpl;

    address internal admin    = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal carol    = makeAddr("carol");
    address internal dave     = makeAddr("dave");

    uint256 constant USDC_1   = 1e6;
    uint256 constant USDC_100 = 100e6;

    function _setUp() internal {
        usdc     = new MockUSDC();
        registry = new PayeeRegistry(admin);
        factory  = new KoloFactory(address(usdc), address(registry), treasury, admin);

        groupImpl   = new KoloGroupPot();
        tuitionImpl = new KoloTuitionPot();

        vm.startPrank(admin);
        factory.setGroupPotImpl(address(groupImpl));
        factory.setTuitionPotImpl(address(tuitionImpl));
        vm.stopPrank();

        // Mint USDC to test accounts
        usdc.mint(alice,  10_000 * USDC_1);
        usdc.mint(bob,    10_000 * USDC_1);
        usdc.mint(carol,  10_000 * USDC_1);
        usdc.mint(dave,   10_000 * USDC_1);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _registerAndVerifySchool(address wallet) internal returns (uint256 id) {
        vm.startPrank(admin);
        id = registry.registerPayee(
            PayeeRegistry.Kind.School,
            wallet,
            keccak256("Test School"),
            keccak256("doc")
        );
        registry.verify(id, keccak256("doc"));
        vm.stopPrank();
    }

    function _registerAndVerifyVendor(address wallet) internal returns (uint256 id) {
        vm.startPrank(admin);
        id = registry.registerPayee(
            PayeeRegistry.Kind.Vendor,
            wallet,
            keccak256("Test Vendor"),
            keccak256("doc")
        );
        registry.verify(id, keccak256("doc"));
        vm.stopPrank();
    }

    function _createGroupPot(
        address organizer,
        address[] memory payeeAddrs,
        uint256[] memory payeeIds_,
        uint128 target,
        uint40  deadline,
        uint8   threshold,
        address[] memory coSigners,
        bytes32[] memory mlLabels,
        uint8[]   memory mlPayeeIdxs,
        uint128[] memory mlCaps
    ) internal returns (uint256 potId, KoloGroupPot pot) {
        bytes memory params = abi.encode(
            organizer,
            address(usdc),
            address(factory),
            uint256(0),          // potId overwritten by factory
            bytes32(0),          // titleHash
            target,
            uint96(0),           // minContribution
            deadline,
            true,                // allowOverfund
            threshold,
            coSigners,
            payeeIds_,
            payeeAddrs,
            mlLabels,
            mlPayeeIdxs,
            mlCaps
        );

        vm.prank(organizer);
        address potAddr;
        (potId, potAddr) = factory.createGroupPot(params);
        pot = KoloGroupPot(potAddr);

        // Overwrite potId in the clone (factory passes potId inside params,
        // but the first deploy gets potId=1 per the counter)
        // Factory injects potId by re-encoding; for tests we re-create with real potId.
        // (Simpler: just trust the factory counter; reassign local.)
        potId = factory.potCount();
    }

    function _createSimpleGroupPot(
        address organizer,
        address payeeAddr,
        uint128 target,
        uint40  deadline
    ) internal returns (uint256 potId, KoloGroupPot pot) {
        address[] memory payeeAddrs  = new address[](1);
        payeeAddrs[0] = payeeAddr;
        uint256[] memory payeeIds_   = new uint256[](1);
        payeeIds_[0] = 0; // raw address
        address[] memory coSigners   = new address[](0);
        bytes32[] memory mlLabels    = new bytes32[](0);
        uint8[]   memory mlIdxs      = new uint8[](0);
        uint128[] memory mlCaps      = new uint128[](0);

        return _createGroupPot(organizer, payeeAddrs, payeeIds_, target, deadline, 1, coSigners, mlLabels, mlIdxs, mlCaps);
    }

    function _createTuitionPot(
        address organizer,
        uint256 schoolPayeeId,
        uint40  deadline,
        uint8   threshold,
        address[] memory coSigners,
        uint40[]  memory dueDates,
        uint128[] memory amounts
    ) internal returns (uint256 potId, KoloTuitionPot pot) {
        bytes memory params = abi.encode(
            organizer,
            address(usdc),
            address(factory),
            uint256(0),
            bytes32(0),
            uint96(0),
            deadline,
            true,
            schoolPayeeId,
            threshold,
            coSigners,
            dueDates,
            amounts
        );

        vm.prank(organizer);
        address potAddr;
        (potId, potAddr) = factory.createTuitionPot(params);
        pot = KoloTuitionPot(potAddr);
        potId = factory.potCount();
    }

    function _approveAndContribute(address contributor, address pot, uint128 amount) internal {
        vm.startPrank(contributor);
        usdc.approve(pot, amount);
        KoloGroupPot(pot).contribute(amount, bytes32(0));
        vm.stopPrank();
    }

    function _approveAndContributeTuition(address contributor, address pot, uint128 amount) internal {
        vm.startPrank(contributor);
        usdc.approve(pot, amount);
        KoloTuitionPot(pot).contribute(amount, bytes32(0));
        vm.stopPrank();
    }
}
