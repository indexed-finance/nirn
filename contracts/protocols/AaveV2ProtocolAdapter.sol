// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/AaveV2Interfaces.sol";
import "../adapters/aave-v2/AaveV2Erc20Adapter.sol";
import "../adapters/aave-v2/AaveV2EtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";


contract AaveV2ProtocolAdapter {
  ILendingPoolAddressesProvider public constant aave = ILendingPoolAddressesProvider(0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5);
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

  string public protocol = "Aave V2";

  uint256 public totalMapped;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new AaveV2Erc20Adapter(aave));
    etherAdapterImplementation = address(new AaveV2EtherAdapter(aave));
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

  function mapTokens(uint256 max) external {
    ILendingPool pool = aave.getLendingPool();
    address[] memory reserves = pool.getReservesList();
    uint256 len = reserves.length;
    uint256 i = totalMapped;
    uint256 stopAt = i + max;
    if (len < stopAt) stopAt = len;
    if (i >= stopAt) return;
    for (; i < stopAt; i++) {
      address underlying = reserves[i];
      address adapter;
      address aToken = pool.getReserveData(underlying).aTokenAddress;
      if (underlying == weth) {
        adapter = CloneLibrary.createClone(etherAdapterImplementation);
        AaveV2EtherAdapter(adapter).initialize(underlying, aToken);
      } else {
        adapter = CloneLibrary.createClone(erc20AdapterImplementation);
        AaveV2Erc20Adapter(adapter).initialize(underlying, aToken);
      }
      registry.addTokenAdapter(adapter);
    }
    totalMapped = i-1;
  }

}

