// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/DyDxInterfaces.sol";

import "../adapters/dydx/DyDxErc20Adapter.sol";
import "../adapters/dydx/DyDxEtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";


contract DyDxProtocolAdapter {
  IDyDx public constant dydx = IDyDx(0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e);
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;

  string public protocol = "DyDx";

  uint256 public totalMapped = 1;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new DyDxErc20Adapter(dydx));
    _registry.addTokenAdapter(address(new DyDxEtherAdapter(dydx, weth, 0)));
  }

  function mapTokens(uint256 max) external {
    uint256 len = dydx.getNumMarkets();
    uint256 i = totalMapped;
    uint256 stopAt = i + max;
    if (len < stopAt) stopAt = len;
    if (i >= stopAt) return;
    for (; i < stopAt; i++) {
      address underlying = dydx.getMarketTokenAddress(i);
      if (underlying == 0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359) {
        continue;
      }
      address adapter = CloneLibrary.createClone(erc20AdapterImplementation);
      DyDxErc20Adapter(adapter).initialize(underlying, i);
      registry.addTokenAdapter(adapter);
    }
    totalMapped = i-1;
  }
}

