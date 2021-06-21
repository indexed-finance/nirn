// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/AaveV2Interfaces.sol";
import "../adapters/aave-v2/AaveV2Erc20Adapter.sol";
import "../adapters/aave-v2/AaveV2EtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";
import "../libraries/ReserveConfigurationLib.sol";

// @todo Add freezing & unfreezing of adapters and unfreezing of tokens
contract AaveV2ProtocolAdapter {
  using ReserveConfigurationLib for ILendingPool.ReserveConfigurationMap;

  ILendingPoolAddressesProvider public constant aave = ILendingPoolAddressesProvider(0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5);
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;

  string public protocol = "Aave V2";

  uint256 public totalMapped;
  address[] public frozen;
  address[] public adapters;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new AaveV2Erc20Adapter(aave));
  }

  function getUnmapped() public view returns (address[] memory tokens) {
    ILendingPool pool = aave.getLendingPool();
    tokens = pool.getReservesList();
    uint256 len = tokens.length;
    uint256 prevLen = totalMapped;
    if (len == prevLen) {
      assembly { mstore(tokens, 0) }
    } else {
      assembly {
        tokens := add(tokens, mul(prevLen, 32))
        mstore(tokens, sub(len, prevLen))
      }
    }
  }

  function map(uint256 max) external {
    ILendingPool pool = aave.getLendingPool();
    address[] memory reserves = getUnmapped();
    uint256 len = reserves.length;
    if (max < len) {
      len = max;
    }
    address[] memory _adapters = new address[](len);
    uint256 skipped;
    for (uint256 i = 0; i < len; i++) {
      address underlying = reserves[i];
      address adapter;
      address aToken = pool.getReserveData(underlying).aTokenAddress;
      if (pool.getConfiguration(underlying).isFrozen()) {
        frozen.push(underlying);
        skipped++;
        continue;
      }
      if (underlying == weth) {
        adapter = address(new AaveV2EtherAdapter(aave, underlying, aToken));
      } else {
        adapter = CloneLibrary.createClone(erc20AdapterImplementation);
        AaveV2Erc20Adapter(adapter).initialize(underlying, aToken);
      }
      adapters.push(adapter);
      _adapters[i - skipped] = adapter;
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }
}

