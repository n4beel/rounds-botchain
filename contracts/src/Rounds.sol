// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Rounds
 * @notice Quadratic funding round for up to 8 named projects.
 *
 * For each project, let s = Σ √(each donor's total gift to it).
 * Its ideal funding is s²; the ideal match is s² - gifts raised.
 * If the ideal matches add up to more than the pool, they are scaled down proportionally.
 *
 * Bounds keep pool * ideal inside uint256: with N <= raised / MIN_GIFT = 1e12 donors,
 * Cauchy-Schwarz gives sqrtSum² <= N * raised <= 1e39, and 1e39 * 1e27 = 1e66 < 2^256.
 */
contract Rounds {
  // --- Constants ---
  uint8 public constant MAX_PROJECTS = 8;
  uint8 public constant MAX_NAME_BYTES = 48;
  uint8 public constant MAX_PROJECT_NAME = 40;
  uint256 public constant MIN_GIFT = 1e15; // 0.001 BOT
  uint256 public constant MAX_GIFT = 1e24; // 1,000,000 BOT
  uint256 public constant MAX_POOL = 1e27;
  uint256 public constant MAX_RAISED = 1e27;
  uint64 public constant MIN_DURATION = 1 hours;
  uint64 public constant MAX_DURATION = 90 days;
  uint256 public constant MAX_PAGE = 50;

  // --- Structs ---
  struct Round {
    address organiser;
    uint64 endsAt;
    uint8 projectCount;
    bool finalized;
    uint128 pool;
    string name;
  }

  struct Project {
    address payee;
    uint128 raised;
    uint256 sqrtSum; // Σ isqrt(donor total)
    string name;
  }

  // --- Storage ---
  mapping(uint256 => Round) private _rounds;
  mapping(uint256 => Project[]) private _projects;
  mapping(uint256 => mapping(uint8 => mapping(address => uint128))) private _given;
  mapping(address => uint256) public pending;
  uint256 public roundCount;

  bool private _locked;

  // --- Custom Errors ---
  error ZeroPool();
  error BadPool();
  error BadProjects();
  error BadEnd();
  error NoSuchRound();
  error NoSuchProject();
  error Ended();
  error StillOpen(uint64 endsAt);
  error AlreadyFinalized();
  error BadGift(uint256 min, uint256 max);
  error SelfGive();
  error NothingToWithdraw();
  error TransferFailed();
  error ReentrantCall();

  // --- Events ---
  event Opened(
    uint256 indexed id,
    address indexed organiser,
    string name,
    uint128 pool,
    uint64 endsAt,
    uint8 projectCount
  );
  event ProjectAdded(
    uint256 indexed id,
    uint8 indexed index,
    string name,
    address payee
  );
  event Gave(
    uint256 indexed id,
    uint8 indexed project,
    address indexed donor,
    uint256 amount,
    uint256 donorTotal
  );
  event Allocated(
    uint256 indexed id,
    uint8 indexed project,
    uint256 raised,
    uint256 matched
  );
  event Finalized(
    uint256 indexed id,
    uint256 totalMatched,
    uint256 returned
  );
  event Withdrawn(address indexed to, uint256 amount);

  modifier nonReentrant() {
    if (_locked) revert ReentrantCall();
    _locked = true;
    _;
    _locked = false;
  }

  // --- Babylonian Integer Square Root ---
  function isqrt(uint256 x) public pure returns (uint256 y) {
    if (x == 0) return 0;
    uint256 z = (x + 1) / 2;
    y = x;
    while (z < y) {
      y = z;
      z = (x / z + z) / 2;
    }
  }

  // --- Core External Functions ---

  function open(
    string calldata name,
    uint64 endsAt,
    string[] calldata projectNames,
    address[] calldata payees
  ) external payable returns (uint256 id) {
    if (msg.value == 0) revert ZeroPool();
    if (msg.value > MAX_POOL) revert BadPool();

    bytes calldata nameBytes = bytes(name);
    if (nameBytes.length == 0 || nameBytes.length > MAX_NAME_BYTES) {
      revert BadProjects();
    }

    uint256 pLen = projectNames.length;
    if (pLen == 0 || pLen > MAX_PROJECTS || pLen != payees.length) {
      revert BadProjects();
    }

    uint64 nowSec = uint64(block.timestamp);
    if (endsAt < nowSec + MIN_DURATION || endsAt > nowSec + MAX_DURATION) {
      revert BadEnd();
    }

    id = ++roundCount;
    _rounds[id] = Round({
      organiser: msg.sender,
      endsAt: endsAt,
      projectCount: uint8(pLen),
      finalized: false,
      pool: uint128(msg.value),
      name: name
    });

    emit Opened(id, msg.sender, name, uint128(msg.value), endsAt, uint8(pLen));

    for (uint8 i = 0; i < pLen; i++) {
      bytes calldata pNameBytes = bytes(projectNames[i]);
      address payee = payees[i];

      if (
        pNameBytes.length == 0 ||
        pNameBytes.length > MAX_PROJECT_NAME ||
        payee == address(0) ||
        payee == msg.sender
      ) {
        revert BadProjects();
      }

      _projects[id].push(Project({
        payee: payee,
        raised: 0,
        sqrtSum: 0,
        name: projectNames[i]
      }));

      emit ProjectAdded(id, i, projectNames[i], payee);
    }
  }

  function give(uint256 id, uint8 project) external payable {
    if (id == 0 || id > roundCount) revert NoSuchRound();
    Round storage rnd = _rounds[id];

    if (block.timestamp >= rnd.endsAt) revert Ended();
    if (project >= rnd.projectCount) revert NoSuchProject();
    if (msg.value < MIN_GIFT || msg.value > MAX_GIFT) {
      revert BadGift(MIN_GIFT, MAX_GIFT);
    }

    Project storage proj = _projects[id][project];
    if (msg.sender == rnd.organiser || msg.sender == proj.payee) {
      revert SelfGive();
    }

    uint128 oldGiven = _given[id][project][msg.sender];
    uint256 newGiven256 = uint256(oldGiven) + msg.value;
    if (newGiven256 > MAX_GIFT) {
      revert BadGift(MIN_GIFT, MAX_GIFT);
    }
    uint128 newGiven = uint128(newGiven256);

    uint256 newRaised = uint256(proj.raised) + msg.value;
    if (newRaised > MAX_RAISED) {
      revert BadGift(MIN_GIFT, MAX_GIFT);
    }

    _given[id][project][msg.sender] = newGiven;
    proj.raised = uint128(newRaised);

    // Exact update of sqrtSum for repeat donors:
    // sqrtSum += isqrt(newGiven) - isqrt(oldGiven)
    uint256 oldRoot = isqrt(oldGiven);
    uint256 newRoot = isqrt(newGiven);
    proj.sqrtSum = proj.sqrtSum + newRoot - oldRoot;

    emit Gave(id, project, msg.sender, msg.value, newGiven);
  }

  function finalize(uint256 id) external {
    if (id == 0 || id > roundCount) revert NoSuchRound();
    Round storage rnd = _rounds[id];

    if (block.timestamp < rnd.endsAt) revert StillOpen(rnd.endsAt);
    if (rnd.finalized) revert AlreadyFinalized();

    rnd.finalized = true;

    uint8 count = rnd.projectCount;
    uint256[] memory ideals = new uint256[](count);
    uint256 sumIdeal = 0;

    for (uint8 i = 0; i < count; i++) {
      Project storage p = _projects[id][i];
      uint256 s = p.sqrtSum;
      uint256 s2 = s * s;
      uint256 raised = uint256(p.raised);
      if (s2 > raised) {
        uint256 ideal = s2 - raised;
        ideals[i] = ideal;
        sumIdeal += ideal;
      } else {
        ideals[i] = 0;
      }
    }

    uint256 pool = uint256(rnd.pool);
    uint256 totalMatched = 0;

    for (uint8 i = 0; i < count; i++) {
      Project storage p = _projects[id][i];
      uint256 ideal = ideals[i];
      uint256 matched = 0;

      if (ideal > 0 && sumIdeal > 0) {
        if (sumIdeal <= pool) {
          matched = ideal;
        } else {
          matched = (pool * ideal) / sumIdeal;
        }
      }

      totalMatched += matched;
      pending[p.payee] += uint256(p.raised) + matched;

      emit Allocated(id, i, p.raised, matched);
    }

    uint256 returned = pool > totalMatched ? pool - totalMatched : 0;
    if (returned > 0) {
      pending[rnd.organiser] += returned;
    }

    emit Finalized(id, totalMatched, returned);
  }

  function withdraw() external nonReentrant {
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;

    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Withdrawn(msg.sender, amount);
  }

  // --- Views ---

  function roundOf(uint256 id) external view returns (Round memory) {
    if (id == 0 || id > roundCount) revert NoSuchRound();
    return _rounds[id];
  }

  function projectsOf(uint256 id) external view returns (Project[] memory) {
    if (id == 0 || id > roundCount) revert NoSuchRound();
    return _projects[id];
  }

  function givenBy(uint256 id, uint8 project, address who) external view returns (uint128) {
    if (id == 0 || id > roundCount) revert NoSuchRound();
    return _given[id][project][who];
  }

  function preview(uint256 id)
    external
    view
    returns (uint256[] memory matches, uint256 returned)
  {
    if (id == 0 || id > roundCount) revert NoSuchRound();
    Round storage rnd = _rounds[id];

    uint8 count = rnd.projectCount;
    matches = new uint256[](count);

    uint256[] memory ideals = new uint256[](count);
    uint256 sumIdeal = 0;

    for (uint8 i = 0; i < count; i++) {
      Project storage p = _projects[id][i];
      uint256 s = p.sqrtSum;
      uint256 s2 = s * s;
      uint256 raised = uint256(p.raised);
      if (s2 > raised) {
        uint256 ideal = s2 - raised;
        ideals[i] = ideal;
        sumIdeal += ideal;
      } else {
        ideals[i] = 0;
      }
    }

    uint256 pool = uint256(rnd.pool);
    uint256 totalMatched = 0;

    for (uint8 i = 0; i < count; i++) {
      uint256 ideal = ideals[i];
      uint256 matched = 0;

      if (ideal > 0 && sumIdeal > 0) {
        if (sumIdeal <= pool) {
          matched = ideal;
        } else {
          matched = (pool * ideal) / sumIdeal;
        }
      }

      matches[i] = matched;
      totalMatched += matched;
    }

    returned = pool > totalMatched ? pool - totalMatched : 0;
  }

  function latest(uint256 offset, uint256 count)
    external
    view
    returns (uint256[] memory ids, Round[] memory rList)
  {
    if (count > MAX_PAGE) count = MAX_PAGE;
    uint256 total = roundCount;
    if (offset >= total) {
      return (new uint256[](0), new Round[](0));
    }

    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    rList = new Round[](count);

    for (uint256 i = 0; i < count; i++) {
      uint256 rId = total - (offset + i);
      ids[i] = rId;
      rList[i] = _rounds[rId];
    }
  }
}
