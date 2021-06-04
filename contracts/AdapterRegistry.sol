// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;


import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITokenAdapter.sol";
import "./libraries/SortLibrary.sol";
import "./interfaces/IProtocolAdapter.sol";


contract AdapterRegistry is Ownable() {
  using SortLibrary for address[];

  struct Protocol {
    address protocolAdapter;
    address[] tokenAdapters;
  }

  Protocol[] internal protocols;
  mapping(address => uint256) internal protocolIds;
  // All adapters for a given underlying token
  mapping(address => address[]) internal tokenAdapters;
  address[] internal supportedTokens;

  constructor() public {
    Protocol memory protocol;
    protocols.push(protocol);
  }

  modifier onlyProtocolOrOwner {
    require(protocolIds[msg.sender] > 0 || msg.sender == owner(), "!approved");
    _;
  }

  function getProtocolCount() external view returns (uint256) {
    return protocols.length;
  }

  function getProtocolAdapters() external view returns (address[] memory adapters) {
    uint256 len = protocols.length - 1;
    adapters = new address[](len);
    for (uint256 i = 1; i < len; i++) {
      adapters[i - 1] = protocols[i].protocolAdapter;
    }
  }

  function getProtocolMetadata(uint256 id)
    external
    view
    returns (address protocolAdapter, uint256 adaptersCount, string memory name)
  {
    Protocol storage protocol = protocols[id];
    protocolAdapter = protocol.protocolAdapter;
    require(protocolAdapter != address(0), "invalid id");
    adaptersCount = protocol.tokenAdapters.length;
    name = IProtocolAdapter(protocolAdapter).protocol();
  }

  function isSupported(address underlying) external view returns (bool) {
    return tokenAdapters[underlying].length > 0;
  }

  function getSupportedTokens() external view returns (address[] memory list) {
    list = supportedTokens;
  }

  function getAdaptersList(address underlying) public view returns (address[] memory list) {
    list = tokenAdapters[underlying];
    require(list.length > 0, "!adapters");
  }

  function addTokenAdapter(IErc20Adapter adapter) external {
    uint256 id = protocolIds[msg.sender];
    require(id > 0, "!protocolAdapter");
    address underlying = adapter.underlying();
    if (tokenAdapters[underlying].length == 0) {
      supportedTokens.push(underlying);
    }
    tokenAdapters[underlying].push(address(adapter));
    // protocols[id].tokenAdapters.push(address(adapter));
  }

  function addProtocolAdapter(address protocolAdapter) external onlyProtocolOrOwner {
    require(protocolIds[protocolAdapter] == 0, "adapter exists");
    uint256 id = protocols.length;
    Protocol memory protocol;
    protocol.protocolAdapter = protocolAdapter;
    protocols.push(protocol);
    protocolIds[protocolAdapter] = id;
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
        try IErc20Adapter(adapter).getHypotheticalAPR(deposit) returns (uint256 apr) {
          aprs[i] = apr;
        } catch {
          aprs[i] = 0;
        }
      }
    }
    adapters.sortByDescendingScore(aprs);
  }

  function highestAPRAdapter(address underlying) external view returns (address adapter, uint256 apr) {
    (address[] memory adapters, uint256[] memory aprs) = getAdaptersSortedByAPR(underlying);
    adapter = adapters[0];
    apr = aprs[0];
  }

  function highestAPRAdapterForDeposit(
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
