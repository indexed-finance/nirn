// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "./AbstractTokenAdapter.sol";
import "../interfaces/FulcrumInterfaces.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/TransferHelper.sol";


contract FulcrumErc20Adapter is AbstractErc20Adapter() {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    return IToken(token).supplyInterestRate() / 100;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    return IToken(token).nextSupplyInterestRate(_deposit) / 100;
  }

/* ========== Caller Balance Queries ========== */

  function underlyingBalance() external view virtual override returns (uint256) {
    return IToken(token).assetBalanceOf(msg.sender);
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal pure virtual override returns (string memory) {
    return "Fulcrum";
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) external virtual override returns (uint256 amountMinted) {
    underlying.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountMinted = IToken(token).mint(msg.sender, amountUnderlying);
    require(amountMinted > 0, "IToken: Mint failed");
  }

  function withdraw(uint256 amountToken) external virtual override returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = IToken(token).burn(msg.sender, amountToken);
    require(amountReceived > 0, "IToken: Burn failed");
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    uint256 currentPrice = IToken(token).tokenPrice();
    amountBurned = amountUnderlying.mul(1e18) / currentPrice;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(IToken(token).burn(address(this), amountBurned) > 0, "IToken: Burn failed");
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApprove(token, type(uint256).max);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256) {}

  function _burn(uint256 amountToken) internal virtual override returns (uint256) {}

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256) {}
}