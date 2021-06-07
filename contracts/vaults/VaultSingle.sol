// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/IAdapterRegistry.sol";
import "../interfaces/ITokenAdapter.sol";
import "../interfaces/IERC20.sol";
import "../libraries/TransferHelper.sol";
import "./ERC20.sol";


contract VaultSingle is ERC20 {
  using TransferHelper for address;
  using LowGasSafeMath for uint256;

  IAdapterRegistry public immutable registry;
  address public immutable underlying;
  IErc20Adapter public adapter;

  constructor(address _registry, address _underlying) {
    registry = IAdapterRegistry(_registry);
    underlying = _underlying;
    (address _adapter,) = IAdapterRegistry(_registry).getAdapterWithHighestAPR(_underlying);
    adapter = IErc20Adapter(_adapter);
    _underlying.safeApproveMax(_adapter);
    IErc20Adapter(_adapter).token().safeApproveMax(_adapter);
  }

  function deposit(uint256 amount) external returns (uint256 shares) {
    uint256 bal = balanceUnderlying();
    uint256 t = totalSupply;
    shares = t == 0 ? amount : (amount.mul(t) / bal);
    underlying.safeTransferFrom(msg.sender, address(this), amount);
    _mint(msg.sender, shares);
  }

  function withdraw(uint256 shares) external returns (uint256 redeemed) {
    IErc20Adapter _adapter = IErc20Adapter(adapter);
    redeemed = shares.mul(_adapter.balanceWrapped()) / totalSupply;
    _burn(msg.sender, shares);
    underlying.safeTransfer(msg.sender, shares);
  }

  function getAPR() external view returns (uint256) {
    return adapter.getAPR();
  }

  function getHypotheticalAPR(int256 liquidityDelta) external view returns (uint256) {
    return adapter.getHypotheticalAPR(liquidityDelta);
  }

  function rebalance() external {
    IErc20Adapter oldAdapter = adapter;
    // Get highest APR adapter for hypothetical deposit of `balanceUnderlying()`,
    // using current APR for the adapter already in use.
    (address newAdapter,) = registry.getAdapterWithHighestAPRForDeposit(
      underlying,
      oldAdapter.balanceUnderlying(),
      address(oldAdapter)
    );
    if (newAdapter != address(oldAdapter)) {
      // Burn all tokens in the old wrapper
      uint256 amountRedeemed = oldAdapter.withdrawAll();
      // Remove approvals for old adapter
      underlying.safeUnapprove(address(oldAdapter));
      oldAdapter.token().safeUnapprove(address(oldAdapter));
      // Set approvals for new adapter
      underlying.safeApproveMax(newAdapter);
      IErc20Adapter(newAdapter).token().safeApproveMax(newAdapter);
      // Deposit all and set adapter
      IErc20Adapter(newAdapter).deposit(amountRedeemed);
      adapter = IErc20Adapter(newAdapter);
    }
  }

  function balance() public view returns (uint256) {
    return adapter.balanceWrapped();
  }

  function balanceUnderlying() public view returns (uint256) {
    return adapter.balanceUnderlying().add(IERC20(underlying).balanceOf(address(this)));
  }

  function getPricePerFullShare() external view returns (uint256) {
    return balanceUnderlying().mul(1e18) / totalSupply;
  }
}