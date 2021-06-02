// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/DyDxInterfaces.sol";


contract DyDxMarketMap {
  IDyDx public immutable dydx;
  mapping(address => Market) internal _markets;
  uint256 public totalMapped;

  function marketIds(address token) external view returns (uint256) {
    Market memory market = _markets[token];
    require(market.exists, "dydx: token not found");
    return market.id;
  }

  struct Market {
    uint248 id;
    bool exists;
  }

  constructor(address _dydx) {
    dydx = IDyDx(_dydx);
  }

  function mapAll() external {
    uint256 len = dydx.getNumMarkets();
    uint256 i = totalMapped;
    for (; i < len; i++) {
      _markets[dydx.getMarketTokenAddress(i)] = Market(uint248(i), true);
    }
    totalMapped = len;
  }
}

