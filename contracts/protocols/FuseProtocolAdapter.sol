// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./FuseTokenAdapterFactory.sol";
import "./FusePoolAdapter.sol";
import "../interfaces/FuseInterfaces.sol";


contract FuseProtocolAdapter {
  IFusePoolDirectory public immutable directory = IFusePoolDirectory(0x835482FE0532f169024d5E9410199369aAD5C77E);
  IAdapterRegistry public immutable registry;
  FuseTokenAdapterFactory public immutable adapterFactory;
  address public immutable adapterImplementation;
  string public protocol = "Rari Fuse";
  uint256 public totalMapped;
  address[] public privatePools;

  constructor(
    IAdapterRegistry _registry,
    FuseTokenAdapterFactory _adapterFactory
  ) {
    registry = _registry;
    adapterFactory = _adapterFactory;
    adapterImplementation = address(new FusePoolAdapter(_registry, _adapterFactory));
  }

  function getUnmapped() public view returns (IFusePoolDirectory.FusePool[] memory fusePools) {
    fusePools = directory.getAllPools();
    uint256 len = fusePools.length;
    uint256 prevLen = totalMapped;
    if (len == prevLen) {
      assembly { mstore(fusePools, 0) }
    } else {
      assembly {
        fusePools := add(fusePools, mul(prevLen, 32))
        mstore(fusePools, sub(len, prevLen))
      }
    }
  }

  function map(uint256 max) external {
    IFusePoolDirectory.FusePool[] memory fusePools = getUnmapped();
    uint256 len = fusePools.length;
    if (max < len) {
      len = max;
    }
    for (uint256 i = 0; i < len; i++) {
      IFusePool pool = fusePools[i].comptroller;
      if (pool.enforceWhitelist()) {
        privatePools.push(address(pool));
      } else {
        FusePoolAdapter adapter = FusePoolAdapter(CloneLibrary.createClone(adapterImplementation));
        adapter.initialize(IFusePool(address(pool)), fusePools[i].name);
        registry.addProtocolAdapter(address(adapter));
      }
    }
    totalMapped += len;
  }
}