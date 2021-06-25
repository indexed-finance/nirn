// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractEtherAdapter.sol";
import "../../interfaces/CompoundInterfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/MinimalSignedMath.sol";
import { CTokenParams } from "../../libraries/CTokenParams.sol";


contract CEtherAdapter is AbstractEtherAdapter() {
  using MinimalSignedMath for uint256;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  IComptroller public comptroller = IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
  address public constant cComp = 0x70e36f6BF80a52b3B46b3aF8e106CC0ed743E8e4;

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Compound";
  }

/* ========== Metadata ========== */

  function totalLiquidity() public view override returns (uint256) {
    ICToken cToken = ICToken(token);
    return cToken.getCash().add(cToken.totalBorrows()).sub(cToken.totalReserves());
  }

  function availableLiquidity() public view override returns (uint256) {
    return address(token).balance;
  }

/* ========== Conversion Queries ========== */

  function toUnderlyingAmount(uint256 tokenAmount) public view override returns (uint256) {
    return (
      tokenAmount.mul(CTokenParams.currentExchangeRate(token))
      / (10 ** (10 + IERC20Metadata(underlying).decimals()))
    );
  }

  function toWrappedAmount(uint256 underlyingAmount) public view override returns (uint256) {
    return underlyingAmount
      .mul(10 ** (10 + IERC20Metadata(underlying).decimals()))
      .divCeil(CTokenParams.currentExchangeRate(token));
  }

/* ========== Performance Queries ========== */

  function getRewardsAPR(
    ICToken cToken,
    uint256 _totalLiquidity
  ) internal view returns (uint256) {
    IPriceOracle oracle = comptroller.oracle();
    uint256 compPrice = oracle.getUnderlyingPrice(cComp);
    uint256 tokenPrice = oracle.getUnderlyingPrice(address(cToken));
    if (compPrice == 0 || tokenPrice == 0) return 0;
    uint256 annualRewards = comptroller.compSpeeds(address(cToken)).mul(2102400).mul(compPrice);
    return annualRewards.mul(1e18) / _totalLiquidity.mul(tokenPrice);
  }

  function getRewardsAPR() public view returns (uint256) {
    return getRewardsAPR(ICToken(token), totalLiquidity());
  }

  function getAPR() external view virtual override returns (uint256) {
    ICToken cToken = ICToken(token);
    return cToken.supplyRatePerBlock().mul(2102400).add(getRewardsAPR());
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256) {
    ICToken cToken = ICToken(token);
    (
      address model,
      uint256 cashPrior,
      uint256 borrowsPrior,
      uint256 reservesPrior,
      uint256 reserveFactorMantissa
    ) = CTokenParams.getInterestRateParameters(address(cToken));
    uint256 liquidityTotal = cashPrior.add(liquidityDelta).add(borrowsPrior).sub(reservesPrior);

    return IInterestRateModel(model).getSupplyRate(
      cashPrior.add(liquidityDelta),
      borrowsPrior,
      reservesPrior,
      reserveFactorMantissa
    ).mul(2102400).add(getRewardsAPR(cToken, liquidityTotal));
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    return ICToken(token).balanceOf(msg.sender).mul(ICToken(token).exchangeRateStored()) / 1e18;
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
    address _token = token;
    ICToken(_token).mint{value: amountUnderlying}();
    amountMinted = IERC20(_token).balanceOf(address(this));
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    require(ICToken(token).redeem(amountToken) == 0, "CEther: Burn failed");
    amountReceived = address(this).balance;
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = toWrappedAmount(amountUnderlying);
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(ICToken(token).redeemUnderlying(amountUnderlying) == 0, "CErc20: Burn failed");
  }
}