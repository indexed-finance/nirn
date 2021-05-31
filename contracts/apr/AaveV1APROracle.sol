// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.7.6;
import "../libraries/LowGasSafeMath.sol";


contract RayDiv {
  using LowGasSafeMath for uint256;
  uint256 internal constant RAY = 1e27;


  function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 halfB = b / 2;
    return halfB.add(a.mul(RAY)) / b;
  }
}


contract AaveV1APROracle is RayDiv {
  using LowGasSafeMath for uint256;
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
        : rayDiv(totalBorrows, core.getReserveAvailableLiquidity(token).add(deposit).add(totalBorrows)),
      totalBorrowsStable,
      totalBorrowsVariable,
      core.getReserveCurrentAverageStableBorrowRate(token)
    );
    return liquidityRate / 1e9;
  }
}

interface IReserveInterestRateStrategy {
  function calculateInterestRates(
    address _reserve,
    uint256 _utilizationRate,
    uint256 _totalBorrowsStable,
    uint256 _totalBorrowsVariable,
    uint256 _averageStableBorrowRate
  )
    external
    view
    returns
  (
    uint256 liquidityRate,
    uint256 stableBorrowRate,
    uint256 variableBorrowRate
  );
}


interface ILendingPoolAddressesProvider {
  function getLendingPoolCore() external view returns (ILendingPoolCore);
}


interface ILendingPoolCore {
  function getReserveCurrentLiquidityRate(address token) external view returns (uint256);
  function getReserveAvailableLiquidity(address token) external view returns (uint256);
  function getReserveTotalBorrowsStable(address token) external view returns (uint256);
  function getReserveTotalBorrowsVariable(address token) external view returns (uint256);
  function getReserveCurrentAverageStableBorrowRate(address token) external view returns (uint256);
  function getReserveInterestRateStrategyAddress(address token) external view returns (IReserveInterestRateStrategy);
}