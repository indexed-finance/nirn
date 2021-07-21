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
  address internal constant comp = 0xc00e94Cb662C3520282E6f5717214004A7f26888;

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return "Compound";
  }

/* ========== Metadata ========== */

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
    ICToken cToken = ICToken(token);
    uint256 totalLiquidity = cToken.getCash().add(cToken.totalBorrows()).sub(cToken.totalReserves());
    return getRewardsAPR(ICToken(token), totalLiquidity);
  }

  function getAPR() public view virtual override returns (uint256) {
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

  function getRevenueBreakdown()
    external
    view
    override
    returns (
      address[] memory assets,
      uint256[] memory aprs
    )
  {
    uint256 rewardsAPR = getRewardsAPR();
    uint256 size = rewardsAPR > 0 ? 2 : 1;
    assets = new address[](size);
    aprs = new uint256[](size);
    assets[0] = underlying;
    aprs[0] = getAPR();
    if (rewardsAPR > 0) {
      assets[1] = comp;
      aprs[1] = rewardsAPR;
    }
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

  function _claimRewardsIfAny(address account) internal {
    address[] memory holders = new address[](1);
    address[] memory cTokens = new address[](1);
    holders[0] = account;
    cTokens[0] = token;
    comptroller.claimComp(holders, cTokens, false, true);
  }

  function _approve() internal virtual override {}

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    address _token = token;
    ICToken(_token).mint{value: amountUnderlying}();
    amountMinted = IERC20(_token).balanceOf(address(this));
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    require(ICToken(token).redeem(amountToken) == 0, "CEther: Burn failed");
    amountReceived = address(this).balance;
    _claimRewardsIfAny(msg.sender);
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = toWrappedAmount(amountUnderlying);
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(ICToken(token).redeemUnderlying(amountUnderlying) == 0, "CErc20: Burn failed");
    _claimRewardsIfAny(msg.sender);
  }
}