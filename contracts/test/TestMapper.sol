// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

import {
  ILendingPoolAddressesProvider as AaveProviderV1,
  ILendingPoolCore as AaveCoreV1
} from '../interfaces/AaveV1Interfaces.sol';
import {
  ILendingPoolAddressesProvider as AaveProviderV2,
  ILendingPool as AavePoolV2
} from '../interfaces/AaveV2Interfaces.sol';
import '../interfaces/CompoundInterfaces.sol';
import '../interfaces/FulcrumInterfaces.sol';
import { IFusePoolDirectory, IFusePool } from "../interfaces/FuseInterfaces.sol";
import {ReserveConfigurationLib} from '../libraries/ReserveConfigurationLib.sol';
import '../libraries/SymbolHelper.sol';
import 'hardhat/console.sol';

contract TestMapper {
  using ReserveConfigurationLib for AavePoolV2.ReserveConfigurationMap;

  AaveProviderV1 internal constant AV1 = AaveProviderV1(0x24a42fD28C976A61Df5D00D0599C34c4f90748c8);
  AaveProviderV2 internal constant AV2 = AaveProviderV2(0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5);
  IComptroller internal constant COMP = IComptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
  IComptroller internal constant CREAM = IComptroller(0x3d5BC3c8d13dcB8bF317092d84783c2697AE9258);
  IComptroller internal constant IRON = IComptroller(0xAB1c342C7bf5Ec5F02ADEA1c2270670bCa144CbB);
  IBZX internal constant BZX = IBZX(0xD8Ee69652E4e4838f2531732a46d1f7F584F0b7f);
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  IFusePoolDirectory internal constant FUSE = IFusePoolDirectory(0x835482FE0532f169024d5E9410199369aAD5C77E);

  function aaveV1() external view {
    AaveCoreV1 core = AV1.getLendingPoolCore();
    address[] memory tokens = core.getReserves();
    uint256 len = tokens.length;
    for (uint256 i = 0; i < len; i++) {
      string memory symbol =
        tokens[i] == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE ? 'Ether' : SymbolHelper.getSymbol(tokens[i]);
      if (core.getReserveIsFreezed(tokens[i])) {
        console.log('Got Frozen Asset: ', symbol);
        continue;
      }
      console.log(
        string(
          abi.encodePacked(
            "['",
            toAsciiString(tokens[i]),
            "', '",
            toAsciiString(core.getReserveATokenAddress(tokens[i])),
            "', '",
            symbol,
            "'],"
          )
        )
      );
    }
  }

  function aaveV2() external view {
    AavePoolV2 pool = AV2.getLendingPool();
    address[] memory tokens = pool.getReservesList();
    uint256 len = tokens.length;
    for (uint256 i = 0; i < len; i++) {
      string memory symbol =
        tokens[i] == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE ? 'ETH' : SymbolHelper.getSymbol(tokens[i]);
      if (pool.getConfiguration(tokens[i]).isFrozen()) {
        console.log('Got Frozen Asset: ', symbol);
        continue;
      }
      console.log(
        string(
          abi.encodePacked(
            "testAdapter(getAddress('0x",
            toAsciiString(tokens[i]),
            "'), getAddress('0x",
            toAsciiString(pool.getReserveData(tokens[i]).aTokenAddress),
            "'), '",
            symbol,
            "');"
          )
        )
      );
    }
  }

  function fuse() external view {
    IFusePoolDirectory.FusePool[] memory fusePools = FUSE.getAllPools();
    uint256 len = fusePools.length;
    for (uint256 i; i < len; i++) {
      console.log("Oracle: ", fusePools[i].comptroller.oracle());
    }
  }

  function compound() external view {
    ICToken[] memory cTokens = COMP.getAllMarkets();
    uint256 len = cTokens.length;

    for (uint256 i = 0; i < len; i++) {
      address underlying;
      ICToken cToken = cTokens[i];
      if (COMP.mintGuardianPaused(address(cToken))) {
        continue;
      }
      try cToken.underlying{gas: 25000}() returns (address _underlying) {
        underlying = _underlying;
        if (underlying == address(0)) {
          underlying = WETH;
        }
      } catch {
        underlying = WETH;
      }
      string memory symbol = underlying == WETH ? 'ETH' : SymbolHelper.getSymbol(underlying);
      console.log(
        string(
          abi.encodePacked(
            "testAdapter(getAddress('0x",
            toAsciiString(underlying),
            "'), getAddress('0x",
            toAsciiString(address(cToken)),
            "'), '",
            symbol,
            "');"
          )
        )
      );
    }
  }

  function cream() external view {
    ICToken[] memory cTokens = CREAM.getAllMarkets();
    uint256 len = cTokens.length;

    for (uint256 i = 0; i < len; i++) {
      address underlying;
      ICToken cToken = cTokens[i];
      if (CREAM.mintGuardianPaused(address(cToken))) {
        continue;
      }
      try cToken.underlying{gas: 25000}() returns (address _underlying) {
        underlying = _underlying;
        if (underlying == address(0)) {
          underlying = WETH;
        }
      } catch {
        underlying = WETH;
      }
      string memory symbol = underlying == WETH ? 'ETH' : SymbolHelper.getSymbol(underlying);
      console.log(
        string(
          abi.encodePacked(
            "testAdapter(getAddress('0x",
            toAsciiString(underlying),
            "'), getAddress('0x",
            toAsciiString(address(cToken)),
            "'), '",
            symbol,
            "');"
          )
        )
      );
    }
  }

  function iron() external view {
    ICToken[] memory cTokens = IRON.getAllMarkets();
    uint256 len = cTokens.length;

    for (uint256 i = 0; i < len; i++) {
      address underlying;
      ICToken cToken = cTokens[i];
      if (IRON.mintGuardianPaused(address(cToken))) {
        continue;
      }
      try cToken.underlying{gas: 25000}() returns (address _underlying) {
        underlying = _underlying;
        if (underlying == address(0)) {
          underlying = WETH;
        }
      } catch {
        underlying = WETH;
      }
      string memory symbol = underlying == WETH ? 'ETH' : SymbolHelper.getSymbol(underlying);
      console.log(
        string(
          abi.encodePacked(
            "testAdapter(getAddress('0x",
            toAsciiString(underlying),
            "'), getAddress('0x",
            toAsciiString(address(cToken)),
            "'), '",
            symbol,
            "');"
          )
        )
      );
    }
  }

  function fulcrum() external view {
    address[] memory loanPools = BZX.getLoanPoolsList(0, 1e18);
    uint256 len = loanPools.length;
    for (uint256 i = 0; i < len; i++) {
      address loanPool = loanPools[i];
      address underlying = BZX.loanPoolToUnderlying(loanPool);
      string memory symbol = underlying == WETH ? 'ETH' : SymbolHelper.getSymbol(underlying);
      console.log(
        string(
          abi.encodePacked(
            "testAdapter(getAddress('0x",
            toAsciiString(underlying),
            "'), getAddress('0x",
            toAsciiString(loanPool),
            "'), '",
            symbol,
            "');"
          )
        )
      );
    }
  }

  function toAsciiString(address x) internal pure returns (string memory) {
    bytes memory s = new bytes(40);
    for (uint256 i = 0; i < 20; i++) {
      bytes1 b = bytes1(uint8(uint256(uint160(x)) / (2**(8 * (19 - i)))));
      bytes1 hi = bytes1(uint8(b) / 16);
      bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
      s[2 * i] = char(hi);
      s[2 * i + 1] = char(lo);
    }
    return string(s);
  }

  function char(bytes1 b) internal pure returns (bytes1 c) {
    if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
    else return bytes1(uint8(b) + 0x57);
  }
}
