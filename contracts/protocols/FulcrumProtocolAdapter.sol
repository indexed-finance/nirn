// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/FulcrumInterfaces.sol";
import "../adapters/fulcrum/FulcrumErc20Adapter.sol";
import "../adapters/fulcrum/FulcrumEtherAdapter.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../libraries/CloneLibrary.sol";


contract FulcrumProtocolAdapter {
  address public constant weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  IBZX public constant bzx = IBZX(0xD8Ee69652E4e4838f2531732a46d1f7F584F0b7f);
  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;

  string public protocol = "Fulcrum";
  uint256 public totalMapped = 2;

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    address _erc20AdapterImplementation = address(new FulcrumErc20Adapter());
    erc20AdapterImplementation = _erc20AdapterImplementation;
    address[] memory loanPoolsZeroAndOne = bzx.getLoanPoolsList(0, 2);
    address underlying0 = bzx.loanPoolToUnderlying(loanPoolsZeroAndOne[0]);
    address adapter0 = CloneLibrary.createClone(_erc20AdapterImplementation);
    FulcrumErc20Adapter(adapter0).initialize(underlying0, loanPoolsZeroAndOne[0]);
    _registry.addTokenAdapter(adapter0);
    _registry.addTokenAdapter(address(new FulcrumEtherAdapter(weth, loanPoolsZeroAndOne[1])));
  }

  function getUnmapped() external view returns (address[] memory loanPools) {
    loanPools = bzx.getLoanPoolsList(totalMapped, 1e18);
  }

  function mapTokens(uint256 max) external {
    uint256 total = totalMapped;
    address[] memory loanPools = bzx.getLoanPoolsList(total, max);
    uint256 len = loanPools.length;
    for (uint256 i = 0; i < len; i++) {
      address loanPool = loanPools[i];
      address underlying = bzx.loanPoolToUnderlying(loanPool);
      address adapter = CloneLibrary.createClone(erc20AdapterImplementation);
      FulcrumErc20Adapter(adapter).initialize(underlying, loanPool);
      registry.addTokenAdapter(adapter);
    }
    totalMapped = total + len;
  }
}

