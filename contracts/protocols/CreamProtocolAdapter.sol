// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "./CTokenAdapterFactory.sol";


contract CreamProtocolAdapter {
  IComptroller public constant comptroller = IComptroller(0x3d5BC3c8d13dcB8bF317092d84783c2697AE9258);
  IAdapterRegistry public immutable registry;
  CTokenAdapterFactory public immutable adapterFactory;

  string public protocol = "Cream";
  uint256 public totalMapped;
  address[] public adapters;
  address[] public frozen;

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

  function unfreeze(uint256 i) external {
    ICToken cToken = ICToken(frozen[i]);
    require(!comptroller.mintGuardianPaused(address(cToken)), "Asset frozen");
    (, address adapter) = adapterFactory.deployAdapter(cToken, "Cream");
    registry.addTokenAdapter(adapter);
    adapters.push(adapter);
    address last = frozen[frozen.length - 1];
    if (address(cToken) == last) {
      frozen.pop();
    } else {
      frozen[i] = last;
      frozen.pop();
    }
  }

  function map(uint256 max) external {
    ICToken[] memory cTokens = getUnmapped();
    uint256 len = cTokens.length;
    if (max < len) {
      len = max;
    }
    uint256 skipped;
    address[] memory _adapters = new address[](len);
    for (uint256 i = 0; i < len; i++) {
      ICToken cToken = cTokens[i];
      if (comptroller.mintGuardianPaused(address(cToken))) {
        frozen.push(address(cToken));
        skipped++;
        continue;
      }
      (,_adapters[i - skipped]) = adapterFactory.deployAdapter(cToken, "Cream");
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }
}