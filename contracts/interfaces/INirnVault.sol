// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "./IAdapterRegistry.sol";
import "./ITokenAdapter.sol";
import "./IRewardsSeller.sol";


interface INirnVault {
/* ========== Events ========== */

  /** @dev Emitted when an adapter is removed and its balance fully withdrawn. */
  event AdapterRemoved(IErc20Adapter adapter);

  /** @dev Emitted when weights or adapters are updated. */
  event AllocationsUpdated(IErc20Adapter[] adapters, uint256[] weights);

  event FeesClaimed(uint256 underlyingAmount, uint256 sharesMinted);

  event Rebalanced();

/* ========== Config Queries ========== */

  function minimumAPRImprovement() external view returns (uint256);

  function registry() external view returns (IAdapterRegistry);

  function eoaSafeCaller() external view returns (address);

  function underlying() external view returns (address);

  function name() external view returns (string memory);

  function symbol() external view returns (string memory);

  function feeRecipient() external view returns (address);

  function rewardsSeller() external view returns (IRewardsSeller);

  function lockedTokens(address) external view returns (bool);

  function performanceFee() external view returns (uint64);

  function reserveRatio() external view returns (uint64);

  function priceAtLastFee() external view returns (uint128);

/* ========== Admin Actions ========== */

  function setPerformanceFee(uint64 _performanceFee) external;

  function setFeeRecipient(address _feeRecipient) external;

  function setRewardsSeller(IRewardsSeller _rewardsSeller) external;

/* ========== Balance Queries ========== */

  function balance() external view returns (uint256 sum);

  function reserveBalance() external view returns (uint256);

/* ========== Fee Queries ========== */

  function getPendingFees() external view returns (uint256);

/* ========== Price Queries ========== */

  function getPricePerFullShare() external view returns (uint256);

  function getPricePerFullShareWithFee() external view returns (uint256);

/* ========== Reward Token Sales ========== */

  function sellRewards(address rewardsToken, bytes calldata params) external;

/* ========== Adapter Queries ========== */

  function getBalances() external view returns (uint256[] memory balances);

  function getAdaptersAndWeights() external view returns (
    IErc20Adapter[] memory adapters,
    uint256[] memory weights
  );
}