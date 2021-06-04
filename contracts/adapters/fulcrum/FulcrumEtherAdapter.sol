// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../../interfaces/ITokenAdapter.sol";
import "../../interfaces/FulcrumInterfaces.sol";
import "../../interfaces/IERC20Metadata.sol";
import "../../interfaces/IERC20.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";


contract FulcrumEtherAdapter is IEtherAdapter {
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  address public override underlying;
  address public override token;

/* ========== Storage ========== */

  string public override name = "Fulcrum Ether Adapter";

/* ========== Constructor & Initializer ========== */

  constructor(address _underlying, address _token) {
    underlying = _underlying;
    token = _token;
    _underlying.safeApprove(token, type(uint256).max);
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    return IToken(token).supplyInterestRate() / 100;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    return IToken(token).nextSupplyInterestRate(_deposit) / 100;
  }

/* ========== Caller Balance Queries ========== */

  function tokenBalance() external view virtual override returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

  function underlyingBalance() external view virtual override returns (uint256) {
    return IToken(token).assetBalanceOf(msg.sender);
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) external virtual override returns (uint256 amountMinted) {
    underlying.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountMinted = IToken(token).mint(msg.sender, amountUnderlying);
    require(amountMinted > 0, "IToken: Mint failed");
  }

  function depositETH() external payable virtual override returns (uint256 amountMinted) {
    amountMinted = IToken(token).mintWithEther{value: msg.value}(msg.sender);
    require(amountMinted > 0, "IToken: Mint failed");
  }

  function withdraw(uint256 amountToken) external virtual override returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = IToken(token).burn(msg.sender, amountToken);
    require(amountReceived > 0, "IToken: Burn failed");
  }

  function withdrawAsETH(uint256 amountToken) external virtual override returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = IToken(token).burnToEther(msg.sender, amountToken);
    require(amountReceived > 0, "IToken: Burn failed");
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    uint256 currentPrice = IToken(token).tokenPrice();
    amountBurned = amountUnderlying.mul(1e18) / currentPrice;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(IToken(token).burn(msg.sender, amountBurned) > 0, "IToken: Burn failed");
  }

  function withdrawUnderlyingAsETH(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    uint256 currentPrice = IToken(token).tokenPrice();
    amountBurned = amountUnderlying.mul(1e18) / currentPrice;
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    require(IToken(token).burnToEther(msg.sender, amountBurned) > 0, "IToken: Burn failed");
  }
}