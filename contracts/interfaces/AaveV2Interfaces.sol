// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;
pragma abicoder v2;


interface ISupply {
  function totalSupply() external view returns (uint256);
}


interface ILendingPoolAddressesProvider {
  function getLendingPool() external view returns (ILendingPool);
}


interface IVariableDebtToken {
  function scaledTotalSupply() external view returns (uint256);
}


interface IReserveInterestRateStrategy {
  function calculateInterestRates(
    address reserve,
    address aToken,
    uint256 liquidityAdded,
    uint256 liquidityTaken,
    uint256 totalStableDebt,
    uint256 totalVariableDebt,
    uint256 averageStableBorrowRate,
    uint256 reserveFactor
  )
    external
    view
    returns (
      uint256 liquidityRate,
      uint256 stableBorrowRate,
      uint256 variableBorrowRate
    );
}


interface IStableDebtToken {
  function getTotalSupplyAndAvgRate() external view returns (uint256, uint256);
}


interface ILendingPool {
  struct ReserveConfigurationMap {
    uint256 data;
  }

  struct ReserveData {
    ReserveConfigurationMap configuration;
    uint128 liquidityIndex;
    uint128 variableBorrowIndex;
    uint128 currentLiquidityRate;
    uint128 currentVariableBorrowRate;
    uint128 currentStableBorrowRate;
    uint40 lastUpdateTimestamp;
    address aTokenAddress;
    IStableDebtToken stableDebtToken;
    IVariableDebtToken variableDebtToken;
    IReserveInterestRateStrategy interestRateStrategy;
    uint8 id;
  }

  function getReserveNormalizedIncome(address asset) external view returns (uint128);

  function getReserveData(address asset) external view returns (ReserveData memory);

  function getReservesList() external view returns (address[] memory);
}