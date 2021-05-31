// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma abicoder v2;


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