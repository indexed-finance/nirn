// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/IAdapterRegistry.sol";
import "../interfaces/ITokenAdapter.sol";
import "../interfaces/IERC20.sol";
import "../libraries/TransferHelper.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/APRNet.sol";
import "../libraries/MinimalSignedMath.sol";
import "../libraries/Fraction.sol";
import "./ERC20.sol";


contract NirnVault is ERC20 {
  using Fraction for uint256;
  using TransferHelper for address;
  using LowGasSafeMath for uint256;
  using MinimalSignedMath for uint256;
  using MinimalSignedMath for int256;

/* ========== Constants ========== */

  IAdapterRegistry public constant registry = IAdapterRegistry(address(0));
  /** @dev Address of a contract which can only execute specific functions and only allows EOAs to call. */
  address public constant EOA_SAFE_CALLER = address(0);

/* ========== Storage ========== */

  address public feeRecipient;
  /** @dev Underlying asset for the vault. */
  address public underlying;
  /** @dev Token adapters for the underlying token. */
  IErc20Adapter[] public adapters;
  /** @dev Weights for adapters at corresponding index as a fraction of 1e18 (sum must be 1e18). */
  uint256[] public weights;
  /** @dev Ratio of underlying token to keep in the vault for cheap deposits as a fraction of 1e18. */
  uint256 public reserveRatio;
  /** @dev Tokens which can not be sold - wrapper tokens used by the adapters. */
  mapping(address => bool) public lockedTokens;
  /** @dev Average amount of `underlying` paid to mint vault tokens. */
  uint256 public averageEntryPrice;
  /** @dev Last price at which fees were taken. */
  uint256 public priceAtLastFee;
  /** @dev Fee taken on profit as a fraction of 1e18. */
  uint256 public performanceFee;

/* ========== Modifiers ========== */

  /**
   * @dev Prevents calls from arbitrary contracts.
   * Caller must be an EOA account or a pre-approved "EOA-safe" caller,
   * meaning a smart contract which can only be called by an EOA and has
   * a limited set of functions it can call.
   * This prevents griefing via flash loans that force the vault to use
   * adapters with low interest rates.
   */
  modifier onlyEOA {
    require(msg.sender == tx.origin || msg.sender == EOA_SAFE_CALLER, "!EOA");
    _;
  }

/* ========== Underlying Balance Queries ========== */

  function getBalances() public view returns (uint256[] memory balances) {
    return _getBalances(adapters);
  }

  /**
   * @dev 
   */
  function balance() public view returns (uint256 sum) {
    uint256 len = adapters.length;
    for (uint256 i; i < len; i++) {
      sum = sum.add(adapters[i].balanceUnderlying());
    }
    sum = sum.add(IERC20(underlying).balanceOf(address(this)));
  }

  function _getBalances(IErc20Adapter[] memory _adapters) internal view returns (uint256[] memory balances) {
    uint256 len = _adapters.length;
    balances = new uint256[](len);
    for (uint256 i; i < len; i++) {
      balances[i] = _adapters[i].balanceUnderlying();
    }
  }

  function _getRebalanceParameters()
    internal
    view
    returns (
      IErc20Adapter[] memory _adapters,
      uint256[] memory _balances,
      uint256 totalAvailableBalance
    )
  {
    _adapters = adapters;
    _balances = _getBalances(_adapters);
    uint256 totalBalance = APRNet.sum(_balances).add(IERC20(underlying).balanceOf(address(this)));
    totalAvailableBalance = totalBalance.sub(totalBalance.mulFractionE18(reserveRatio));
  }

/* ========== Rebalance Queries ========== */

  function getCurrentLiquidityDeltas() external view returns (int256[] memory liquidityDeltas) {
    (, uint256[] memory balances, uint256 totalAvailableBalance) = _getRebalanceParameters();
    liquidityDeltas = APRNet.calculateLiquidityDeltas(totalAvailableBalance, balances, weights);
  }

  function getHypotheticalLiquidityDeltas(
    uint256[] memory proposedWeights
  ) external view returns (int256[] memory liquidityDeltas) {
    (, uint256[] memory balances, uint256 totalAvailableBalance) = _getRebalanceParameters();
    require(proposedWeights.length == balances.length, "bad lengths");
    liquidityDeltas = APRNet.calculateLiquidityDeltas(totalAvailableBalance, balances, proposedWeights);
  }

  function getHypotheticalLiquidityDeltas(
    IErc20Adapter[] memory proposedAdapters,
    uint256[] memory proposedWeights
  ) external view returns (int256[] memory liquidityDeltas) {
    require(proposedAdapters.length == proposedWeights.length, "bad lengths");
    (, uint256[] memory balances, uint256 totalAvailableBalance) = _getRebalanceParameters();
    liquidityDeltas = APRNet.calculateLiquidityDeltas(totalAvailableBalance, balances, proposedWeights);
  }

/* ========== APR Queries ========== */

  function getAPR() external view returns (uint256) {
    (
      IErc20Adapter[] memory _adapters,
      uint256[] memory _balances,
      uint256 totalAvailableBalance
    ) = _getRebalanceParameters();
    uint256[] memory _weights = weights;
    int256[] memory liquidityDeltas = APRNet.calculateLiquidityDeltas(totalAvailableBalance, _balances, _weights);
    return APRNet.getNetAPR(_adapters, _weights, liquidityDeltas);
  }

  function getHypotheticalAPR(uint256[] memory proposedWeights) external view returns (uint256) {
    (
      IErc20Adapter[] memory _adapters,
      uint256[] memory _balances,
      uint256 totalAvailableBalance
    ) = _getRebalanceParameters();
    require(proposedWeights.length == _adapters.length, "bad lengths");
    int256[] memory liquidityDeltas = APRNet.calculateLiquidityDeltas(totalAvailableBalance, _balances, proposedWeights);
    return APRNet.getNetAPR(_adapters, proposedWeights, liquidityDeltas);
  }

  function getHypotheticalAPR(
    IErc20Adapter[] memory proposedAdapters,
    uint256[] memory proposedWeights
  ) external view returns (uint256) {
    require(proposedAdapters.length == proposedWeights.length, "bad lengths");
    (,,uint256 totalAvailableBalance) = _getRebalanceParameters();
    int256[] memory liquidityDeltas = APRNet.calculateLiquidityDeltas(
      totalAvailableBalance,
       _getBalances(proposedAdapters),
      proposedWeights
    );
    return APRNet.getNetAPR(proposedAdapters, proposedWeights, liquidityDeltas);
  }

/* ========== Fees ========== */

  function calculateFee(uint256 supply, uint256 bal, uint256 shares) internal view returns (uint256 fee) {
    uint256 lastPrice = priceAtLastFee;
    uint256 priceNow = bal.toFractionE18(supply);
    if (priceNow <= lastPrice) return 0;
    uint256 profitPerShare = priceNow - lastPrice;
    uint256 profit = shares.mulFractionE18(profitPerShare);
    return profit.mulFractionE18(performanceFee);
  }

  function getPendingFees() external view returns (uint256) {
    uint256 bal = balance();
    uint256 supply = totalSupply;
    return calculateFee(supply, bal, supply);
  }

  function takeProfitFee() external {
    uint256 lastPrice = priceAtLastFee;
    uint256 bal = balance();
    uint256 supply = totalSupply;
    uint256 priceNow = bal.toFractionE18(supply);
    if (priceNow <= lastPrice) return;
    uint256 profitPerShare = priceNow - lastPrice;
    uint256 totalProfit = supply.mulFractionE18(profitPerShare);
    uint256 profitFee = totalProfit.mulFractionE18(performanceFee);
    lastPrice = bal.sub(profitFee).toFractionE18(supply);
    _transferOut(feeRecipient, profitFee);
  }

/* ========== Mint/Burn ========== */

  function deposit(uint256 amount) external returns (uint256 shares) {
    uint256 bal = balance();
    underlying.safeTransferFrom(msg.sender, address(this), amount);
    uint256 supply = totalSupply;
    shares = supply == 0 ? amount : (amount.mul(totalSupply) / bal);
    _mint(msg.sender, shares);
  }

  function depositTo(uint256 amount, address to) external returns (uint256) {
    uint256 bal = balance();
    underlying.safeTransferFrom(msg.sender, address(this), amount);
    uint256 supply = totalSupply;
    uint256 shares = supply == 0 ? amount : (amount.mul(supply) / bal);
    _mint(to, shares);
  }

  function withdraw(uint256 shares) external returns (uint256 owed) {
    IErc20Adapter[] memory _adapters = adapters;
    uint256[] memory _balances = _getBalances(_adapters);
    uint256 reserveBalance = IERC20(underlying).balanceOf(address(this));
    uint256 totalBalance = APRNet.sum(_balances).add(reserveBalance);
    uint256 supply = totalSupply;
    uint256 fee = calculateFee(supply, totalBalance, shares);
    owed = shares.mul(totalBalance) / supply;
    _burn(msg.sender, shares);
    _withdrawToMatchAmount(_adapters, reserveBalance, _balances, owed);
    _transferOut(feeRecipient, fee);
    owed = owed.sub(fee);
    _transferOut(msg.sender, owed);
  }

  function _withdrawToMatchAmount(
    IErc20Adapter[] memory _adapters,
    uint256 reserveBalance,
    uint256[] memory balances,
    uint256 amount
  ) internal {
    if (amount > reserveBalance) {
      uint256 remainder = amount.sub(reserveBalance);
      uint256 len = balances.length;
      for (uint256 i; i < len; i++) {
        uint256 bal = balances[i];
        if (remainder > bal) {
          remainder = remainder.sub(bal);
          _adapters[i].withdrawAll();
        } else {
          _adapters[i].withdrawUnderlying(remainder);
          break;
        }
      }
    }
  }

/* ========== Price Queries ========== */

  function getPricePerFullShare() public view returns (uint256) {
    return balance().toFractionE18(totalSupply);
  }

  function getPricePerFullShareWithFee() public view returns (uint256) {
    uint256 bal = balance();
    uint256 supply = totalSupply;
    uint256 pendingFee = calculateFee(supply, bal, supply);
    return bal.sub(pendingFee).toFractionE18(supply);
  }

/* ========== Rebalance Actions ========== */

  function rebalance() external onlyEOA {
    IErc20Adapter[] memory _adapters = adapters;
    uint256[] memory balances = _getBalances(_adapters);
    uint256 totalBalance = APRNet.sum(balances).add(IERC20(underlying).balanceOf(address(this)));
    int256[] memory liquidityDeltas = APRNet.calculateLiquidityDeltas(totalBalance, balances, weights);
    APRNet.rebalance(_adapters, liquidityDeltas);
  }

  function rebalanceWithNewWeights(uint256[] memory proposedWeights) external onlyEOA {
    APRNet.validateWeights(proposedWeights);
    IErc20Adapter[] memory _adapters = adapters;
    uint256[] memory balances = _getBalances(_adapters);
    uint256 totalBalance = APRNet.sum(balances).add(IERC20(underlying).balanceOf(address(this)));
    int256[] memory liquidityDeltasCurrent = APRNet.calculateLiquidityDeltas(totalBalance, balances, weights);
    int256[] memory liquidityDeltasProposed = APRNet.calculateLiquidityDeltas(totalBalance, balances, proposedWeights);
    uint256 currentAPR = APRNet.getNetAPR(_adapters, weights, liquidityDeltasCurrent);
    uint256 suggestedAPR = APRNet.getNetAPR(_adapters, proposedWeights, liquidityDeltasProposed);
    uint256 diff = suggestedAPR.sub(currentAPR, "!increased");
    // Require improvement of 5% of current APR to accept changes
    require((diff.mul(1e18) / currentAPR) >= 5e16, "insufficient improvement");
    weights = proposedWeights;
    APRNet.rebalance(_adapters, liquidityDeltasProposed);
  }

  function rebalanceWithNewAdapters(
    IErc20Adapter[] memory proposedAdapters,
    uint256[] memory proposedWeights
  ) external onlyEOA {
    require(proposedAdapters.length == proposedWeights.length, "bad lengths");
    _validateAdapters(proposedAdapters);
    APRNet.validateWeights(proposedWeights);
    IErc20Adapter[] memory _adapters = adapters;
    uint256[] memory balances = _getBalances(_adapters);
    uint256 totalBalance = APRNet.sum(balances).add(IERC20(underlying).balanceOf(address(this)));
    int256[] memory liquidityDeltasCurrent = APRNet.calculateLiquidityDeltas(totalBalance, balances, weights);
    int256[] memory liquidityDeltasProposed = APRNet.calculateLiquidityDeltas(totalBalance, balances, proposedWeights);
    uint256 currentAPR = APRNet.getNetAPR(_adapters, weights, liquidityDeltasCurrent);
    uint256 suggestedAPR = APRNet.getNetAPR(proposedAdapters, proposedWeights, liquidityDeltasProposed);
    uint256 diff = suggestedAPR.sub(currentAPR, "!increased");
    // Require improvement of 5% of current APR to accept changes
    require((diff.mul(1e18) / currentAPR) >= 5e16, "insufficient improvement");
    uint256 len = proposedAdapters.length;
    for (uint256 i; i < len; i++) {
      _beforeAddAdapter(proposedAdapters[i]);
    }
    adapters = proposedAdapters;
    weights = proposedWeights;
    APRNet.rebalance(proposedAdapters, liquidityDeltasProposed);
  }

  function _transferOut(address to, uint256 amount) internal {}

/* ========== Internal Rebalance Logic ========== */

  function _beforeAddAdapter(IErc20Adapter adapter) internal {
    address token = adapter.token();
    underlying.safeApproveMax(address(adapter));
    token.safeApproveMax(address(adapter));
    lockedTokens[token] = true;
  }

  function _validateAdapters(IErc20Adapter[] memory _adapters) internal view {
    uint256 len = _adapters.length;
    for (uint256 i; i < len; i++) {
      IErc20Adapter adapter = _adapters[i];
      require(registry.isApprovedAdapter(address(adapter)), "!approved");
      require(adapter.underlying() == underlying, "bad adapter");
      for (uint256 j = i; j < len; j++) {
        require(address(adapter) != address(_adapters[j]), "duplicate adapter");
      }
    }
  }
}