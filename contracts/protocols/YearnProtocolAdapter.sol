// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../adapters/ytoken/YErc20Adapter.sol";
import "../adapters/ytoken/YEtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";
import "./YTokenAdapterFactory.sol";

contract YearnProtocolAdapter {
  IYearnRegistry public constant yearn = IYearnRegistry(0x3eE41C098f9666ed2eA246f4D2558010e59d63A0);
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  YTokenAdapterFactory public immutable adapterFactory;

  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;
  string public protocol = "Yearn";
  uint256 public totalMapped = 1;
  address[] public adapters;
  address[] public frozen;

  constructor( IAdapterRegistry _registry, YTokenAdapterFactory _adapterFactory) {
    registry = _registry;
    erc20AdapterImplementation = address(new YErc20Adapter());
    _registry.addTokenAdapter(address(new YEtherAdapter()));
    adapterFactory = _adapterFactory;

  }

function getUnmapped() public view returns (IVault[] memory yTokens) {
   // yTokens = comptroller.getAllMarkets();
  //gilles tbd yTokens =  yearn.getVaults();

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

  function unfreeze(uint256 i) external {
    IVault yToken = IVault(frozen[i]);
   //gilles tbd require(!comptroller.mintGuardianPaused(address(cToken)), "Asset frozen");
    (, address adapter) = adapterFactory.deployAdapter(yToken, "Yearn");
    registry.addTokenAdapter(adapter);
    adapters.push(adapter);
    address last = frozen[frozen.length - 1];
    if (address(yToken) == last) {
      frozen.pop();
    } else {
      frozen[i] = last;
      frozen.pop();
    }
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
    //gilles tbd  if (comptroller.mintGuardianPaused(address(cToken))) {
      if (1) { // to replace 
        frozen.push(address(yToken));
        skipped++;
        continue;
      }
      (,_adapters[i - skipped]) = adapterFactory.deployAdapter(yToken, "Yearn");
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }

}