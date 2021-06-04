// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/CompoundInterfaces.sol";

import "../adapters/ctoken/CErc20Adapter.sol";
import "../adapters/ctoken/CEtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";


contract CTokenAdapterFactory {
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

  constructor() {
    erc20AdapterImplementation = address(new CErc20Adapter());
    etherAdapterImplementation = address(new CEtherAdapter());
  }

  function deployAdapter(ICToken cToken, string memory protocolName) external returns (address underlying, address adapter) {
    // The call to underlying will use all the gas sent if it fails,
    // so we specify a maximum of 25k gas. The contract will only use ~2k
    // but this protects against all likely changes to the gas schedule.
    try cToken.underlying{gas: 25000}() returns (address _underlying) {
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
    CErc20Adapter(adapter).initialize(underlying, address(cToken), protocolName);
  }
}

