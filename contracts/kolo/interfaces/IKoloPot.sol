// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface every Kolo pot clone must implement.
interface IKoloPot {
    /// @dev Called by the factory after cloning so the clone can initialise.
    function initialize(bytes calldata params) external;

    /// @dev Called by the pot on every money move to update factory global stats.
    ///      factory validates msg.sender is a registered clone before accepting.
    // (Implemented on KoloFactory, not on the pot itself.)
}
