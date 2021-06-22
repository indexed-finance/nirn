// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../adapters/ironbank/CyErc20Adapter.sol";
import "../adapters/ironbank/CyEtherAdapter.sol";
import "../libraries/CloneLibrary.sol";


contract IronBankProtocolAdapter {
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  IComptroller public constant comptroller = IComptroller(0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB);
  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

  string public protocol = "IronBank";
  uint256 public totalMapped;
  address[] public adapters;
  address[] public frozen;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new CyErc20Adapter());
    etherAdapterImplementation = address(new CyEtherAdapter());
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

  function unfreeze(uint256 i) external {
    ICToken cToken = ICToken(frozen[i]);
    require(!comptroller.mintGuardianPaused(address(cToken)), "Asset frozen");
    (, address adapter) = deployAdapter(cToken);
    registry.addTokenAdapter(adapter);
    adapters.push(adapter);
    address last = frozen[frozen.length - 1];
    if (address(cToken) == last) {
      frozen.pop();
    } else {
      frozen[i] = last;
      frozen.pop();
    }
  }

  function map(uint256 max) external {
    ICToken[] memory cTokens = getUnmapped();
    uint256 len = cTokens.length;
    if (max < len) {
      len = max;
    }
    uint256 skipped;
    address[] memory _adapters = new address[](len);
    for (uint256 i = 0; i < len; i++) {
      ICToken cToken = cTokens[i];
      if (comptroller.mintGuardianPaused(address(cToken))) {
        frozen.push(address(cToken));
        skipped++;
        continue;
      }
      (,_adapters[i - skipped]) = deployAdapter(cToken);
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }

  function deployAdapter(ICToken cToken) internal returns (address underlying, address adapter) {
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
    CyErc20Adapter(adapter).initialize(underlying, address(cToken));
  }
}