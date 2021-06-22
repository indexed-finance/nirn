// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../interfaces/ITokenAdapter.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/MinimalSignedMath.sol";
import "../libraries/Fraction.sol";


// Sort of like ARPANET but with different letters
library APRNet {
  using Fraction for uint256;
  using LowGasSafeMath for uint256;
  using MinimalSignedMath for uint256;
  using MinimalSignedMath for int256;

  struct RebalanceParams {
    IErc20Adapter[] adapters;
    uint256[] proposedWeights;
    uint256 currentNetAPR;
    uint256 newNetAPR;
    int256[] liquidityDeltas;
  }

  function sum(uint256[] memory arr) internal pure returns (uint256 _sum) {
    uint256 len = arr.length;
    for (uint256 i; i < len; i++) _sum = _sum.add(arr[i]);
  }

  function validateWeights(uint256[] memory weights) internal pure {
    uint256 len = weights.length;
    uint256 _sum;
    for (uint256 i; i < len; i++) {
      uint256 weight = weights[i];
      _sum = _sum.add(weight);
      require(weight >= 5e16, "weight < 5%");
    }
    require(_sum == 1e18, "weights != 100%");
  }

  function getNetAPR(
    IErc20Adapter[] memory adapters,
    uint256[] memory weights,
    int256[] memory liquidityDeltas
  ) internal view returns (uint256 netAPR) {
    uint256 len = adapters.length;
    for (uint256 i; i < len; i++) {
      netAPR = netAPR.add(
        adapters[i].getHypotheticalAPR(liquidityDeltas[i]).mul(weights[i]) / uint256(1e18)
      );
    }
  }

  function getNetAPR(
    IErc20Adapter[] memory adapters,
    uint256[] memory weights,
    int256[] memory liquidityDeltas,
    uint256 reserveRatio
  ) internal view returns (uint256 netAPR) {
    netAPR = getNetAPR(adapters, weights, liquidityDeltas);
    netAPR = netAPR.sub(netAPR.mulFractionE18(reserveRatio));
  }

  function calculateLiquidityDeltas(
    uint256 balanceSum,
    uint256[] memory balances,
    uint256[] memory weights
  ) internal pure returns (int256[] memory deltas) {
    uint256 len = balances.length;
    deltas = new int256[](len);
    for (uint256 i; i < len; i++) {
      uint256 targetBalance = balanceSum.mul(weights[i]) / uint256(1e18);
      deltas[i] = targetBalance.toInt256().sub(balances[i].toInt256());
    }
  }

  function rebalance(
    IErc20Adapter[] memory adapters,
    int256[] memory liquidityDeltas
  ) internal {
    uint256 len = liquidityDeltas.length;
    // Execute withdrawals first
    for (uint256 i; i < len; i++) {
      int256 delta = liquidityDeltas[i];
      if (delta < 0) {
        adapters[i].withdrawUnderlying((-delta).toUint256());
      }
    }
    // Execute deposits after
    for (uint256 i; i < len; i++) {
      int256 delta = liquidityDeltas[i];
      if (delta > 0) {
        adapters[i].deposit(delta.toUint256());
      }
    }
  }
}