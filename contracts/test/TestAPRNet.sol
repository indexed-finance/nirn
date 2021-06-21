// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../libraries/APRNet.sol";

contract TestAdapter {
  using LowGasSafeMath for uint256;

  address public underlying;
  address public token;
  uint256 internal immutable annualRewards;
  uint256 internal immutable testBalance;
  uint256 internal immutable testLiquidity;

  constructor(
    address _underlying,
    address _token,
    uint256 _annualRewards,
    uint256 _testLiquidity,
    uint256 _testBalance
  ) {
    underlying = _underlying;
    token = _token;
    annualRewards = _annualRewards;
    testBalance = _testBalance;
    testLiquidity = _testLiquidity;
  }

  function getAPR() external view returns (uint256) {
    return annualRewards.mul(1e18) / testLiquidity;
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view returns (uint256) {
    return annualRewards.mul(1e18) / MinimalSignedMath.add(testLiquidity, liquidityDelta);
  }

  function balanceUnderlying() external view returns (uint256) {
    return testBalance;
  }
}


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