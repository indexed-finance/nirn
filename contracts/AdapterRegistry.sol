// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./interfaces/ITokenAdapter.sol";
import "./libraries/ArrayHelper.sol";
import "./interfaces/IProtocolAdapter.sol";


contract AdapterRegistry is Ownable() {
  using ArrayHelper for address[];
  using ArrayHelper for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.AddressSet;

/* ========== Events ========== */

  event ProtocolAdapterAdded(uint256 protocolId, address protocolAdapter);

  event ProtocolAdapterRemoved(uint256 protocolId);

  event TokenAdapterAdded(address adapter, uint256 protocolId, address underlying, address wrapper);

  event TokenAdapterRemoved(address adapter, uint256 protocolId, address underlying, address wrapper);

  event TokenSupportAdded(address underlying);

  event TokenSupportRemoved(address underlying);

/* ========== Structs ========== */

  struct TokenAdapter {
    address adapter;
    uint96 protocolId;
  }

/* ========== Storage ========== */
  uint256 public protocolsCount;
  mapping(uint256 => address) public protocolAdapters;
  mapping(address => uint256) public protocolAdapterIds;
  // All adapters for a given underlying token
  mapping(address => address[]) internal tokenAdapters;
  // Adapters by wrapper
  mapping(address => TokenAdapter) internal adaptersByWrapperToken;
  // All supported underlying tokens
  EnumerableSet.AddressSet internal supportedTokens;

/* ========== Modifiers ========== */

  modifier onlyProtocolOrOwner {
    require(protocolAdapterIds[msg.sender] > 0 || msg.sender == owner(), "!approved");
    _;
  }

  function getProtocolAdapterId(address protocolAdapter) internal view returns (uint256 id) {
    require((id = protocolAdapterIds[protocolAdapter]) > 0, "!exists");
  }

/* ========== Protocol Adapter Management ========== */

  function addProtocolAdapter(address protocolAdapter) external onlyProtocolOrOwner returns (uint256 id) {
    require(protocolAdapter != address(0), "null");
    require(protocolAdapterIds[protocolAdapter] == 0, "exists");
    id = ++protocolsCount;
    protocolAdapterIds[protocolAdapter] = id;
    protocolAdapters[id] = protocolAdapter;
    emit ProtocolAdapterAdded(id, protocolAdapter);
  }

  function removeProtocolAdapter(address protocolAdapter) external onlyOwner {
    uint256 id = getProtocolAdapterId(protocolAdapter);
    delete protocolAdapterIds[protocolAdapter];
    delete protocolAdapters[id];
    emit ProtocolAdapterRemoved(id);
  }

/* ========== Token Adapter Management ========== */

  function _addTokenAdapter(IErc20Adapter adapter, uint256 id) internal {
    address underlying = adapter.underlying();
    address wrapper = adapter.token();
    require(adaptersByWrapperToken[wrapper].protocolId == 0, "adapter exists");
    if (tokenAdapters[underlying].length == 0) {
      supportedTokens.add(underlying);
      emit TokenSupportAdded(underlying);
    }
    tokenAdapters[underlying].push(address(adapter));
    adaptersByWrapperToken[wrapper] = TokenAdapter(address(adapter), uint96(id));
    emit TokenAdapterAdded(address(adapter), id, underlying, wrapper);
  }

  function addTokenAdapter(IErc20Adapter adapter) external {
    uint256 id = getProtocolAdapterId(msg.sender);
    _addTokenAdapter(adapter, id);
  }

  function addTokenAdapters(IErc20Adapter[] calldata adapters) external {
    uint256 id = getProtocolAdapterId(msg.sender);
    uint256 len = adapters.length;
    for (uint256 i = 0; i < len; i++) {
      IErc20Adapter adapter = adapters[i];
      _addTokenAdapter(adapter, id);
    }
  }

  function removeTokenAdapter(IErc20Adapter adapter) external {
    address wrapper = adapter.token();
    TokenAdapter memory adapterRecord = adaptersByWrapperToken[wrapper];
    require(adapterRecord.adapter == address(adapter), "wrong adapter");
    uint256 protocolId = adapterRecord.protocolId;
    require(
      msg.sender == owner() ||
      msg.sender == protocolAdapters[protocolId],
      "!authorized"
    );
    delete adaptersByWrapperToken[wrapper];
    address underlying = adapter.underlying();
    address[] storage adapters = tokenAdapters[underlying];
    uint256 index = adapters.indexOf(address(adapter));
    adapters.remove(index);
    if (adapters.length == 0) {
      supportedTokens.remove(underlying);
      emit TokenSupportRemoved(underlying);
    }
    emit TokenAdapterRemoved(address(adapter), protocolId, underlying, wrapper);
  }

/* ========== Protocol Queries ========== */

  function getProtocolAdapters() external view returns (address[] memory adapters) {
    uint256 len = protocolsCount;
    adapters = new address[](len);
    for (uint256 i; i < len; i++) {
      adapters[i] = protocolAdapters[i];
    }
  }

  function getProtocolMetadata(uint256 id) external view returns (address protocolAdapter, string memory name) {
    protocolAdapter = protocolAdapters[id];
    require(protocolAdapter != address(0), "invalid id");
    name = IProtocolAdapter(protocolAdapter).protocol();
  }

/* ========== Supported Token Queries ========== */

  function isSupported(address underlying) external view returns (bool) {
    return tokenAdapters[underlying].length > 0;
  }

  function getSupportedTokens() external view returns (address[] memory list) {
    list = supportedTokens.toArray();
  }

/* ========== Token Adapter Queries ========== */

  function isApprovedAdapter(address adapter) external view returns (bool) {
    address wrapper = IErc20Adapter(adapter).token();
    TokenAdapter memory adapterRecord = adaptersByWrapperToken[wrapper];
    return adapterRecord.adapter == adapter;
  }

  function getAdaptersList(address underlying) public view returns (address[] memory list) {
    list = tokenAdapters[underlying];
  }

  function getAdapterForWrapperToken(address wrapperToken) external view returns (address) {
    return adaptersByWrapperToken[wrapperToken].adapter;
  }

  function getAdaptersCount(address underlying) external view returns (uint256) {
    return tokenAdapters[underlying].length;
  }

  function getAdaptersSortedByAPR(address underlying)
    public
    view
    returns (address[] memory adapters, uint256[] memory aprs)
  {
    adapters = getAdaptersList(underlying);
    uint256 len = adapters.length;
    aprs = new uint256[](len);
    for (uint256 i = 0; i < len; i++) {
      try IErc20Adapter(adapters[i]).getAPR() returns (uint256 apr) {
        aprs[i] = apr;
      } catch {
        aprs[i] = 0;
      }
    }
    adapters.sortByDescendingScore(aprs);
  }

  function getAdaptersSortedByAPRWithDeposit(
    address underlying,
    uint256 deposit,
    address excludingAdapter
  )
    public
    view
    returns (address[] memory adapters, uint256[] memory aprs)
  {
    adapters = getAdaptersList(underlying);
    uint256 len = adapters.length;
    aprs = new uint256[](len);
    for (uint256 i = 0; i < len; i++) {
      address adapter = adapters[i];
      if (adapter == excludingAdapter) {
        try IErc20Adapter(adapter).getAPR() returns (uint256 apr) {
          aprs[i] = apr;
        } catch {
          aprs[i] = 0;
        }
      } else {
        try IErc20Adapter(adapter).getHypotheticalAPR(int256(deposit)) returns (uint256 apr) {
          aprs[i] = apr;
        } catch {
          aprs[i] = 0;
        }
      }
    }
    adapters.sortByDescendingScore(aprs);
  }

  function getAdapterWithHighestAPR(address underlying) external view returns (address adapter, uint256 apr) {
    (address[] memory adapters, uint256[] memory aprs) = getAdaptersSortedByAPR(underlying);
    adapter = adapters[0];
    apr = aprs[0];
  }

  function getAdapterWithHighestAPRForDeposit(
    address underlying,
    uint256 deposit,
    address excludingAdapter
  ) external view returns (address adapter, uint256 apr) {
    (address[] memory adapters, uint256[] memory aprs) = getAdaptersSortedByAPRWithDeposit(
      underlying,
      deposit,
      excludingAdapter
    );
    adapter = adapters[0];
    apr = aprs[0];
  }
}
