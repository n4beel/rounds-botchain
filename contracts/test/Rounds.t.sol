// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Rounds.sol";

contract MaliciousRecipient {
  Rounds public rounds;
  bool public attack;

  constructor(Rounds _rounds) {
    rounds = _rounds;
  }

  function setAttack(bool _attack) external {
    attack = _attack;
  }

  function triggerWithdraw() external {
    rounds.withdraw();
  }

  receive() external payable {
    if (attack) {
      attack = false;
      rounds.withdraw();
    }
  }
}

contract RoundsTest is Test {
  Rounds public rounds;

  address public organiser = address(0x1000);
  address public payee1 = address(0x2001);
  address public payee2 = address(0x2002);
  address public payee3 = address(0x2003);

  address public donorA = address(0x3001);
  address public donorB = address(0x3002);
  address public donorC = address(0x3003);
  address public donorD = address(0x3004);

  function setUp() public {
    rounds = new Rounds();

    vm.deal(organiser, 1000 ether);
    vm.deal(donorA, 1000 ether);
    vm.deal(donorB, 1000 ether);
    vm.deal(donorC, 1000 ether);
    vm.deal(donorD, 1000 ether);
  }

  function _defaultProjects() internal view returns (string[] memory names, address[] memory payees) {
    names = new string[](3);
    names[0] = "Project Alpha";
    names[1] = "Project Beta";
    names[2] = "Project Gamma";

    payees = new address[](3);
    payees[0] = payee1;
    payees[1] = payee2;
    payees[2] = payee3;
  }

  function test_OpenWithEightProjects() public {
    string[] memory names = new string[](8);
    address[] memory payees = new address[](8);
    for (uint160 i = 0; i < 8; i++) {
      names[i] = string(abi.encodePacked("Proj", bytes1(uint8(i))));
      payees[i] = address(uint160(0x9000 + i));
    }

    vm.prank(organiser);
    uint256 id = rounds.open{value: 10 ether}(
      "Mega Round",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    assertEq(id, 1);
    Rounds.Round memory r = rounds.roundOf(id);
    assertEq(r.projectCount, 8);
    assertEq(r.pool, 10 ether);

    Rounds.Project[] memory pList = rounds.projectsOf(id);
    assertEq(pList.length, 8);
    assertEq(pList[0].payee, payees[0]);
  }

  function test_GiveAccumulatesPerDonor() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 10 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    // Donor A gives 1 BOT to Project 0
    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 0);

    assertEq(rounds.givenBy(id, 0, donorA), 1 ether);
    Rounds.Project[] memory p = rounds.projectsOf(id);
    assertEq(p[0].raised, 1 ether);
    assertEq(p[0].sqrtSum, rounds.isqrt(1 ether));

    // Donor A gives another 3 BOT to Project 0
    vm.prank(donorA);
    rounds.give{value: 3 ether}(id, 0);

    assertEq(rounds.givenBy(id, 0, donorA), 4 ether);
    p = rounds.projectsOf(id);
    assertEq(p[0].raised, 4 ether);
    assertEq(p[0].sqrtSum, rounds.isqrt(4 ether));
  }

  function test_SqrtSumUpdatesOnSecondGift() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 10 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    // Donor A gives 1 ether, Donor B gives 4 ether
    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 0);

    vm.prank(donorB);
    rounds.give{value: 4 ether}(id, 0);

    Rounds.Project[] memory p = rounds.projectsOf(id);
    uint256 expectedSum = rounds.isqrt(1 ether) + rounds.isqrt(4 ether);
    assertEq(p[0].sqrtSum, expectedSum);
  }

  function test_OneBigGiftVersusManySmall() public {
    // Project 0 gets one big gift of 4 BOT
    // Project 1 gets four small gifts of 1 BOT each (total 4 BOT)
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 100 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: 4 ether}(id, 0);

    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 1);
    vm.prank(donorB);
    rounds.give{value: 1 ether}(id, 1);
    vm.prank(donorC);
    rounds.give{value: 1 ether}(id, 1);
    vm.prank(donorD);
    rounds.give{value: 1 ether}(id, 1);

    (uint256[] memory matches, ) = rounds.preview(id);

    // Project 0: sqrtSum = sqrt(4) = 2. ideal = 2^2 - 4 = 0 match!
    // Project 1: sqrtSum = 4 * sqrt(1) = 4. ideal = 4^2 - 4 = 12 match!
    assertEq(matches[0], 0);
    assertGt(matches[1], 0);
  }

  function test_FinalizePaysRaisedPlusMatch() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 50 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 0);
    vm.prank(donorB);
    rounds.give{value: 1 ether}(id, 0);

    vm.warp(block.timestamp + 3 days);

    rounds.finalize(id);

    // Payee 0 should have pending = raised (2 ether) + matched
    (uint256[] memory matches, uint256 ret) = rounds.preview(id);
    assertGt(rounds.pending(payee1), 2 ether);
    assertGt(rounds.pending(organiser), 0); // unspent pool returned
  }

  function test_ScalesDownWhenPoolTooSmall() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    // Tiny pool of 1 ether
    vm.prank(organiser);
    uint256 id = rounds.open{value: 1 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 0);
    vm.prank(donorB);
    rounds.give{value: 1 ether}(id, 0);
    vm.prank(donorC);
    rounds.give{value: 1 ether}(id, 0);

    // Ideal match is (3*1e9)^2 - 3e18 = 9e18 - 3e18 = 6 ether > pool (1 ether)
    (uint256[] memory matches, uint256 returned) = rounds.preview(id);
    assertEq(returned, 0);
    assertEq(matches[0], 1 ether); // capped at pool
  }

  function test_NoGiftsReturnsPoolToOrganiser() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 5 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.warp(block.timestamp + 3 days);
    rounds.finalize(id);

    assertEq(rounds.pending(organiser), 5 ether);
  }

  function test_FinalizeOnlyAfterEnd_ArgsEndsAt() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint64 endsAt = uint64(block.timestamp + 2 days);
    uint256 id = rounds.open{value: 5 ether}("Round 1", endsAt, names, payees);

    vm.expectRevert(abi.encodeWithSelector(Rounds.StillOpen.selector, endsAt));
    rounds.finalize(id);
  }

  function test_FinalizeOnce() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 5 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.warp(block.timestamp + 3 days);
    rounds.finalize(id);

    vm.expectRevert(Rounds.AlreadyFinalized.selector);
    rounds.finalize(id);
  }

  function test_SelfGiveReverts() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 5 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    // Organiser cannot give
    vm.prank(organiser);
    vm.expectRevert(Rounds.SelfGive.selector);
    rounds.give{value: 1 ether}(id, 0);

    // Payee cannot give to own project
    vm.deal(payee1, 10 ether);
    vm.prank(payee1);
    vm.expectRevert(Rounds.SelfGive.selector);
    rounds.give{value: 1 ether}(id, 0);
  }

  function test_BadGiftBounds_ArgsMinMax() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 5 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    // Below MIN_GIFT
    vm.prank(donorA);
    vm.expectRevert(abi.encodeWithSelector(Rounds.BadGift.selector, 1e15, 1e24));
    rounds.give{value: 1e14}(id, 0);

    // Above MAX_GIFT
    vm.deal(donorA, 2e24);
    vm.prank(donorA);
    vm.expectRevert(abi.encodeWithSelector(Rounds.BadGift.selector, 1e15, 1e24));
    rounds.give{value: 1e24 + 1}(id, 0);
  }

  function test_BadProjectsRevert() public {
    string[] memory names = new string[](0);
    address[] memory payees = new address[](0);

    vm.prank(organiser);
    vm.expectRevert(Rounds.BadProjects.selector);
    rounds.open{value: 1 ether}("Test", uint64(block.timestamp + 2 days), names, payees);

    // Payee zero address
    string[] memory n2 = new string[](1);
    n2[0] = "Alpha";
    address[] memory p2 = new address[](1);
    p2[0] = address(0);

    vm.prank(organiser);
    vm.expectRevert(Rounds.BadProjects.selector);
    rounds.open{value: 1 ether}("Test", uint64(block.timestamp + 2 days), n2, p2);

    // Payee is organiser
    p2[0] = organiser;
    vm.prank(organiser);
    vm.expectRevert(Rounds.BadProjects.selector);
    rounds.open{value: 1 ether}("Test", uint64(block.timestamp + 2 days), n2, p2);
  }

  function test_PreviewEqualsFinalize() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 10 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 0);
    vm.prank(donorB);
    rounds.give{value: 2 ether}(id, 0);
    vm.prank(donorC);
    rounds.give{value: 1.5 ether}(id, 1);

    (uint256[] memory matches, uint256 returned) = rounds.preview(id);

    vm.warp(block.timestamp + 3 days);
    rounds.finalize(id);

    assertEq(rounds.pending(payee1), 3 ether + matches[0]);
    assertEq(rounds.pending(payee2), 1.5 ether + matches[1]);
    assertEq(rounds.pending(organiser), returned);
  }

  function test_IsqrtExactOnSquaresAndFloor() public {
    assertEq(rounds.isqrt(0), 0);
    assertEq(rounds.isqrt(1), 1);
    assertEq(rounds.isqrt(4), 2);
    assertEq(rounds.isqrt(9), 3);
    assertEq(rounds.isqrt(10), 3);
    assertEq(rounds.isqrt(15), 3);
    assertEq(rounds.isqrt(16), 4);
    assertEq(rounds.isqrt(100), 10);
    assertEq(rounds.isqrt(1e18), 1e9);
  }

  function test_NoOverflowAtMaxGift() public {
    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: 1000 ether}(
      "Round 1",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    // Give large valid gift
    vm.deal(donorA, 1e24);
    vm.prank(donorA);
    rounds.give{value: 1e24}(id, 0);

    Rounds.Project[] memory p = rounds.projectsOf(id);
    assertEq(p[0].raised, 1e24);
  }

  function test_ReentrantWithdrawBlocked() public {
    MaliciousRecipient attacker = new MaliciousRecipient(rounds);

    string[] memory names = new string[](1);
    names[0] = "Attack Proj";
    address[] memory payees = new address[](1);
    payees[0] = address(attacker);

    vm.prank(organiser);
    uint256 id = rounds.open{value: 2 ether}(
      "Round Hack",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: 1 ether}(id, 0);

    vm.warp(block.timestamp + 3 days);
    rounds.finalize(id);

    attacker.setAttack(true);
    vm.expectRevert(Rounds.TransferFailed.selector);
    attacker.triggerWithdraw();
  }

  function testFuzz_FinalizeConserves(uint96 poolRaw, uint64 giftARaw, uint64 giftBRaw) public {
    uint128 poolAmount = uint128(bound(poolRaw, 1 ether, 100 ether));
    uint64 giftA = uint64(bound(giftARaw, 1e15, 10 ether));
    uint64 giftB = uint64(bound(giftBRaw, 1e15, 10 ether));

    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: poolAmount}(
      "Fuzz Round",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: giftA}(id, 0);
    vm.prank(donorB);
    rounds.give{value: giftB}(id, 1);

    (uint256[] memory matches, uint256 returned) = rounds.preview(id);

    uint256 totalMatch = 0;
    for (uint256 i = 0; i < matches.length; i++) {
      totalMatch += matches[i];
    }

    assertLe(totalMatch, poolAmount);
    assertEq(totalMatch + returned, poolAmount);

    vm.warp(block.timestamp + 3 days);
    rounds.finalize(id);

    // Invariant: sum of all allocations equals total funds deposited
    uint256 totalOut = rounds.pending(payee1) + rounds.pending(payee2) + rounds.pending(payee3) + rounds.pending(organiser);
    assertEq(totalOut, uint256(poolAmount) + giftA + giftB);
  }

  function testFuzz_MatchNeverExceedsPool(uint96 poolRaw, uint64 g1Raw, uint64 g2Raw, uint64 g3Raw) public {
    uint128 poolAmount = uint128(bound(poolRaw, 1 ether, 50 ether));
    uint64 g1 = uint64(bound(g1Raw, 1e15, 5 ether));
    uint64 g2 = uint64(bound(g2Raw, 1e15, 5 ether));
    uint64 g3 = uint64(bound(g3Raw, 1e15, 5 ether));

    (string[] memory names, address[] memory payees) = _defaultProjects();
    vm.prank(organiser);
    uint256 id = rounds.open{value: poolAmount}(
      "Match Pool Fuzz",
      uint64(block.timestamp + 2 days),
      names,
      payees
    );

    vm.prank(donorA);
    rounds.give{value: g1}(id, 0);
    vm.prank(donorB);
    rounds.give{value: g2}(id, 0);
    vm.prank(donorC);
    rounds.give{value: g3}(id, 1);

    (uint256[] memory matches, ) = rounds.preview(id);
    uint256 sumMatches = 0;
    for (uint256 i = 0; i < matches.length; i++) {
      sumMatches += matches[i];
    }
    assertLe(sumMatches, poolAmount);
  }

  function test_SpecificMutantKillers() public {
    // 1. Kill Rounds.sol:167 pNameBytes.length == MAX_PROJECT_NAME (40 bytes) allowed
    string[] memory n40 = new string[](1);
    bytes memory exact40 = new bytes(40);
    for (uint256 i = 0; i < 40; i++) exact40[i] = "a";
    n40[0] = string(exact40);
    address[] memory p40 = new address[](1);
    p40[0] = payee1;

    vm.prank(organiser);
    uint256 rId40 = rounds.open{value: 1 ether}("Exact 40 Proj", uint64(block.timestamp + 2 days), n40, p40);
    assertEq(rId40, 1);

    // 2. Kill Rounds.sol:346 sumIdeal == pool in preview
    // Give gifts so sumIdeal == pool
    vm.prank(donorA);
    rounds.give{value: 1 ether}(rId40, 0);
    vm.prank(donorB);
    rounds.give{value: 1 ether}(rId40, 0);
    // ideal = (2*1e9)^2 - 2e18 = 4e18 - 2e18 = 2 ether.
    // Let's create a round with pool == 2 ether
    string[] memory n2 = new string[](1);
    n2[0] = "Proj Two";
    address[] memory p2 = new address[](1);
    p2[0] = payee2;
    vm.prank(organiser);
    uint256 rIdExact = rounds.open{value: 2 ether}("Exact Pool Match", uint64(block.timestamp + 2 days), n2, p2);

    vm.prank(donorA);
    rounds.give{value: 1 ether}(rIdExact, 0);
    vm.prank(donorB);
    rounds.give{value: 1 ether}(rIdExact, 0);

    (uint256[] memory prevExact, uint256 retExact) = rounds.preview(rIdExact);
    assertEq(prevExact[0], 2 ether);
    assertEq(retExact, 0);

    // 3. Kill Rounds.sol:371, 372, 378, 379 - latest() pagination and boundary
    (uint256[] memory ids, Rounds.Round[] memory rList) = rounds.latest(0, 10);
    assertEq(ids.length, 2);
    assertEq(ids[0], 2);
    assertEq(ids[1], 1);
    assertEq(rList.length, 2);

    (uint256[] memory idsOffset, ) = rounds.latest(1, 1);
    assertEq(idsOffset.length, 1);
    assertEq(idsOffset[0], 1);

    // 4. Kill Rounds.sol:109 & 281 - withdraw twice in same transaction or normal sequence
    vm.warp(block.timestamp + 3 days);
    rounds.finalize(rIdExact);
    uint256 p2Bal = rounds.pending(payee2);
    assertGt(p2Bal, 0);

    vm.prank(payee2);
    rounds.withdraw();
    assertEq(rounds.pending(payee2), 0);
    // Second withdraw reverts NothingToWithdraw
    vm.prank(payee2);
    vm.expectRevert(Rounds.NothingToWithdraw.selector);
    rounds.withdraw();
  }
}
