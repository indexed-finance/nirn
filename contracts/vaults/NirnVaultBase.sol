// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAdapterRegistry.sol";
import "../interfaces/IRewardsSeller.sol";
import "../interfaces/INirnVault.sol";
import "../libraries/LowGasSafeMath.sol";
import "../libraries/SymbolHelper.sol";
import "../libraries/TransferHelper.sol";
import "../libraries/AdapterHelper.sol";
import "./ERC20.sol";


/**
 * @dev Base contract defining the constant and storage variables
 * for NirnVault, as well as basic state queries and setters.
 */
abstract contract NirnVaultBase is ERC20, Ownable(), INirnVault {
  using SafeCast for uint256;
  using TransferHelper for address;
  using Fraction for uint256;
  using LowGasSafeMath for uint256;
  using MinimalSignedMath for uint256;
  using MinimalSignedMath for int256;
  using ArrayHelper for uint256[];
  using ArrayHelper for address[];
  using ArrayHelper for bytes32[];
  using ArrayHelper for IErc20Adapter[];
  using AdapterHelper for bytes32;
  using AdapterHelper for bytes32[];
  using AdapterHelper for IErc20Adapter[];

/* ========== Constants ========== */

  /**
  * @dev Fraction of the current APR of the vault that a proposed rebalance must improve
  * the net APR by to be accepted, as a fraction of 1e18.
  * 5e16 means newAPR-currentAPR must be greater than or equal to currentAPR*1.05
  */
  uint256 public constant override minimumAPRImprovement = 5e16;

  /** @dev Nirn adapter registry */
  IAdapterRegistry public immutable override registry;

  /** @dev Address of a contract which can only execute specific functions and only allows EOAs to call. */
  address public immutable override eoaSafeCaller;

  /** @dev Underlying asset for the vault. */
  address public immutable override underlying;

  /** @dev ERC20 name */
  string public override name;

  /** @dev ERC20 symbol */
  string public override symbol;

/* ========== Storage ========== */

  /**
   * @dev Mapping from wrapper tokens to adapters.
   * Used to determine whether to approve the adapter for the
   * wrapper & whether the wrapper can be sold.
   */
  mapping(address => address) public override wrapperAdapters;

  /** @dev Account that receives performance fees. */
  address public override feeRecipient;

  /** @dev Address of contract used to sell rewards. */
  IRewardsSeller public override rewardsSeller;

  /** @dev Fee taken on profit as a fraction of 1e18. */
  uint64 public override performanceFee = 5e16;

  /** @dev Ratio of underlying token to keep in the vault for cheap withdrawals as a fraction of 1e18. */
  uint64 public override reserveRatio = 1e17;

  /** @dev Last price at which fees were taken. */
  uint128 public override priceAtLastFee = 1e18;

  /** @dev Tightly packed token adapters encoded as (address,uint96). */
  bytes32[] internal packedAdaptersAndWeights;

  function getAdaptersAndWeights() public view override returns (
    IErc20Adapter[] memory adapters,
    uint256[] memory weights
  ) {
    (adapters, weights) = packedAdaptersAndWeights.unpackAdaptersAndWeights();
  }

  function setAdaptersAndWeights(IErc20Adapter[] memory adapters, uint256[] memory weights) internal {
    emit AllocationsUpdated(adapters, weights);
    packedAdaptersAndWeights = AdapterHelper.packAdaptersAndWeights(
      adapters,
      weights
    );
  }

  function removeAdapters(uint256[] memory removeIndices) internal {
    uint256 len = removeIndices.length;
    if (len == 0) return;
    for (uint256 i = len; i > 0; i--) {
      uint256 rI = removeIndices[i - 1];
      (IErc20Adapter adapter,) = packedAdaptersAndWeights[rI].unpackAdapterAndWeight();
      emit AdapterRemoved(adapter);
      packedAdaptersAndWeights.remove(rI);
    }
  }

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
    require(msg.sender == tx.origin || msg.sender == eoaSafeCaller, "!EOA");
    _;
  }

/* ========== Constructor ========== */

  constructor(
    address _registry,
    address _eoaSafeCaller,
    address _underlying,
    address _rewardsSeller,
    address _feeRecipient
  ) {
    registry = IAdapterRegistry(_registry);
    eoaSafeCaller = _eoaSafeCaller;
    underlying = _underlying;
    feeRecipient = _feeRecipient;
    rewardsSeller = IRewardsSeller(_rewardsSeller);

    (address adapter,) = IAdapterRegistry(_registry).getAdapterWithHighestAPR(_underlying);
    packedAdaptersAndWeights.push(AdapterHelper.packAdapterAndWeight(IErc20Adapter(adapter), 1e18));
    // _beforeAddAdapter logic
    // Can't use the function because immutables (underlying) can't be read in constructor.
    _underlying.safeApproveMax(adapter);
    address wrapper = IErc20Adapter(adapter).token();
    wrapper.safeApproveMax(adapter);
    wrapperAdapters[wrapper] = adapter;

    name = SymbolHelper.getPrefixedName("Indexed ", _underlying);
    symbol = SymbolHelper.getPrefixedSymbol("n", _underlying);
  }

/* ========== Configuration Controls ========== */

  function setPerformanceFee(uint64 _performanceFee) external override onlyOwner {
    claimFees(balance(), totalSupply);
    require(_performanceFee <= 2e17, "fee >20%");
    performanceFee = _performanceFee;
    emit SetPerformanceFee(_performanceFee);
  }

  function setReserveRatio(uint64 _reserveRatio) external override onlyOwner {
    require(_reserveRatio <= 2e17, "reserve >20%");
    reserveRatio = _reserveRatio;
    emit SetReserveRatio(_reserveRatio);
  }

  function setFeeRecipient(address _feeRecipient) external override onlyOwner {
    feeRecipient = _feeRecipient;
    emit SetFeeRecipient(_feeRecipient);
  }

  function setRewardsSeller(IRewardsSeller _rewardsSeller) external override onlyOwner {
    rewardsSeller = _rewardsSeller;
    emit SetRewardsSeller(address(_rewardsSeller));
  }

/* ========== Reward Token Sale ========== */

  function sellRewards(address rewardsToken, bytes calldata params) external override onlyEOA {
    uint256 _balance = IERC20(rewardsToken).balanceOf(address(this));
    require(wrapperAdapters[rewardsToken] == address(0) && rewardsToken != underlying, "token locked");
    IRewardsSeller _rewardsSeller = rewardsSeller;
    require(address(_rewardsSeller) != address(0), "!seller");
    rewardsToken.safeTransfer(address(_rewardsSeller), _balance);
    _rewardsSeller.sellRewards(msg.sender, rewardsToken, underlying, params);
  }

  function withdrawFromUnusedAdapter(IErc20Adapter adapter) external {
    (IErc20Adapter[] memory adapters,) = getAdaptersAndWeights();
    require(
      !adapters.toAddressArray().includes(address(adapter)),
      "!unused"
    );
    require(registry.isApprovedAdapter(address(adapter)), "!approved");
    require(adapter.underlying() == underlying, "bad adapter");
    uint256 bal = adapter.balanceUnderlying();
    adapter.withdrawUnderlyingUpTo(bal);
  }

/* ========== Underlying Balance Queries ========== */

  struct BalanceSheet {
    uint256[] balances;
    uint256 reserveBalance;
    uint256 totalBalance;
    uint256 totalProductiveBalance;
  }

  function getBalanceSheet(
    IErc20Adapter[] memory adapters
  ) internal view returns (BalanceSheet memory sheet) {
    sheet.balances = adapters.getBalances();
    sheet.reserveBalance = reserveBalance();
    sheet.totalBalance = sheet.balances.sum().add(sheet.reserveBalance);
    sheet.totalProductiveBalance = sheet.totalBalance.mulSubFractionE18(reserveRatio);
  }

  /**
   * @dev Returns the value in `underlying` of the vault's deposits
   * in each adapter.
   */
  function getBalances() public view override returns (uint256[] memory balances) {
    (IErc20Adapter[] memory adapters,) = getAdaptersAndWeights();
    return adapters.getBalances();
  }

  /**
   * @dev Returns total value of vault in `underlying`
   */
  function balance() public view override returns (uint256 sum) {
    (IErc20Adapter[] memory adapters,) = getAdaptersAndWeights();
    uint256 len = adapters.length;
    for (uint256 i; i < len; i++) {
      sum = sum.add(adapters[i].balanceUnderlying());
    }
    sum = sum.add(reserveBalance());
  }

  /**
   * @dev Returns current "reserve" balance, or balance of `underlying` held by the vault
   */
  function reserveBalance() public view override returns (uint256) {
    return IERC20(underlying).balanceOf(address(this));
  }

/* ========== Fees ========== */

  function calculateFee(uint256 totalBalance, uint256 supply) internal view returns (uint256) {
    uint256 valueAtLastCollectionPrice = supply.mulFractionE18(priceAtLastFee);
    if (totalBalance <= valueAtLastCollectionPrice) return 0;
    uint256 profit = totalBalance.sub(valueAtLastCollectionPrice);
    return profit.mulFractionE18(performanceFee);
  }

  function getPendingFees() external view override returns (uint256) {
    return calculateFee(balance(), totalSupply);
  }

  function claimFees(uint256 totalBalance, uint256 supply) internal returns (uint256 newSupply) {
    uint256 totalFees = calculateFee(totalBalance, supply);
    if (totalFees == 0) return supply;
    uint256 equivalentShares = totalFees.mul(supply) / totalBalance.sub(totalFees);
    emit FeesClaimed(totalFees, equivalentShares);
    _mint(feeRecipient, equivalentShares);
    newSupply = supply.add(equivalentShares);
    priceAtLastFee = totalBalance.toFractionE18(newSupply).toUint128();
  }

  function claimFees() external {
    claimFees(balance(), totalSupply);
  }

/* ========== Price Queries ========== */

  function getPricePerFullShare() external view override returns (uint256) {
    return balance().toFractionE18(totalSupply);
  }

  function getPricePerFullShareWithFee() external view override returns (uint256) {
    uint256 totalBalance = balance();
    uint256 supply = totalSupply;
    uint256 pendingFees = calculateFee(totalBalance, supply);
    return totalBalance.sub(pendingFees).toFractionE18(supply);
  }

/* ========== Update Hooks ========== */

  function beforeAddAdapter(IErc20Adapter adapter) internal {
    address wrapper = adapter.token();
    if (wrapperAdapters[wrapper] == address(adapter)) return;
    wrapperAdapters[wrapper] = address(adapter);
    underlying.safeApproveMax(address(adapter));
    wrapper.safeApproveMax(address(adapter));
  }

  function beforeAddAdapters(IErc20Adapter[] memory adapters) internal {
    uint256 len = adapters.length;
    for (uint256 i; i < len; i++) beforeAddAdapter(adapters[i]);
  }
}