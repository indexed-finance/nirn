// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../libraries/LowGasSafeMath.sol";
import "../interfaces/AaveV1Interfaces.sol";


contract AaveV1APROracle {
  using LowGasSafeMath for uint256;
  using RayDiv for uint256;
  ILendingPoolAddressesProvider public immutable aave;

  string public name = "Aave V1 APR Oracle";

  constructor(ILendingPoolAddressesProvider _aave) {
    aave = _aave;
  }

  function getAPR(address token) external view returns (uint256 apr) {
    ILendingPoolCore core = aave.getLendingPoolCore();
    apr = core.getReserveCurrentLiquidityRate(token) / 1e9;
  }

  function getHypotheticalAPR(address token, uint256 deposit) external view returns (uint256 apr) {
    ILendingPoolCore core = aave.getLendingPoolCore();
    uint256 totalBorrowsStable = core.getReserveTotalBorrowsStable(token);
    uint256 totalBorrowsVariable = core.getReserveTotalBorrowsVariable(token);
    uint256 totalBorrows = totalBorrowsStable.add(totalBorrowsVariable);
    (uint256 liquidityRate,,) = core.getReserveInterestRateStrategyAddress(token).calculateInterestRates(
      token,
      // Utilization rate
      totalBorrows == 0
        ? 0
        : totalBorrows.rayDiv(core.getReserveAvailableLiquidity(token).add(deposit).add(totalBorrows)),
      totalBorrowsStable,
      totalBorrowsVariable,
      core.getReserveCurrentAverageStableBorrowRate(token)
    );
    return liquidityRate / 1e9;
  }
}


library RayDiv {
  using LowGasSafeMath for uint256;
  uint256 internal constant RAY = 1e27;


  function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 halfB = b / 2;
    return halfB.add(a.mul(RAY)) / b;
  }
}