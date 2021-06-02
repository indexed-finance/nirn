// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./AbstractTokenAdapter.sol";
import "../interfaces/AaveV2Interfaces.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IERC20.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/TransferHelper.sol";


contract AaveV2Erc20Adapter is AbstractErc20Adapter {
  using LowGasSafeMath for uint256;
  using RayMul for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  ILendingPoolAddressesProvider public immutable aave;

/* ========== Constructor ========== */

  constructor(ILendingPoolAddressesProvider _aave) AbstractErc20Adapter() {
    aave = _aave;
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Aave V2";
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(underlying);
    apr = reserve.currentLiquidityRate / 1e9;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(underlying);
    uint256 totalVariableDebt = reserve.variableDebtToken.scaledTotalSupply()
      .rayMul(reserve.variableBorrowIndex);
    (uint256 totalStableDebt, uint256 avgStableRate) = reserve.stableDebtToken
      .getTotalSupplyAndAvgRate();
    (uint256 liquidityRate, ,) = reserve.interestRateStrategy.calculateInterestRates(
      underlying,
      reserve.aTokenAddress,
      _deposit,
      0,
      totalStableDebt,
      totalVariableDebt,
      avgStableRate,
      ReserveConfigurationLib.getReserveFactor(reserve.configuration)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApprove(address(aave.getLendingPool()), type(uint256).max);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    aave.getLendingPool().deposit(underlying, amountUnderlying, address(this), 0);
    amountMinted = amountUnderlying;
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    aave.getLendingPool().withdraw(underlying, amountToken, address(this));
    amountReceived = amountToken;
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    aave.getLendingPool().withdraw(underlying, amountUnderlying, address(this));
  }
}


contract AaveV2EtherAdapter is AbstractEtherAdapter {
  using LowGasSafeMath for uint256;
  using RayMul for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  ILendingPoolAddressesProvider public immutable aave;

/* ========== Constructor ========== */

  constructor(ILendingPoolAddressesProvider _aave) AbstractErc20Adapter() {
    aave = _aave;
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Aave V2";
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(underlying);
    apr = reserve.currentLiquidityRate / 1e9;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    ILendingPool pool = aave.getLendingPool();
    ILendingPool.ReserveData memory reserve = pool.getReserveData(underlying);
    uint256 totalVariableDebt = reserve.variableDebtToken.scaledTotalSupply()
      .rayMul(reserve.variableBorrowIndex);
    (uint256 totalStableDebt, uint256 avgStableRate) = reserve.stableDebtToken
      .getTotalSupplyAndAvgRate();
    (uint256 liquidityRate, ,) = reserve.interestRateStrategy.calculateInterestRates(
      underlying,
      reserve.aTokenAddress,
      _deposit,
      0,
      totalStableDebt,
      totalVariableDebt,
      avgStableRate,
      ReserveConfigurationLib.getReserveFactor(reserve.configuration)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Ether Handlers ========== */
  
  function _afterReceiveETH(uint256 amount) internal virtual override {
    IWETH(underlying).deposit{value: amount}();
  }

  function _afterReceiveWETH(uint256 amount) internal virtual override {}

  function _beforeSendETH(uint256 amount) internal virtual override {
    IWETH(underlying).withdraw(amount);
  }

  function _beforeSendWETH(uint256 amount) internal virtual override {}

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApprove(address(aave.getLendingPool()), type(uint256).max);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    aave.getLendingPool().deposit(underlying, amountUnderlying, address(this), 0);
    amountMinted = amountUnderlying;
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    aave.getLendingPool().withdraw(underlying, amountToken, address(this));
    amountReceived = amountToken;
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    aave.getLendingPool().withdraw(underlying, amountUnderlying, address(this));
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