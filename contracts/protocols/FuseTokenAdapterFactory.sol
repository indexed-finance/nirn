// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/FuseInterfaces.sol";

import "../adapters/fuse/FuseErc20Adapter.sol";
import "../adapters/fuse/FuseEtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";


contract FuseTokenAdapterFactory {
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

  constructor() {
    erc20AdapterImplementation = address(new FuseErc20Adapter());
    etherAdapterImplementation = address(new FuseEtherAdapter());
  }

  function deployAdapter(IFToken fToken, string memory protocolName) external returns (address underlying, address adapter) {
    // The call to underlying will use all the gas sent if it fails,
    // so we specify a maximum of 25k gas. The contract will only use ~2k
    // but this protects against all likely changes to the gas schedule.
    try fToken.underlying{gas: 25000}() returns (address _underlying) {
      underlying = _underlying;
      if (underlying == address(0)) {
        underlying = weth;
      }
    } catch {
      underlying = weth;
    }
    if (underlying == weth) {
      adapter = CloneLibrary.createClone(etherAdapterImplementation);
    } else {
      adapter = CloneLibrary.createClone(erc20AdapterImplementation);
    }
    FuseErc20Adapter(adapter).initialize(underlying, address(fToken), protocolName);
  }
}

