// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Rounds.sol";

contract RoundsHandler is Test {
  Rounds public rounds;

  address public organiser = address(0x1000);
  address public payee1 = address(0x2001);
  address public payee2 = address(0x2002);

  address[] public donors;
  uint256 public activeRoundId;
  uint256 public totalDeposited;
  uint256 public totalWithdrawn;

  constructor(Rounds _rounds) {
    rounds = _rounds;

    vm.deal(organiser, 100_000 ether);

    donors.push(address(0x3001));
    donors.push(address(0x3002));
    donors.push(address(0x3003));
    donors.push(address(0x3004));

    for (uint256 i = 0; i < donors.length; i++) {
      vm.deal(donors[i], 100_000 ether);
    }

    _openRound();
  }

  function _openRound() internal {
    string[] memory names = new string[](2);
    names[0] = "Proj A";
    names[1] = "Proj B";

    address[] memory payees = new address[](2);
    payees[0] = payee1;
    payees[1] = payee2;

    vm.prank(organiser);
    activeRoundId = rounds.open{value: 10 ether}(
      "Invariant Round",
      uint64(block.timestamp + 10 days),
      names,
      payees
    );
    totalDeposited += 10 ether;
  }

  function give(uint8 donorIdx, uint8 projIdx, uint96 amount) external {
    amount = uint96(bound(amount, 1e15, 2 ether));
    donorIdx = uint8(bound(donorIdx, 0, donors.length - 1));
    projIdx = uint8(bound(projIdx, 0, 1));

    address donor = donors[donorIdx];

    Rounds.Round memory r = rounds.roundOf(activeRoundId);
    if (block.timestamp >= r.endsAt || r.finalized) return;

    vm.prank(donor);
    try rounds.give{value: amount}(activeRoundId, projIdx) {
      totalDeposited += amount;
    } catch {}
  }

  function finalize() external {
    Rounds.Round memory r = rounds.roundOf(activeRoundId);
    if (r.finalized) return;

    vm.warp(r.endsAt + 1);
    rounds.finalize(activeRoundId);
  }

  function withdraw(uint8 accountIdx) external {
    address who;
    if (accountIdx == 0) who = payee1;
    else if (accountIdx == 1) who = payee2;
    else who = organiser;

    uint256 pend = rounds.pending(who);
    if (pend == 0) return;

    vm.prank(who);
    try rounds.withdraw() {
      totalWithdrawn += pend;
    } catch {}
  }
}

contract RoundsInvariantTest is Test {
  Rounds public rounds;
  RoundsHandler public handler;

  function setUp() public {
    rounds = new Rounds();
    handler = new RoundsHandler(rounds);

    targetContract(address(handler));
  }

  function invariant_BalanceEqualsHeldPlusPending() public view {
    // Contract balance must equal (totalDeposited - totalWithdrawn)
    assertEq(address(rounds).balance, handler.totalDeposited() - handler.totalWithdrawn());
  }
}
