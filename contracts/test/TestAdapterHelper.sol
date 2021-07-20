// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../libraries/AdapterHelper.sol";
import "../libraries/TransferHelper.sol";

contract TestAdapterHelper {
  using TransferHelper for address;
  using AdapterHelper for IErc20Adapter;
  using AdapterHelper for IErc20Adapter[];
  using AdapterHelper for uint256;
  using AdapterHelper for bytes32;
  using AdapterHelper for bytes32[];

  function approve(IErc20Adapter adapter) external {
    adapter.underlying().safeApproveMax(address(adapter));
    address(adapter.token()).safeApproveMax(address(adapter));
  }

  function testDeposit(IErc20Adapter adapter, uint256 amount) external {
    adapter.underlying().safeApproveMax(address(adapter));
    adapter.deposit(amount);
    address(adapter.token()).safeApproveMax(address(adapter));
  }

  function packAdapterAndWeight(
    IErc20Adapter adapter,
    uint256 weight
  )
    external
    pure
    returns (bytes32 encoded)
  {
    return adapter.packAdapterAndWeight(weight);
  }

  function packAdaptersAndWeights(
    IErc20Adapter[] memory adapters,
    uint256[] memory weights
  )
    external
    pure
    returns (bytes32[] memory encodedArray)
  {
    return adapters.packAdaptersAndWeights(weights);
  }

  function unpackAdapterAndWeight(bytes32 encoded)
    external
    pure
    returns (
      IErc20Adapter adapter,
      uint256 weight
    )
  {
    return encoded.unpackAdapterAndWeight();
  }

  function unpackAdaptersAndWeights(bytes32[] memory encodedArray)
    external
    pure
    returns (
      IErc20Adapter[] memory adapters,
      uint256[] memory weights
    )
  {
    return encodedArray.unpackAdaptersAndWeights();
  }

  function getNetAPR(
    IErc20Adapter[] memory adapters,
    uint256[] memory weights,
    int256[] memory liquidityDeltas
  ) external view returns (uint256 netAPR)
  {
    return adapters.getNetAPR(weights, liquidityDeltas);
  }

  function getLiquidityDeltas(
    uint256 totalProductiveBalance,
    uint256[] memory balances,
    uint256[] memory weights
  ) external pure returns (int256[] memory deltas)
  {
    return totalProductiveBalance.getLiquidityDeltas(balances, weights);
  }

  function getBalances(IErc20Adapter[] memory adapters)
    external
    view
    returns (uint256[] memory balances)
  {
    return adapters.getBalances();
  }

  function getExcludedAdapterIndices(
    IErc20Adapter[] memory oldAdapters,
    IErc20Adapter[] memory newAdapters
  ) external pure returns (uint256[] memory excludedAdapterIndices)
  {
    return oldAdapters.getExcludedAdapterIndices(newAdapters);
  }

  function rebalance(
    IErc20Adapter[] memory adapters,
    uint256[] memory weights,
    int256[] memory liquidityDeltas,
    uint256 reserveBalance
  ) external returns (uint256[] memory removedIndices)
  {
    return adapters.rebalance(weights, liquidityDeltas, reserveBalance);
  }
}