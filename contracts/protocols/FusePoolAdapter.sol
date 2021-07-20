// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import "../interfaces/FuseInterfaces.sol";
import "../adapters/fuse/FuseErc20Adapter.sol";
import "../adapters/fuse/FuseEtherAdapter.sol";
import "./AbstractProtocolAdapter.sol";


contract FuseProtocolAdapter is AbstractProtocolAdapter {
  using CloneLibrary for address;

/* ========== Constants ========== */

  address public immutable fuseProtocolAdapter;
  address public immutable erc20AdapterImplementation;
  address public immutable etherAdapterImplementation;

/* ========== Storage ========== */

  IFusePool public pool;
  string internal _fusePoolName;

/* ========== Constructor ========== */

  constructor(IAdapterRegistry _registry) AbstractProtocolAdapter(_registry) {
    erc20AdapterImplementation = address(new FuseErc20Adapter());
    etherAdapterImplementation = address(new FuseEtherAdapter());
    fuseProtocolAdapter = msg.sender;
  }

  function initialize(IFusePool _pool, string memory fusePoolName) external {
    require(msg.sender == fuseProtocolAdapter, "!fuse adapter");
    require(address(pool) == address(0), "already initialized");
    pool = _pool;
    _fusePoolName = fusePoolName;
  }

/* ========== Internal Actions ========== */

  function deployAdapter(address fToken) internal virtual override returns (address adapter) {
    address underlying;
    // The call to underlying will use all the gas sent if it fails,
    // so we specify a maximum of 25k gas. The contract will only use ~2k
    // but this protects against all likely changes to the gas schedule.
    try IFToken(fToken).underlying{gas: 25000}() returns (address _underlying) {
      underlying = _underlying;
      if (underlying == address(0)) {
        underlying = weth;
      }
    } catch {
      underlying = weth;
    }
    if (underlying == weth) {
      adapter = CloneLibrary.createClone(etherAdapterImplementation);
    } else {
      adapter = CloneLibrary.createClone(erc20AdapterImplementation);
    }
    FuseErc20Adapter(adapter).initialize(underlying, fToken, _fusePoolName);
  }

/* ========== Public Queries ========== */

  function protocol() external view virtual override returns (string memory) {
    return _fusePoolName;
  }

  function getUnmapped() public view virtual override returns (address[] memory fTokens) {
    fTokens = toAddressArray(pool.getAllMarkets());
    uint256 len = fTokens.length;
    uint256 prevLen = totalMapped;
    if (len == prevLen) {
      assembly { mstore(fTokens, 0) }
    } else {
      assembly {
        fTokens := add(fTokens, mul(prevLen, 32))
        mstore(fTokens, sub(len, prevLen))
      }
    }
  }

  function toAddressArray(IFToken[] memory fTokens) internal pure returns (address[] memory arr) {
    assembly { arr := fTokens }
  }

/* ========== Internal Queries ========== */

  function isAdapterMarketFrozen(address adapter) internal view virtual override returns (bool) {
    return isTokenMarketFrozen(IErc20Adapter(adapter).token());
  }

  function isTokenMarketFrozen(address fToken) internal view virtual override returns (bool) {
    return pool.mintGuardianPaused(fToken);
  }
}