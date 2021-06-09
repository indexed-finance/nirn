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
  uint256 internal __previousPPFSTimestamp;
  uint256 internal __previousPPFS;
  uint256 internal __previousTotalSupply;


/* ========== Initializer ========== */

  function initialize(
    address _underlying,
    address _token,
    string memory protocolName
  ) public {
    super.initialize(_underlying, _token);
    __protocolName = protocolName;
    __previousPPFS == 0;
    __previousPPFSTimestamp = 0;
    __previousTotalSupply = 0;
  }


/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual override returns (string memory) {
    return __protocolName;
  }

  function _previousPPFS() internal view virtual  returns (uint256 ) {
    return __previousPPFS;
  }

  function _previousPPFSTimestamp() internal view virtual  returns (uint256 ) {
    return __previousPPFSTimestamp;
  }

  function _previousTotalSupply() internal view virtual  returns (uint256 ) {
    return __previousTotalSupply;
  }
/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256) {

    uint256 currentPPFS = IVault(token).getPricePerFullShare();
    uint256 currentPPFSTimeStamp = block.timestamp;

    if (currentPPFSTimeStamp - _previousPPFSTimestamp() > 0) {
      return (currentPPFS - _previousPPFS())/(currentPPFSTimeStamp - _previousPPFSTimestamp());
    }

  }


  function getHypotheticalAPR(int256 liquidityDelta) external view virtual override returns (uint256) {
    IYearnRegistry yToken = IYearnRegistry(token);

    uint256 currentTotalSupply = IERC20(_token).totalSupply();

  return 1;
  
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

    if (block.timestamp - _previousPPFSTimestamp() > 86400) {
      __previousPPFSTimestamp = block.timestamp;
      __previousPPFS = IVault(token).getPricePerFullShare();
      __previousTotalSupply = IERC20(_token).totalSupply();
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