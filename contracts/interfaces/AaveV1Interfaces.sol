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
  function getLendingPool() external view returns (ILendingPool);
}


interface ILendingPool {
  function deposit(address reserve, uint256 amount, uint16 referralCode) external payable;
  function redeemUnderlying(address reserve, address user, uint256 amount, uint256 aTokenBalanceAfterRedeem) external;
}

interface ILendingPoolCore {
  function getReserves() external view returns (address[] memory);
  function getReserveATokenAddress(address) external view returns (address);
  function getReserveCurrentLiquidityRate(address token) external view returns (uint256);
  function getReserveAvailableLiquidity(address token) external view returns (uint256);
  function getReserveTotalBorrowsStable(address token) external view returns (uint256);
  function getReserveTotalBorrowsVariable(address token) external view returns (uint256);
  function getReserveCurrentAverageStableBorrowRate(address token) external view returns (uint256);
  function getReserveInterestRateStrategyAddress(address token) external view returns (IReserveInterestRateStrategy);
}