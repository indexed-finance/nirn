// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;
import "../interfaces/AaveV2Interfaces.sol";


contract AaveV2APROracle {
  using RayMul for uint256;
  ILendingPoolAddressesProvider public immutable aave;

  string public name = "Aave V2 APR Oracle";

  constructor(ILendingPoolAddressesProvider _aave) {
    aave = _aave;
  }

  function getAPR(address token) external view returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(token);
    apr = reserve.currentLiquidityRate / 1e9;
  }

  function getHypotheticalAPR(address token, uint256 deposit) external view returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(token);
    uint256 totalVariableDebt = reserve.variableDebtToken.scaledTotalSupply()
      .rayMul(reserve.variableBorrowIndex);
    (uint256 totalStableDebt, uint256 avgStableRate) = reserve.stableDebtToken
      .getTotalSupplyAndAvgRate();
    (uint256 liquidityRate, ,) = reserve.interestRateStrategy.calculateInterestRates(
      token,
      reserve.aTokenAddress,
      deposit,
      0,
      totalStableDebt,
      totalVariableDebt,
      avgStableRate,
      ReserveConfigurationLib.getReserveFactor(reserve.configuration)
    );
    return liquidityRate / 1e9;
  }
}


library ReserveConfigurationLib {
  uint256 internal constant RESERVE_FACTOR_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000FFFFFFFFFFFFFFFF; // prettier-ignore
  uint256 internal constant RESERVE_FACTOR_START_BIT_POSITION = 64;

  /**
   * @dev Gets the reserve factor of the reserve
   * @param self The reserve configuration
   * @return The reserve factor
   **/
  function getReserveFactor(ILendingPool.ReserveConfigurationMap memory self)
    internal
    pure
    returns (uint256)
  {
    return (self.data & ~RESERVE_FACTOR_MASK) >> RESERVE_FACTOR_START_BIT_POSITION;
  }
}


library RayMul {
  uint256 internal constant RAY = 1e27;
  uint256 internal constant halfRAY = RAY / 2;

  /**
   * @dev Multiplies two ray, rounding half up to the nearest ray
   * @param a Ray
   * @param b Ray
   * @return The result of a*b, in ray
   **/
  function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
    if (a == 0 || b == 0) {
      return 0;
    }

    require(a <= (type(uint256).max - halfRAY) / b, "rayMul overflow");

    return (a * b + halfRAY) / RAY;
  }
}