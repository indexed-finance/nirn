// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/FuseInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "./FuseTokenAdapterFactory.sol";


contract FusePoolAdapter {
  address public immutable fuseProtocolAdapter;
  IAdapterRegistry public immutable registry;
  FuseTokenAdapterFactory public immutable adapterFactory;

  IFusePool public pool;
  string public protocol;
  uint256 public totalMapped;
  address[] public frozen;
  address[] public adapters;

  constructor(
    IAdapterRegistry _registry,
    FuseTokenAdapterFactory _adapterFactory
  ) {
    registry = _registry;
    adapterFactory = _adapterFactory;
    fuseProtocolAdapter = msg.sender;
  }

  function unfreeze(uint256 i) external {
    IFToken fToken = IFToken(frozen[i]);
    require(!pool.mintGuardianPaused(address(fToken)), "Asset frozen");
    (, address adapter) = adapterFactory.deployAdapter(fToken, protocol);
    registry.addTokenAdapter(adapter);
    adapters.push(adapter);
    address last = frozen[frozen.length - 1];
    if (address(fToken) == last) {
      frozen.pop();
    } else {
      frozen[i] = last;
      frozen.pop();
    }
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
    if (max < len) {
      len = max;
    }
    string memory fusePoolName = protocol;
    uint256 skipped;
    address[] memory _adapters = new address[](len);
    for (uint256 i = 0; i < len; i++) {
      IFToken fToken = fTokens[i];
      if (pool.mintGuardianPaused(address(fToken))) {
        frozen.push(address(fToken));
        skipped++;
        continue;
      }
      (,_adapters[i - skipped]) = adapterFactory.deployAdapter(fToken, fusePoolName);
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }
}