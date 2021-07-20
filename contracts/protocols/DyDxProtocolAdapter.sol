// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/DyDxInterfaces.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../adapters/dydx/DyDxErc20Adapter.sol";
import "../adapters/dydx/DyDxEtherAdapter.sol";
import "../libraries/CloneLibrary.sol";
import "../libraries/ArrayHelper.sol";


contract DyDxProtocolAdapter {
  using ArrayHelper for address[];
  using CloneLibrary for address;

/* ========== Events ========== */

  event MarketFrozen(address token);

  event MarketUnfrozen(address token);

  event AdapterFrozen(address adapter);

  event AdapterUnfrozen(address adapter);

/* ========== Constants ========== */

  IDyDx public constant dydx = IDyDx(0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e);
  IAdapterRegistry public immutable registry;
  address public immutable erc20AdapterImplementation;

/* ========== Storage ========== */

  address[] public frozenAdapters;
  DyDxMarket[] public frozenMarkets;
  uint256 public totalMapped = 1;

/* ========== Structs ========== */

  struct DyDxMarket {
    address underlying;
    uint96 marketId;
  }

/* ========== Constructor ========== */

  constructor(IAdapterRegistry _registry) {
    registry = _registry;
    erc20AdapterImplementation = address(new DyDxErc20Adapter());
    _registry.addTokenAdapter(address(new DyDxEtherAdapter(0)));
  }

/* ========== Public Actions ========== */

  function map(uint256 max) external {
    address[] memory tokens = getUnmappedUpTo(max);
    uint256 len = tokens.length;
    uint256 prevLen = totalMapped;
    address[] memory adapters = new address[](len);
    uint256 skipped;
    for (uint256 i; i < len; i++) {
      uint96 marketId = uint96(prevLen + i);
      address underlying = dydx.getMarketTokenAddress(marketId);
      if (
        underlying == 0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359 ||
        isTokenMarketFrozen(marketId)
      ) {
        frozenMarkets.push(DyDxMarket(underlying, marketId));
        skipped++;
        emit MarketFrozen(underlying);
        continue;
      }
      address adapter = deployAdapter(underlying, marketId);
      adapters[i - skipped] = adapter;
    }
    totalMapped = prevLen + len;
    assembly { if gt(skipped, 0) { mstore(adapters, sub(len, skipped)) } }
    registry.addTokenAdapters(adapters);
  }

  function unfreezeAdapter(uint256 index) external {
    DyDxErc20Adapter adapter = DyDxErc20Adapter(frozenAdapters[index]);
    uint256 marketId = adapter.marketId();
    require(!isTokenMarketFrozen(marketId), "Market not frozen");
    frozenAdapters.remove(index);
    registry.addTokenAdapter(address(adapter));
    emit AdapterUnfrozen(address(adapter));
  }

  function unfreezeToken(uint256 index) external {
    DyDxMarket memory market = frozenMarkets[index];
    uint256 marketId = market.marketId;
    require(!isTokenMarketFrozen(marketId), "Market not frozen");
    removeMarket(index);
    address adapter = deployAdapter(market.underlying, marketId);
    registry.addTokenAdapter(address(adapter));
    emit MarketUnfrozen(market.underlying);
  }

  function freezeAdapter(address adapterAddress) external {
    DyDxErc20Adapter adapter = DyDxErc20Adapter(adapterAddress);
    uint256 marketId = adapter.marketId();
    require(isTokenMarketFrozen(marketId), "Market not frozen");
    frozenAdapters.push(adapterAddress);
    registry.removeTokenAdapter(adapterAddress);
    emit AdapterUnfrozen(address(adapter));
  }

/* ========== Internal Actions ========== */

  function deployAdapter(address underlying, uint256 marketId) internal returns (address adapter) {
    adapter = erc20AdapterImplementation.createClone();
    DyDxErc20Adapter(adapter).initialize(underlying, marketId);
  }

  function removeMarket(uint256 index) internal {
    uint256 len = frozenMarkets.length;
    if (index == len - 1) {
      frozenMarkets.pop();
      return;
    }
    DyDxMarket memory last = frozenMarkets[len - 1];
    frozenMarkets[index] = last;
    frozenMarkets.pop();
  }

/* ========== Public Queries ========== */

  function protocol() external pure returns (string memory) {
    return "DyDx";
  }

  function frozenTokens() external view returns (address[] memory tokens) {
    DyDxMarket[] memory markets = frozenMarkets;
    uint256 len = markets.length;
    tokens = new address[](len);
    for (uint256 i; i < len; i++) tokens[i] = markets[i].underlying;
  }

  function getUnmapped() public view returns (address[] memory tokens) {
    tokens = getUnmappedUpTo(1e18);
  }

  function getUnmappedUpTo(uint256 max)
    public
    view
    returns (address[] memory tokens)
  {
    uint256 numMarkets = dydx.getNumMarkets();
    uint256 prevLen = totalMapped;
    uint256 len = numMarkets - prevLen;
    if (max < len) len = max;
    tokens = new address[](len);
    for (uint256 i; i < len; i++) {
      uint256 marketId = prevLen + i;
      address underlying = dydx.getMarketTokenAddress(marketId);
      tokens[i] = underlying;
    }
  }

/* ========== Internal Queries ========== */  

  function isTokenMarketFrozen(uint256 marketId) internal view returns (bool) {
    return dydx.getMarketIsClosing(marketId);
  }
}

