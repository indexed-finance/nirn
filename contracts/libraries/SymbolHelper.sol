// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

import "../interfaces/IERC20Metadata.sol";


library SymbolHelper {
  /**
   * @dev Returns the index of the highest bit set in `self`.
   * Note: Requires that `self != 0`
   */
  function highestBitSet(uint256 self) internal pure returns (uint256 r) {
    uint256 x = self;
    require (x > 0, "no bits set");
    if (x >= 0x100000000000000000000000000000000) {x >>= 128; r += 128;}
    if (x >= 0x10000000000000000) {x >>= 64; r += 64;}
    if (x >= 0x100000000) {x >>= 32; r += 32;}
    if (x >= 0x10000) {x >>= 16; r += 16;}
    if (x >= 0x100) {x >>= 8; r += 8;}
    if (x >= 0x10) {x >>= 4; r += 4;}
    if (x >= 0x4) {x >>= 2; r += 2;}
    if (x >= 0x2) r += 1; // No need to shift x anymore
  }

  function getSymbol(address token) internal view returns (string memory) {
    (bool success, bytes memory data) = token.staticcall(abi.encodeWithSignature("symbol()"));
    if (!success) return "UNKNOWN";
    if (data.length != 32) return abi.decode(data, (string));
    uint256 symbol = abi.decode(data, (uint256));
    if (symbol == 0) return "UNKNOWN";
    uint256 hbs = highestBitSet(symbol);
    uint256 size = (hbs / 8) + (hbs % 8 > 0 ? 1 : 0);
    assembly { mstore(data, size) }
    return string(data);
  }
}