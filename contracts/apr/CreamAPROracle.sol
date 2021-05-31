// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../maps/CreamTokenMap.sol";
import "../libraries/LowGasSafeMath.sol";


contract CreamAPROracle {
  using LowGasSafeMath for uint256;

  CreamTokenMap public immutable cTokenMap;

  string public name = "C.R.E.A.M. APR Oracle";

  constructor(address _cTokenMap) {
    cTokenMap = CreamTokenMap(_cTokenMap);
  }

  function getAPR(address token) external view returns (uint256) {
    ICToken cToken = ICToken(cTokenMap.cTokens(token));
    require(address(cToken) != address(0));
    return cToken.supplyRatePerBlock().mul(2102400);
  }

  function getHypotheticalAPR(address token, uint256 deposit) external view returns (uint256) {
    ICToken cToken = ICToken(cTokenMap.cTokens(token));
    require(address(cToken) != address(0));
    IInterestRateModel model = cToken.interestRateModel();
    return model.getSupplyRate(
      cToken.getCash().add(deposit),
      cToken.totalBorrows(),
      cToken.totalReserves(),
      cToken.reserveFactorMantissa()
    ).mul(2102400);
  }
}