// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.7.6;

import "../maps/CompoundTokenMap.sol";
import "../libraries/LowGasSafeMath.sol";


contract CompoundAPROracle {
  using LowGasSafeMath for uint256;

  CompoundTokenMap public immutable cTokenMap;

  string public name = "Compound APR Oracle";

  constructor(address _cTokenMap) {
    cTokenMap = CompoundTokenMap(_cTokenMap);
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