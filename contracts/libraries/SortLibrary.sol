// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.0;


library SortLibrary {
  /**
   * @dev Given a list of tokens and their scores, sort by scores
   * in descending order.
   */
  function sortByDescendingScore(
    address[] memory tokens,
    uint256[] memory scores
  ) internal pure {
    uint256 len = tokens.length;
    for (uint256 i = 0; i < len; i++) {
      uint256 score = scores[i];
      address token = tokens[i];
      uint256 j = i - 1;
      while (int(j) >= 0 && scores[j] < score) {
        scores[j + 1] = scores[j];
        tokens[j + 1] = tokens[j];
        j--;
      }
      scores[j + 1] = score;
      tokens[j + 1] = token;
    }
  }
}