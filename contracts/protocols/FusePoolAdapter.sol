// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "./CTokenAdapterFactory.sol";


contract FusePoolAdapter {
  address public immutable fuseProtocolAdapter;

  IComptroller public comptroller;
  IAdapterRegistry public registry;
  CTokenAdapterFactory public adapterFactory;

  string public protocol;
  uint256 public totalMapped;

  constructor() {
    fuseProtocolAdapter = msg.sender;
  }

  function initialize(
    IAdapterRegistry _registry,
    IComptroller _comptroller,
    CTokenAdapterFactory _adapterFactory,
    string memory fusePoolName
  ) external {
    require(msg.sender == fuseProtocolAdapter, "!fuse adapter");
    require(address(registry) == address(0), "already initialized");
    registry = _registry;
    comptroller = _comptroller;
    adapterFactory = _adapterFactory;
    protocol = fusePoolName;
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

  function map(uint256 max) external {
    ICToken[] memory cTokens = getUnmapped();
    uint256 len = cTokens.length;
    string memory fusePoolName = protocol;
    if (max < len) {
      len = max;
    }
    IAdapterRegistry _registry = registry;
    CTokenAdapterFactory _factory = adapterFactory;
    for (uint256 i = 0; i < len; i++) {
      (,address adapter) = _factory.deployAdapter(cTokens[i], fusePoolName);
      _registry.addTokenAdapter(adapter);
    }
    totalMapped += len;
  }
}