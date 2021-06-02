// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../libraries/TransferHelper.sol";
import "../interfaces/IERC20Metadata.sol";
import "../interfaces/IERC20.sol";


abstract contract AbstractErc20Adapter {
  using TransferHelper for address;

/* ========== Storage ========== */

  address public underlying;
  address public token;

/* ========== Constructor & Initializer ========== */

  constructor() {
    underlying = address(1);
    token = address(1);
  }

  function initialize(address _underlying, address _token) public virtual {
    require(underlying == address(0) && token == address(0), "initialized");
    require(_underlying != address(0) && _token != address(0), "bad address");
    underlying = _underlying;
    token = _token;
    _approve();
  }

/* ========== Internal Queries ========== */

  function _protocolName() internal view virtual returns (string memory);

/* ========== Metadata ========== */

  function name() external view virtual returns (string memory) {
    return string(abi.encodePacked(
      bytes(_protocolName()),
      " ",
      bytes(IERC20Metadata(underlying).symbol()),
      " Adapter"
    ));
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual returns (uint256);

  function getHypotheticalAPR(uint256 _deposit) external view virtual returns (uint256);

/* ========== Caller Balance Queries ========== */

  function tokenBalance() external view virtual returns (uint256) {
    return IERC20(token).balanceOf(msg.sender);
  }

  function underlyingBalance() external view virtual returns (uint256);

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) external virtual returns (uint256 amountMinted) {
    underlying.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    amountMinted = _mint(amountUnderlying);
    token.safeTransfer(msg.sender, amountMinted);
  }

  function withdraw(uint256 amountToken) external virtual returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = _burn(amountToken);
    underlying.safeTransfer(msg.sender, amountReceived);
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual returns (uint256 amountBurned) {
    amountBurned = _burnUnderlying(amountUnderlying);
    underlying.safeTransfer(msg.sender, amountUnderlying);
  }

/* ========== Internal Actions ========== */

  function _approve() internal virtual;

  /**
   * @dev Deposit `amountUnderlying` into the wrapper and return the amount of wrapped tokens received.
   * Note:
   * - Called after the underlying token is transferred.
   * - Should not transfer minted token to caller.
   */
  function _mint(uint256 amountUnderlying) internal virtual returns (uint256 amountMinted);

  /**
   * @dev Burn `amountToken` of `token` and return the amount of `underlying` received.
   * Note:
   * - Called after the wrapper token is transferred.
   * - Should not transfer underlying token to caller.
   */
  function _burn(uint256 amountToken) internal virtual returns (uint256 amountReceived);

  /**
   * @dev Redeem `amountUnderlying` of the underlying token and return the amount of wrapper tokens burned.
   * Note:
   * - Should transfer the wrapper token from the caller.
   * - Should not transfer underlying token to caller.
   */
  function _burnUnderlying(uint256 amountUnderlying) internal virtual returns (uint256 amountBurned);
}

abstract contract AbstractEtherAdapter is AbstractErc20Adapter {
  using TransferHelper for address;

/* ========== Metadata ========== */

  function name() external view virtual override returns (string memory) {
    return string(abi.encodePacked(
      bytes(_protocolName()),
      " Ether Adapter"
    ));
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) external virtual override returns (uint256 amountMinted) {
    underlying.safeTransferFrom(msg.sender, address(this), amountUnderlying);
    _afterReceiveWETH(amountUnderlying);
    amountMinted = _mint(amountUnderlying);
    token.safeTransfer(msg.sender, amountMinted);
  }

  function depositETH() external virtual payable returns (uint256 amountMinted) {
    _afterReceiveETH(msg.value);
    amountMinted = _mint(msg.value);
    token.safeTransfer(msg.sender, amountMinted);
  }

  function withdraw(uint256 amountToken) external virtual override returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = _burn(amountToken);
    _beforeSendWETH(amountReceived);
    underlying.safeTransfer(msg.sender, amountReceived);
  }

  function withdrawAsETH(uint256 amountToken) external virtual returns (uint256 amountReceived) {
    token.safeTransferFrom(msg.sender, address(this), amountToken);
    amountReceived = _burn(amountToken);
    _beforeSendETH(amountReceived);
    address(msg.sender).safeTransferETH(amountReceived);
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    amountBurned = _burnUnderlying(amountUnderlying);
    _beforeSendWETH(amountUnderlying);
    underlying.safeTransfer(msg.sender, amountUnderlying);
  }

  function withdrawUnderlyingAsETH(uint256 amountUnderlying) external virtual returns (uint256 amountBurned) {
    amountBurned = _burnUnderlying(amountUnderlying);
    _beforeSendETH(amountUnderlying);
    address(msg.sender).safeTransferETH(amountUnderlying);
  }

/* ========== Internal Ether Handlers ========== */
  
  // Convert to WETH if contract takes WETH
  function _afterReceiveETH(uint256 amount) internal virtual;

  // Convert to WETH if contract takes ETH
  function _afterReceiveWETH(uint256 amount) internal virtual;

  // Convert to ETH if contract returns WETH
  function _beforeSendETH(uint256 amount) internal virtual;

  // Convert to WETH if contract returns ETH
  function _beforeSendWETH(uint256 amount) internal virtual;
}