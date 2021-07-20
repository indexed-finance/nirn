// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../vaults/NirnVault.sol";


contract TestNirnVault is NirnVault {
  constructor(
    address _registry,
    address _eoaSafeCaller,
    address _underlying,
    address _rewardsSeller,
    address _feeRecipient
  ) NirnVault(_registry, _eoaSafeCaller, _underlying, _rewardsSeller, _feeRecipient) {}

  function setAdaptersAndWeightsInternal(
    IErc20Adapter[] calldata adapters,
    uint256[] calldata weights
  ) external {
    beforeAddAdapters(adapters);
    setAdaptersAndWeights(adapters, weights);
  }

  function removeAdaptersInternal(uint256[] calldata removeIndices) external {
    removeAdapters(removeIndices);
  }

  function withdrawToMatchAmountInternal(
    IErc20Adapter[] calldata adapters,
    uint256[] calldata weights,
    uint256[] calldata balances,
    uint256 _reserveBalance,
    uint256 amount
  ) external {
    return withdrawToMatchAmount(adapters, weights, balances, _reserveBalance, amount);
  }

  function currentDistributionInternal() external view returns (
    DistributionParameters memory params,
    uint256 totalProductiveBalance,
    uint256 _reserveBalance
  ) {
    return currentDistribution();
  }
}