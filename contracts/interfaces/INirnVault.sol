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

  event SetFeeRecipient(address feeRecipient);

  event SetPerformanceFee(uint256 performanceFee);

  event SetReserveRatio(uint256 reserveRatio);

  event SetRewardsSeller(address rewardsSeller);

/* ========== Config Queries ========== */

  function minimumAPRImprovement() external view returns (uint256);

  function registry() external view returns (IAdapterRegistry);

  function eoaSafeCaller() external view returns (address);

  function underlying() external view returns (address);

  function name() external view returns (string memory);

  function symbol() external view returns (string memory);

  function feeRecipient() external view returns (address);

  function rewardsSeller() external view returns (IRewardsSeller);

  function wrapperAdapters(address) external view returns (address);

  function performanceFee() external view returns (uint64);

  function reserveRatio() external view returns (uint64);

  function priceAtLastFee() external view returns (uint128);

/* ========== Admin Actions ========== */

  function setPerformanceFee(uint64 _performanceFee) external;

  function setFeeRecipient(address _feeRecipient) external;

  function setRewardsSeller(IRewardsSeller _rewardsSeller) external;

  function setReserveRatio(uint64 _reserveRatio) external;

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

/* ========== Liquidity Delta Queries ========== */

  function getCurrentLiquidityDeltas() external view returns (int256[] memory liquidityDeltas);
  
  function getHypotheticalLiquidityDeltas(
    uint256[] calldata proposedWeights
  ) external view returns (int256[] memory liquidityDeltas);
  
  function getHypotheticalLiquidityDeltas(
    IErc20Adapter[] calldata proposedAdapters,
    uint256[] calldata proposedWeights
  ) external view returns (int256[] memory liquidityDeltas);

/* ========== APR Queries ========== */

  function getAPR() external view returns (uint256);

  function getAPRs() external view returns (uint256[] memory aprs);

  function getHypotheticalAPR(uint256[] memory proposedWeights) external view returns (uint256);

  function getHypotheticalAPR(
    IErc20Adapter[] calldata proposedAdapters,
    uint256[] calldata proposedWeights
  ) external view returns (uint256);

/* ========== Deposit/Withdraw ========== */

  function deposit(uint256 amount) external returns (uint256 shares);

  function depositTo(uint256 amount, address to) external returns (uint256 shares);

  function withdraw(uint256 shares) external returns (uint256 owed);

/* ========== Rebalance Actions ========== */

  function rebalance() external;

  function rebalanceWithNewWeights(uint256[] calldata proposedWeights) external;

  function rebalanceWithNewAdapters(
    IErc20Adapter[] calldata proposedAdapters,
    uint256[] calldata proposedWeights
  ) external;
}