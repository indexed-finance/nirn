// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/AaveV1Interfaces.sol";
import "../adapters/aave-v1/AaveV1Erc20Adapter.sol";
import "../adapters/aave-v1/AaveV1EtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";


contract AaveV1ProtocolAdapter {
  ILendingPoolAddressesProvider public constant aave = ILendingPoolAddressesProvider(0x24a42fD28C976A61Df5D00D0599C34c4f90748c8);
  address public constant ETH_RESERVE_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

  string public protocol = "Aave V1";

  uint256 public totalMapped;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new AaveV1Erc20Adapter(aave));
    etherAdapterImplementation = address(new AaveV1EtherAdapter(aave));
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

  function mapTokens(uint256 max) external {
    ILendingPoolCore core = aave.getLendingPoolCore();
    address[] memory reserves = core.getReserves();
    uint256 len = reserves.length;
    uint256 i = totalMapped;
    uint256 stopAt = i + max;
    if (len < stopAt) stopAt = len;
    if (i >= stopAt) return;
    for (; i < stopAt; i++) {
      address underlying = reserves[i];
      address adapter;
      if (underlying == ETH_RESERVE_ADDRESS) {
        adapter = CloneLibrary.createClone(etherAdapterImplementation);
        AaveV1EtherAdapter(adapter).initialize(weth, core.getReserveATokenAddress(underlying));
      } else {
        adapter = CloneLibrary.createClone(erc20AdapterImplementation);
        AaveV1Erc20Adapter(adapter).initialize(underlying, core.getReserveATokenAddress(underlying));
      }
      registry.addTokenAdapter(adapter);
    }
    totalMapped = i-1;
  }

}

