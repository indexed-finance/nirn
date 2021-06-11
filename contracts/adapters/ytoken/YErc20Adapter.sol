// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../AbstractErc20Adapter.sol";
import "../../interfaces/YearnInterfaces.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IWETH.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/SignedAddition.sol";

contract YErc20Adapter is AbstractErc20Adapter() {
  using SignedAddition for uint256;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Storage ========== */

  string internal __protocolName;
  uint internal __previousPPFSTimestamp;
  uint256 internal __previousPPFS;

 
/* ========== Initializer ========== */

function initialize(
    address _underlying,
    address _token,
    string memory protocolName
  ) public {
    super.initialize(_underlying, _token);
    __protocolName = protocolName;
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return __protocolName;
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256) {

    uint256 currentPPFS = IVault(token).getPricePerFullShare();
    uint currentPPFSTimeStamp = block.timestamp;

    if (currentPPFSTimeStamp - __previousPPFSTimestamp > 0) {
      return (currentPPFS - __previousPPFS)/(currentPPFSTimeStamp - __previousPPFSTimestamp);
    }
    else {
      return 0;
    }
  }


//safe math library safecast
  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256) {
    uint256 currentTotalSupply = IERC20(token).totalSupply();
    require (int256(currentTotalSupply) + liquidityDelta != 0);
    uint256 APRForTotalSupply = (this.getAPR()).mul(currentTotalSupply);
    uint256 totalSupplyAndLiquidityDelta = uint256(currentTotalSupply.add(liquidityDelta));
    return  APRForTotalSupply/totalSupplyAndLiquidityDelta;
  
  }

/* ========== Caller Balance Queries ========== */

  function balanceUnderlying() external view virtual override returns (uint256) {
    address _token = token;
    return IERC20(_token).balanceOf(msg.sender).mul(IVault(_token).getPricePerFullShare()) / 1e18;
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual override {
    underlying.safeApproveMax(token);
  }

  function _mint(uint256 amountUnderlying) internal virtual override returns (uint256 amountMinted) {
    address _token = token;
    IVault(_token).deposit(amountUnderlying);
    amountMinted = IERC20(_token).balanceOf(address(this));

    if (block.timestamp - __previousPPFSTimestamp > 86400) {
      __previousPPFSTimestamp = block.timestamp;
      __previousPPFS = IVault(token).getPricePerFullShare();
    }
  }

  function _burn(uint256 amountToken) internal virtual override returns (uint256 amountReceived) {
    IVault(token).withdraw(amountToken);
    amountReceived = IERC20(underlying).balanceOf(address(this));
  }

  function _burnUnderlying(uint256 amountUnderlying) internal virtual override returns (uint256 amountBurned) {
    amountBurned = amountUnderlying.mul(1e18) / IVault(token).getPricePerFullShare();
    token.safeTransferFrom(msg.sender, address(this), amountBurned);
    IVault(token).withdraw(amountUnderlying);
  }
}