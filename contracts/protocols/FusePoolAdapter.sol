// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/FuseInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "./FuseTokenAdapterFactory.sol";


contract FusePoolAdapter {
  address public immutable fuseProtocolAdapter;
  IAdapterRegistry public immutable registry;
  FuseTokenAdapterFactory public immutable factory;

  IFusePool public pool;
  string public protocol;
  uint256 public totalMapped;

  constructor(
    IAdapterRegistry _registry,
    FuseTokenAdapterFactory _factory
  ) {
    registry = _registry;
    factory = _factory;
    fuseProtocolAdapter = msg.sender;
  }

  function initialize(IFusePool _pool, string memory fusePoolName) external {
    require(msg.sender == fuseProtocolAdapter, "!fuse adapter");
    require(address(pool) == address(0), "already initialized");
    pool = _pool;
    protocol = fusePoolName;
  }

  function getUnmapped() public view returns (IFToken[] memory fTokens) {
    fTokens = pool.getAllMarkets();
    uint256 len = fTokens.length;
    uint256 prevLen = totalMapped;
    if (len == prevLen) {
      assembly { mstore(fTokens, 0) }
    } else {
      assembly {
        fTokens := add(fTokens, mul(prevLen, 32))
        mstore(fTokens, sub(len, prevLen))
      }
    }
  }

  function map(uint256 max) external {
    IFToken[] memory fTokens = getUnmapped();
    uint256 len = fTokens.length;
    string memory fusePoolName = protocol;
    if (max < len) {
      len = max;
    }
    for (uint256 i = 0; i < len; i++) {
      (,address adapter) = factory.deployAdapter(fTokens[i], fusePoolName);
      registry.addTokenAdapter(adapter);
    }
    totalMapped += len;
  }
}