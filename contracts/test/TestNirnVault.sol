// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../vaults/NirnVault.sol";


contract TestNirnVault is NirnVault {
  constructor(
    address _registry,
    address _eoaSafeCaller
  ) NirnVault(_registry, _eoaSafeCaller) {}

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
    uint256 amount,
    uint256 newReserves
  ) external {
    return withdrawToMatchAmount(
      adapters,
      weights,
      balances,
      _reserveBalance,
      amount,
      newReserves
    );
  }

  function balanceSheetInternal() external view returns (BalanceSheet memory) {
    (IErc20Adapter[] memory adapters,) = getAdaptersAndWeights();
    return getBalanceSheet(adapters);
  }

  function processProposedDistributionInternal(
    DistributionParameters calldata currentParams,
    uint256 totalProductiveBalance,
    IErc20Adapter[] calldata proposedAdapters,
    uint256[] calldata proposedWeights
  ) external view returns (DistributionParameters memory params) {
    return processProposedDistribution(
      currentParams,
      totalProductiveBalance,
      proposedAdapters,
      proposedWeights
    );
  }
}