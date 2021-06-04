// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../../interfaces/DyDxInterfaces.sol";
import "../../interfaces/ITokenAdapter.sol";
import "../../interfaces/IERC20Metadata.sol";
import "../../libraries/LowGasSafeMath.sol";
import "../../libraries/TransferHelper.sol";
import "../../libraries/SymbolHelper.sol";
import "../../libraries/CloneLibrary.sol";


contract DyDxErc20Adapter is IErc20Adapter, DyDxStructs {
  using SymbolHelper for address;
  using LowGasSafeMath for uint256;
  using TransferHelper for address;

/* ========== Constants ========== */

  uint256 public constant DECIMAL = 10 ** 18;
  IDyDx public immutable dydx;

/* ========== Storage ========== */

  address public override underlying;
  address public override token;
  address public dydxUserModuleImplementation;
  uint256 public marketId;
  mapping(address => address) public userModules;

/* ========== Constructor & Initializer ========== */

  constructor(IDyDx _dydx) {
    dydx = _dydx;
  }

  function initialize(address _underlying, uint256 _marketId) external virtual {
    underlying = _underlying;
    token = _underlying;
    marketId = _marketId;
    dydxUserModuleImplementation = address(new DyDxUserModule(dydx, _marketId));
    underlying.safeApprove(address(dydx), type(uint256).max);
  }

/* ========== Metadata Queries ========== */

  function name() external view override returns (string memory) {
    return string(abi.encodePacked(
      "DyDx ",
      underlying.getSymbol(),
      " Adapter"
    ));
  }

/* ========== User Modules ========== */

  function getOrCreateUserModule() internal returns (DyDxUserModule) {
    address module = userModules[msg.sender];
    if (module == address(0)) {
      module = (userModules[msg.sender] = CloneLibrary.createClone(dydxUserModuleImplementation));
      DyDxUserModule(module).initialize(msg.sender);
    }
    return DyDxUserModule(module);
  }

/* ========== Performance Queries ========== */

  function getAPR() external view virtual override returns (uint256 apr) {
    uint256 _marketId = marketId;
    uint256 rate = dydx.getMarketInterestRate(_marketId).value;
    uint256 aprBorrow = rate * 31622400;
    uint256 borrow = dydx.getMarketTotalPar(_marketId).borrow;
    uint256 supply = dydx.getMarketTotalPar(_marketId).supply;
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
  }

  function getHypotheticalAPR(uint256 _deposit) external view virtual override returns (uint256 apr) {
    uint256 _marketId = marketId;
    uint256 rate = dydx.getMarketInterestRate(_marketId).value;
    uint256 aprBorrow = rate * 31622400;
    uint256 borrow = dydx.getMarketTotalPar(_marketId).borrow;
    uint256 supply = uint256(dydx.getMarketTotalPar(_marketId).supply).add(_deposit);
    uint256 usage = (borrow.mul(DECIMAL)) / supply;
    apr = ((aprBorrow.mul(usage)) / DECIMAL).mul(dydx.getEarningsRate().value) / DECIMAL;
  }

/* ========== Caller Balance Queries ========== */

  function tokenBalance() public view virtual override returns (uint256) {
    address module = userModules[msg.sender];
    if (module == address(0)) {
      return 0;
    }
    IDyDx.Wei memory bal = dydx.getAccountWei(Info(module, 0), marketId);
    return bal.value;
  }

  function underlyingBalance() external view virtual override returns (uint256) {
    return tokenBalance();
  }

/* ========== Token Actions ========== */

  function deposit(uint256 amountUnderlying) public virtual override returns (uint256 amountMinted) {
    DyDxUserModule module = getOrCreateUserModule();
    underlying.safeTransferFrom(msg.sender, address(module), amountUnderlying);
    module.deposit(amountUnderlying);
    amountMinted = amountUnderlying;
  }

  function _withdraw(uint256 amount, bool toUser) internal {
    require(amount > 0, "DyDx: Burn failed");
    DyDxUserModule module = getOrCreateUserModule();
    module.withdraw(amount, toUser);
  }

  function withdraw(uint256 amountToken) public virtual override returns (uint256 amountReceived) {
    amountReceived = amountToken;
    _withdraw(amountToken, true);
  }

  function withdrawUnderlying(uint256 amountUnderlying) external virtual override returns (uint256 amountBurned) {
    amountBurned = withdraw(amountUnderlying);
  }
}


contract DyDxUserModule is DyDxStructs {
  using TransferHelper for address;

  IDyDx public immutable dydx;
  address public immutable owner;
  uint256 public immutable marketId;
  address public user;

  constructor(IDyDx _dydx, uint256 _marketId) {
    dydx = _dydx;
    owner = msg.sender;
    marketId = _marketId;
  }

  modifier onlyOwner {
    require(msg.sender == owner, "!owner");
    _;
  }

  function initialize(address _user) external onlyOwner {
    require(user == address(0), "initialized");
    user = _user;
  }

  function deposit(uint256 amount) external onlyOwner {
    Info[] memory infos = new Info[](1);
    infos[0] = Info(address(this), 0);

    AssetAmount memory amt = AssetAmount(true, AssetDenomination.Wei, AssetReference.Delta, amount);
    ActionArgs memory act;
    act.actionType = ActionType.Deposit;
    act.accountId = 0;
    act.amount = amt;
    act.primaryMarketId = marketId;
    act.otherAddress = address(this);

    ActionArgs[] memory args = new ActionArgs[](1);
    args[0] = act;

    dydx.operate(infos, args);
  }

  function withdraw(uint256 amount, bool toUser) external onlyOwner {
    Info[] memory infos = new Info[](1);
    infos[0] = Info(address(this), 0);

    AssetAmount memory amt = AssetAmount(false, AssetDenomination.Wei, AssetReference.Delta, amount);
    ActionArgs memory act;
    act.actionType = ActionType.Withdraw;
    act.accountId = 0;
    act.amount = amt;
    act.primaryMarketId = marketId;
    act.otherAddress = toUser ? user : owner;

    ActionArgs[] memory args = new ActionArgs[](1);
    args[0] = act;

    dydx.operate(infos, args);
  }
}