// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../adapters/ytoken/YErc20Adapter.sol";
import "../adapters/ytoken/YEtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";

contract YearnProtocolAdapter {
  IYearnRegistry public constant yearn = IYearnRegistry(0x3eE41C098f9666ed2eA246f4D2558010e59d63A0);
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  address public immutable etherAdapterImplementation;
  address public immutable erc20AdapterImplementation;

  IAdapterRegistry public immutable registry;
  string public protocol = "Yearn";
  uint256 public totalMapped = 1;
  address[] public adapters;
  address[] public frozen;

  constructor( IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new YErc20Adapter());
    etherAdapterImplementation = address(new YEtherAdapter());
    _registry.addTokenAdapter(address(new YEtherAdapter()));

  }

function getUnmapped() public view returns (IVault [] memory yTokens) {
    yTokens = yearn.getVaults();
    uint256 len = yearn.getVaultsLength();
    uint256 prevLen = totalMapped;
    if (len == prevLen) {
      assembly { mstore(yTokens, 0) }
    } else {
      assembly {
        yTokens := add(yTokens, mul(prevLen, 32))
        mstore(yTokens, sub(len, prevLen))
      }
    }
  }

 function deployAdapter(IVault yToken, address _underlying) public  returns (address underlying, address adapter) {

    underlying = _underlying;   
    if (_underlying == address(0)) {
      underlying = weth;
    } 

    if (underlying == weth) {
      adapter = CloneLibrary.createClone(etherAdapterImplementation);
    } else {
      adapter = CloneLibrary.createClone(erc20AdapterImplementation);
    }
    YErc20Adapter(adapter).initialize(underlying, address(yToken));
  }

  function map(uint256 max) external {
    IVault[] memory yTokens = getUnmapped();
    uint256 len = yTokens.length;
    if (max < len) {
      len = max;
    }
    uint256 skipped;
    address[] memory _adapters = new address[](len);
    for (uint256 i = 0; i < len; i++) {
      IVault yToken = yTokens[i];
      address yTokenAddress = address(yToken);
      (,address underlying,,bool isWrapped,bool isDelegated) = yearn.getVaultInfo(yTokenAddress);

      if (isWrapped == false && isDelegated == false) { 
      //  frozen.push(address(underlying));
        skipped++;
        continue;
      }
      (,_adapters[i - skipped]) = deployAdapter(IVault(yToken), underlying);
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }

}