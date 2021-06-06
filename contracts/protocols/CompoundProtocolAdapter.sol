// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "./CTokenAdapterFactory.sol";


contract CompoundProtocolAdapter {
  IComptroller public constant comptroller = IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
  IAdapterRegistry public immutable registry;
  CTokenAdapterFactory public immutable adapterFactory;

  string public protocol = "Compound";
  // @todo Add support for cBAT
  uint256 public totalMapped = 1;

  constructor(
    IAdapterRegistry _registry,
    CTokenAdapterFactory _adapterFactory
  ) {
    registry = _registry;
    adapterFactory = _adapterFactory;
  }

  function getUnmapped() public view returns (ICToken[] memory cTokens) {
    cTokens = comptroller.getAllMarkets();
    uint256 len = cTokens.length;
    uint256 prevLen = totalMapped;
    if (len == prevLen) {
      assembly { mstore(cTokens, 0) }
    } else {
      assembly {
        cTokens := add(cTokens, mul(prevLen, 32))
        mstore(cTokens, sub(len, prevLen))
      }
    }
  }

  function mapTokens(uint256 max) external {
    ICToken[] memory cTokens = getUnmapped();
    uint256 len = cTokens.length;
    if (max < len) {
      len = max;
    }
    for (uint256 i = 0; i < len; i++) {
      (,address adapter) = adapterFactory.deployAdapter(cTokens[i], "Compound");
      registry.addTokenAdapter(adapter);
    }
    totalMapped += len;
  }
}