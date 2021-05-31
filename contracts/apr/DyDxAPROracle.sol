// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../maps/DyDxMarketMap.sol";
import "../libraries/LowGasSafeMath.sol";


contract DyDxAPROracle {
  using LowGasSafeMath for uint256;

  IDyDx public immutable dydx;
  DyDxMarketMap public immutable marketMap;
  uint256 public constant DECIMAL = 10 ** 18;

  constructor(address _dydx, address _marketMap) {
    dydx = IDyDx(_dydx);
    marketMap = DyDxMarketMap(_marketMap);
  }

  function getAPR(address token) public view returns(uint256) {
    uint256 marketId = marketMap.marketIds(token);
    uint256 rate = dydx.getMarketInterestRate(marketId).value;
    uint256 aprBorrow = rate * 31622400;
    uint256 borrow = dydx.getMarketTotalPar(marketId).borrow;
    uint256 supply = dydx.getMarketTotalPar(marketId).supply;
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    uint256 apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
    return apr;
  }

  function getHypotheticalAPR(address token, uint256 deposit) public view returns(uint256) {
    uint256 marketId = marketMap.marketIds(token);
    uint256 rate = dydx.getMarketInterestRate(marketId).value;
    uint256 aprBorrow = rate * 31622400;
    uint256 borrow = dydx.getMarketTotalPar(marketId).borrow;
    uint256 supply = uint256(dydx.getMarketTotalPar(marketId).supply).add(deposit);
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    uint256 apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
    return apr;
  }
}