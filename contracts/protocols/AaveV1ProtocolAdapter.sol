// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/AaveV1Interfaces.sol";
import "../adapters/aave-v1/AaveV1Erc20Adapter.sol";
import "../adapters/aave-v1/AaveV1EtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";
import "../libraries/ArrayHelper.sol";


contract AaveV1ProtocolAdapter {
  using ArrayHelper for address[];

  ILendingPoolAddressesProvider public constant aave = ILendingPoolAddressesProvider(0x24a42fD28C976A61Df5D00D0599C34c4f90748c8);
  address public constant ETH_RESERVE_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

  string public protocol = "Aave V1";

  uint256 public totalMapped;
  address[] public frozenTokens;
  address[] public frozenAdapters;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new AaveV1Erc20Adapter(aave));
    etherAdapterImplementation = address(new AaveV1EtherAdapter(aave));
  }

  function freezeAdapter(address underlying) external {
    ILendingPoolCore core = aave.getLendingPoolCore();
    address aToken = core.getReserveATokenAddress(underlying);
    address adapter = registry.getAdapterForWrapperToken(aToken);
    require(adapter != address(0), "!exists");
    require(core.getReserveIsFreezed(underlying), "!frozen");
    frozenAdapters.push(adapter);
    registry.removeTokenAdapter(adapter);
  }

  function unfreezeAdapter(address adapter) external {
    ILendingPoolCore core = aave.getLendingPoolCore();
    address underlying = AaveV1Erc20Adapter(adapter).underlying();
    require(!core.getReserveIsFreezed(underlying), "still frozen");
    uint256 index = frozenAdapters.indexOf(adapter);
    frozenAdapters.remove(index);
    registry.addTokenAdapter(adapter);
  }

  function unfreezeToken(address underlying) external {
    ILendingPoolCore core = aave.getLendingPoolCore();
    require(!core.getReserveIsFreezed(underlying), "still frozen");
    uint256 index = frozenTokens.indexOf(underlying);
    frozenTokens.remove(index);
    address adapter = _deployAdapter(core, underlying);
    registry.addTokenAdapter(adapter);
  }

  function getUnmapped() public view returns (address[] memory tokens) {
    ILendingPoolCore core = aave.getLendingPoolCore();
    tokens = core.getReserves();
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

  function _deployAdapter(ILendingPoolCore core, address underlying) internal returns (address adapter) {
    if (underlying == ETH_RESERVE_ADDRESS) {
      adapter = CloneLibrary.createClone(etherAdapterImplementation);
      AaveV1EtherAdapter(payable(adapter)).initialize(weth, core.getReserveATokenAddress(underlying));
    } else {
      adapter = CloneLibrary.createClone(erc20AdapterImplementation);
      AaveV1Erc20Adapter(adapter).initialize(underlying, core.getReserveATokenAddress(underlying));
    }
  }

  function map(uint256 max) external {
    ILendingPoolCore core = aave.getLendingPoolCore();
    address[] memory reserves = getUnmapped();
    uint256 len = reserves.length;
    if (max < len) {
      len = max;
    }
    address[] memory _adapters = new address[](len);
    uint256 skipped;
    for (uint256 i = 0; i < len; i++) {
      address underlying = reserves[i];
      if (core.getReserveIsFreezed(underlying)) {
        frozenTokens.push(underlying);
        skipped++;
        continue;
      }
      address adapter = _deployAdapter(core, underlying);
      _adapters[i - skipped] = adapter;
    }
    totalMapped += len;
    assembly { if gt(skipped, 0) { mstore(_adapters, sub(mload(_adapters), skipped)) } }
    registry.addTokenAdapters(_adapters);
  }
}

