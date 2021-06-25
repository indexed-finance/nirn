// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../libraries/APRNet.sol";


contract TestAPRNet {
  function validateWeights(uint256[] memory weights) internal pure {
    return APRNet.validateWeights(weights);
  }

  function getNetAPR(
    IErc20Adapter[] memory adapters,
    uint256[] memory weights,
    int256[] memory liquidityDeltas
  ) external view returns (uint256 netAPR) {
    return APRNet.getNetAPR(adapters, weights, liquidityDeltas);
  }

  function calculateLiquidityDeltas(
    uint256 balanceSum,
    uint256[] memory balances,
    uint256[] memory weights
  ) external pure returns (int256[] memory deltas) {
    return APRNet.calculateLiquidityDeltas(balanceSum, balances, weights);
  }

  function rebalance(
    IErc20Adapter[] memory adapters,
    int256[] memory liquidityDeltas
  ) external {
    APRNet.rebalance(adapters, liquidityDeltas);
  }
}