// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "./AbstractTokenAdapter.sol";
import "../interfaces/AaveV1Interfaces.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IERC20.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/TransferHelper.sol";


contract AaveV1Erc20Adapter is AbstractErc20Adapter {
  using LowGasSafeMath for uint256;
  using RayDiv for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  ILendingPoolAddressesProvider public immutable aave;

/* ========== Constructor ========== */

  constructor(ILendingPoolAddressesProvider _aave) AbstractErc20Adapter() {
    aave = _aave;
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    apr = aave.getLendingPoolCore().getReserveCurrentLiquidityRate(underlying) / 1e9;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    ILendingPoolCore core = aave.getLendingPoolCore();
    uint256 totalBorrowsStable = core.getReserveTotalBorrowsStable(underlying);
    uint256 totalBorrowsVariable = core.getReserveTotalBorrowsVariable(underlying);
    uint256 totalBorrows = totalBorrowsStable.add(totalBorrowsVariable);
    uint256 utilizationRate = totalBorrows == 0
      ? 0
      : totalBorrows.rayDiv(core.getReserveAvailableLiquidity(underlying).add(_deposit).add(totalBorrows));
    (uint256 liquidityRate,,) = core.getReserveInterestRateStrategyAddress(underlying).calculateInterestRates(
      token,
      // Utilization rate
      utilizationRate,
      totalBorrowsStable,
      totalBorrowsVariable,
      core.getReserveCurrentAverageStableBorrowRate(underlying)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Aave V1";
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApprove(address(aave.getLendingPoolCore()), type(uint256).max);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    amountMinted = amountUnderlying;
    aave.getLendingPool().deposit(underlying, amountUnderlying, 0);
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    amountReceived = amountToken;
    aave.getLendingPool().redeemUnderlying(underlying, address(this), amountToken, 0);
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    token.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountBurned = amountUnderlying;
    aave.getLendingPool().redeemUnderlying(underlying, address(this), amountUnderlying, 0);
  }
}

contract AaveV1EtherAdapter is AbstractEtherAdapter {
  using LowGasSafeMath for uint256;
  using RayDiv for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  address public constant ETH_RESERVE_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  ILendingPoolAddressesProvider public immutable aave;

/* ========== Constructor ========== */

  constructor(ILendingPoolAddressesProvider _aave) AbstractErc20Adapter() {
    aave = _aave;
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Aave V1";
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    apr = aave.getLendingPoolCore().getReserveCurrentLiquidityRate(ETH_RESERVE_ADDRESS) / 1e9;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    ILendingPoolCore core = aave.getLendingPoolCore();
    uint256 totalBorrowsStable = core.getReserveTotalBorrowsStable(ETH_RESERVE_ADDRESS);
    uint256 totalBorrowsVariable = core.getReserveTotalBorrowsVariable(ETH_RESERVE_ADDRESS);
    uint256 totalBorrows = totalBorrowsStable.add(totalBorrowsVariable);
    uint256 utilizationRate = totalBorrows == 0
      ? 0
      : totalBorrows.rayDiv(core.getReserveAvailableLiquidity(ETH_RESERVE_ADDRESS).add(_deposit).add(totalBorrows));
    (uint256 liquidityRate,,) = core.getReserveInterestRateStrategyAddress(ETH_RESERVE_ADDRESS).calculateInterestRates(
      token,
      // Utilization rate
      utilizationRate,
      totalBorrowsStable,
      totalBorrowsVariable,
      core.getReserveCurrentAverageStableBorrowRate(ETH_RESERVE_ADDRESS)
    );
    return liquidityRate / 1e9;
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

/* ========== Internal Ether Handlers ========== */
  
  // Convert to WETH if contract takes WETH
  function _afterReceiveETH(uint256 amount) internal virtual override {}

  // Convert to WETH if contract takes ETH
  function _afterReceiveWETH(uint256 amount) internal virtual override {
    IWETH(underlying).withdraw(amount);
  }

  // Convert to ETH if contract returns WETH
  function _beforeSendETH(uint256 amount) internal virtual override {}

  // Convert to WETH if contract returns ETH
  function _beforeSendWETH(uint256 amount) internal virtual override {
    IWETH(underlying).deposit{value: amount}();
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {}

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    amountMinted = amountUnderlying;
    aave.getLendingPool().deposit{value: amountUnderlying}(ETH_RESERVE_ADDRESS, amountUnderlying, 0);
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    amountReceived = amountToken;
    aave.getLendingPool().redeemUnderlying(ETH_RESERVE_ADDRESS, address(this), amountToken, 0);
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    token.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountBurned = amountUnderlying;
    aave.getLendingPool().redeemUnderlying(ETH_RESERVE_ADDRESS, address(this), amountUnderlying, 0);
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