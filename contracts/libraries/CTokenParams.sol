// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/CompoundInterfaces.sol";
import "./LowGasSafeMath.sol";


library CTokenParams {
  using LowGasSafeMath for uint256;

  function getInterestRateParameters(address token) internal view returns (
    address model,
    uint256 cashPrior,
    uint256 borrowsPrior,
    uint256 reservesPrior,
    uint256 reserveFactorMantissa
  ) {
    ICToken cToken = ICToken(token);
    model = address(cToken.interestRateModel());

    cashPrior = cToken.getCash();
    borrowsPrior = cToken.totalBorrows();
    reservesPrior = cToken.totalReserves();
    uint256 accrualBlockNumber = cToken.accrualBlockNumber();
    uint256 blockDelta = block.number - accrualBlockNumber;
    reserveFactorMantissa = cToken.reserveFactorMantissa();
    if (blockDelta > 0) {
      uint256 borrowRateMantissa = IInterestRateModel(model).getBorrowRate(cashPrior, borrowsPrior, reservesPrior);
      uint256 interestAccumulated = borrowRateMantissa.mul(blockDelta).mul(borrowsPrior) / 1e18;
      borrowsPrior = borrowsPrior.add(interestAccumulated);
      reservesPrior = reservesPrior.add(reserveFactorMantissa.mul(interestAccumulated) / 1e18);
    }
  }
}