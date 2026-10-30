// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DLottery
 * @notice Decentralized lottery settled on-chain. Participants buy numbered tickets
 *         (1..10) with USD8. A draw closes when the maximum number of participants is
 *         reached or after 24 hours. When the minimum participant count is met the draw
 *         is settled against a generated lucky number; otherwise it is cancelled and
 *         principals are refundable.
 * @dev The contract is the authoritative source of all lottery and financial state
 *      (PRD section 2). Requirement identifiers (SC-xx) are referenced inline.
 *
 *      Randomness (SC-16): the lucky number is derived from on-chain entropy
 *      (block.prevrandao + draw salt). This is adequate for an MVP on a test network.
 *      A production deployment MUST replace `_generateLuckyNumber` with a verifiable
 *      randomness source such as Chainlink VRF to prevent miner/validator manipulation.
 */
contract DLottery is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Lifecycle status of a draw (PRD 5.1 draw lifecycle).
    enum DrawStatus {
        None, // 0 - uninitialised
        Active, // 1 - accepting ticket purchases (and the closed-but-unsettled window)
        Completed, // 2 - settled with a winner, prize claimable
        NoWinner, // 3 - settled with no match, pool rolled over
        Cancelled // 4 - insufficient participants, refunds enabled
    }

    struct Draw {
        uint256 id; // SC-02 unique draw id
        uint256 startTime; // SC-03 start timestamp
        uint256 endTime; // startTime + drawDuration (24h deadline, SC-08)
        uint256 ticketPrice; // price per ticket (snapshot at draw start)
        uint256 participantCount; // number of tickets sold
        uint256 rollover; // R: funds carried in from previous draw(s) (SC-05)
        uint256 totalPool; // P_total = rollover + N*T (set at settlement)
        uint256 daoFee; // fee transferred to the DAO at settlement
        uint256 winnerPrize; // amount claimable by the winner
        uint8 luckyNumber; // 0 until drawn; otherwise 1..10 (SC-16)
        uint8 minParticipants; // minimum required to settle (configurable, SC-15)
        address winner; // address(0) when there is no winner
        DrawStatus status;
        bool prizeClaimed; // SC-24 winner payout guard
    }

    // ---------------------------------------------------------------------
    // Constants (PRD 1.3 core business rules)
    // ---------------------------------------------------------------------

    uint8 public constant MAX_PARTICIPANTS = 5; // SC-09 maximum participants per draw
    uint8 public constant MIN_TICKET_NUMBER = 1; // SC-11 ticket number range
    uint8 public constant MAX_TICKET_NUMBER = 10; // SC-11 ticket number range
    uint256 public constant DRAW_DURATION = 24 hours; // SC-08 draw duration
    uint256 public constant DAO_FEE_BPS = 500; // 5% in basis points (SC-22/5.5)
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------------
    // Configuration (SC-01)
    // ---------------------------------------------------------------------

    IERC20 public immutable usd8; // payment token (PRD: USD8)
    address public dao; // DAO fee recipient (SC-23)
    uint256 public ticketPrice; // default ticket price for new draws (10 USD8)
    uint8 public minParticipants; // configurable minimum (e.g. 2)

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    uint256 public currentDrawId; // id of the latest/active draw
    uint256 public pendingRollover; // rollover waiting to seed the next draw (SC-05/SC-20)

    mapping(uint256 => Draw) private _draws;
    // drawId => wallet => ticket number (0 means "no ticket", SC-10)
    mapping(uint256 => mapping(address => uint8)) private _ticketOf;
    // drawId => ticket number => owner (SC-12 duplicate prevention)
    mapping(uint256 => mapping(uint8 => address)) private _numberOwner;
    // drawId => list of participants (for enumeration / allocation table)
    mapping(uint256 => address[]) private _participants;
    // drawId => wallet => refund already claimed (SC-26)
    mapping(uint256 => mapping(address => bool)) private _refundClaimed;

    // ---------------------------------------------------------------------
    // Events (PRD 2.5 required events)
    // ---------------------------------------------------------------------

    /// @notice Emitted when a new draw begins.
    event DrawStarted(
        uint256 indexed drawId,
        uint256 startTime,
        uint256 endTime,
        uint256 ticketPrice,
        uint8 minParticipants,
        uint256 rollover
    );

    /// @notice Emitted for each ticket purchase (SC-13).
    event TicketBought(
        uint256 indexed drawId,
        address indexed buyer,
        uint8 ticketNumber,
        uint256 participantCount
    );

    /// @notice Emitted when the lucky number is generated and the result recorded.
    event LotteryDrawn(
        uint256 indexed drawId,
        uint8 luckyNumber,
        address indexed winner,
        uint256 totalPool,
        uint256 daoFee,
        uint256 winnerPrize
    );

    /// @notice Emitted when a draw is cancelled for insufficient participants.
    event DrawCancelled(uint256 indexed drawId, uint256 participantCount, uint256 rollover);

    /// @notice Emitted when the winner claims the prize.
    event PrizeClaimed(
        uint256 indexed drawId,
        address indexed winner,
        uint256 amount,
        uint256 daoFee
    );

    /// @notice Emitted when a participant claims a refund.
    event RefundClaimed(uint256 indexed drawId, address indexed participant, uint256 amount);

    /// @notice Emitted when configuration is updated by the owner.
    event ConfigUpdated(address dao, uint256 ticketPrice, uint8 minParticipants);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error InvalidTicketPrice();
    error InvalidMinParticipants();
    error DrawNotActive();
    error DrawExpired();
    error DrawFull();
    error AlreadyParticipating();
    error TicketNumberOutOfRange();
    error TicketNumberTaken();
    error DrawNotEligible();
    error PreviousDrawNotFinalized();
    error NotCompleted();
    error NotWinner();
    error PrizeAlreadyClaimed();
    error NotCancelled();
    error NotParticipant();
    error RefundAlreadyClaimed();

    // ---------------------------------------------------------------------
    // Constructor (SC-01 initialise configuration + SC-03 start first draw)
    // ---------------------------------------------------------------------

    /**
     * @param usd8_ USD8 ERC-20 token address used for payments.
     * @param dao_ DAO address that receives fees.
     * @param ticketPrice_ price per ticket (in USD8 base units, e.g. 10e18).
     * @param minParticipants_ configurable minimum participants to settle (e.g. 2).
     */
    constructor(
        address usd8_,
        address dao_,
        uint256 ticketPrice_,
        uint8 minParticipants_
    ) Ownable(msg.sender) {
        if (usd8_ == address(0) || dao_ == address(0)) revert ZeroAddress();
        if (ticketPrice_ == 0) revert InvalidTicketPrice();
        _validateMin(minParticipants_);

        usd8 = IERC20(usd8_);
        dao = dao_;
        ticketPrice = ticketPrice_;
        minParticipants = minParticipants_;

        emit ConfigUpdated(dao_, ticketPrice_, minParticipants_);

        // SC-03: start the first draw immediately with no rollover.
        _startNewDraw(0);
    }

    // ---------------------------------------------------------------------
    // Admin configuration (SC-01)
    // ---------------------------------------------------------------------

    /// @notice Update the DAO fee recipient.
    function setDao(address dao_) external onlyOwner {
        if (dao_ == address(0)) revert ZeroAddress();
        dao = dao_;
        emit ConfigUpdated(dao, ticketPrice, minParticipants);
    }

    /// @notice Update the default ticket price for *future* draws.
    /// @dev Does not affect the in-flight draw, whose price is snapshotted at start.
    function setTicketPrice(uint256 ticketPrice_) external onlyOwner {
        if (ticketPrice_ == 0) revert InvalidTicketPrice();
        ticketPrice = ticketPrice_;
        emit ConfigUpdated(dao, ticketPrice, minParticipants);
    }

    /// @notice Update the configurable minimum participants for *future* draws.
    function setMinParticipants(uint8 minParticipants_) external onlyOwner {
        _validateMin(minParticipants_);
        minParticipants = minParticipants_;
        emit ConfigUpdated(dao, ticketPrice, minParticipants);
    }

    function _validateMin(uint8 minParticipants_) private pure {
        // Minimum must be at least 1 and cannot exceed the maximum capacity.
        if (minParticipants_ == 0 || minParticipants_ > MAX_PARTICIPANTS) {
            revert InvalidMinParticipants();
        }
    }

    // ---------------------------------------------------------------------
    // Ticket purchase (SC-07..SC-13)
    // ---------------------------------------------------------------------

    /**
     * @notice Buy a ticket with a chosen number (1..10) in the current draw.
     * @param ticketNumber desired ticket number in the inclusive range [1, 10].
     */
    function buyTicket(uint8 ticketNumber) external nonReentrant {
        Draw storage draw = _draws[currentDrawId];

        // SC-08: validate draw status and the 24-hour deadline.
        if (draw.status != DrawStatus.Active) revert DrawNotActive();
        if (block.timestamp > draw.endTime) revert DrawExpired();

        // SC-09: enforce the maximum participant limit.
        if (draw.participantCount >= MAX_PARTICIPANTS) revert DrawFull();

        // SC-10: only one ticket per wallet per draw.
        if (_ticketOf[currentDrawId][msg.sender] != 0) revert AlreadyParticipating();

        // SC-11: assign a unique ticket number from 1 to 10.
        if (ticketNumber < MIN_TICKET_NUMBER || ticketNumber > MAX_TICKET_NUMBER) {
            revert TicketNumberOutOfRange();
        }

        // SC-12: prevent duplicate ticket numbers within a draw.
        if (_numberOwner[currentDrawId][ticketNumber] != address(0)) revert TicketNumberTaken();

        // Record the ticket.
        _ticketOf[currentDrawId][msg.sender] = ticketNumber;
        _numberOwner[currentDrawId][ticketNumber] = msg.sender;
        _participants[currentDrawId].push(msg.sender);
        draw.participantCount += 1;

        // SC-07: accept USD8 as ticket payment (pull funds into the contract).
        usd8.safeTransferFrom(msg.sender, address(this), draw.ticketPrice);

        // SC-13: emit an event for each ticket purchase.
        emit TicketBought(currentDrawId, msg.sender, ticketNumber, draw.participantCount);
    }

    // ---------------------------------------------------------------------
    // Settlement (SC-14..SC-20)
    // ---------------------------------------------------------------------

    /**
     * @notice Settle the current draw once it is eligible (capacity reached or the
     *         24-hour deadline has passed). If the minimum participant requirement is
     *         not met the draw is cancelled; otherwise a lucky number is generated and
     *         the result recorded. A fresh draw is always started afterwards.
     * @dev Permissionless so that settlement cannot be withheld by a single party.
     */
    function performDraw() external nonReentrant {
        uint256 drawId = currentDrawId;
        Draw storage draw = _draws[drawId];

        // SC-14: only after the round is eligible for settlement.
        if (draw.status != DrawStatus.Active) revert DrawNotActive();
        if (!_isEligibleForDraw(draw)) revert DrawNotEligible();

        // SC-15: verify the minimum participant requirement.
        if (draw.participantCount < draw.minParticipants) {
            // Insufficient participants -> cancel and enable refunds (PRD 1.3 / 5.1).
            draw.status = DrawStatus.Cancelled;
            // Principals are refundable individually (SC-26); any rollover carried into
            // this draw belongs to the protocol and is forwarded to the next draw.
            uint256 carry = draw.rollover;
            pendingRollover = carry; // SC-05: carry forward rollover funds.

            emit DrawCancelled(drawId, draw.participantCount, carry);
            _startNewDraw(carry);
            return;
        }

        // SC-16: generate the lucky number (1..10).
        uint8 lucky = _generateLuckyNumber(draw);
        draw.luckyNumber = lucky;

        // P_total = R + (N * T)  (PRD 5.4)
        uint256 totalPool = draw.rollover + (draw.participantCount * draw.ticketPrice);
        draw.totalPool = totalPool;

        // SC-17: determine whether any participant holds the lucky number.
        address winner = _numberOwner[drawId][lucky];

        if (winner != address(0)) {
            // SC-18: record the winner.
            draw.winner = winner;

            // SC-22: net profit = P_total - T (winner principal excluded, PRD 5.4).
            uint256 netProfit = totalPool - draw.ticketPrice;
            // DAO fee = max(0, netProfit * 5%) (PRD 5.5).
            uint256 daoFee = (netProfit * DAO_FEE_BPS) / BPS_DENOMINATOR;
            // Winner claimable = P_total - DAO fee (PRD 5.5).
            uint256 winnerPrize = totalPool - daoFee;

            draw.daoFee = daoFee;
            draw.winnerPrize = winnerPrize;
            draw.status = DrawStatus.Completed;
            pendingRollover = 0;

            emit LotteryDrawn(drawId, lucky, winner, totalPool, daoFee, winnerPrize);
            _startNewDraw(0);
        } else {
            // SC-19: mark the round as NO_WINNER when no match exists.
            draw.status = DrawStatus.NoWinner;
            // SC-20: roll over the prize pool when there is no winner.
            pendingRollover = totalPool;

            emit LotteryDrawn(drawId, lucky, address(0), totalPool, 0, 0);
            _startNewDraw(totalPool);
        }
    }

    // ---------------------------------------------------------------------
    // Prize claim (SC-21..SC-24)
    // ---------------------------------------------------------------------

    /**
     * @notice Winner claims their prize for a completed draw. The DAO fee is sent to
     *         the DAO and the remaining prize to the winner.
     */
    function claimPrize(uint256 drawId) external nonReentrant {
        Draw storage draw = _draws[drawId];

        if (draw.status != DrawStatus.Completed) revert NotCompleted();
        // SC-21: only the winner may claim the prize.
        if (msg.sender != draw.winner) revert NotWinner();
        if (draw.prizeClaimed) revert PrizeAlreadyClaimed();

        draw.prizeClaimed = true; // effects before interactions

        uint256 daoFee = draw.daoFee;
        uint256 winnerPrize = draw.winnerPrize;

        // SC-23: transfer the DAO fee to the DAO.
        if (daoFee > 0) {
            usd8.safeTransfer(dao, daoFee);
        }
        // SC-24: transfer the remaining prize to the winner.
        usd8.safeTransfer(draw.winner, winnerPrize);

        emit PrizeClaimed(drawId, draw.winner, winnerPrize, daoFee);
    }

    // ---------------------------------------------------------------------
    // Refunds (SC-25..SC-26)
    // ---------------------------------------------------------------------

    /**
     * @notice Claim a refund of the ticket principal for a cancelled draw.
     */
    function claimRefund(uint256 drawId) external nonReentrant {
        Draw storage draw = _draws[drawId];

        // SC-25: refunds only for cancelled rounds.
        if (draw.status != DrawStatus.Cancelled) revert NotCancelled();

        if (_ticketOf[drawId][msg.sender] == 0) revert NotParticipant();
        // SC-26: each participant may claim their principal only once.
        if (_refundClaimed[drawId][msg.sender]) revert RefundAlreadyClaimed();

        _refundClaimed[drawId][msg.sender] = true; // effects before interactions

        uint256 amount = draw.ticketPrice;
        usd8.safeTransfer(msg.sender, amount);

        emit RefundClaimed(drawId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Draw management internals (SC-02..SC-06)
    // ---------------------------------------------------------------------

    /// @dev Starts a new draw. SC-02 unique id, SC-03 start time, SC-04 previous draw
    ///      must be finalized, SC-05 carry rollover.
    function _startNewDraw(uint256 rollover) private {
        uint256 previousId = currentDrawId;
        if (previousId != 0) {
            // SC-04: ensure the previous draw is finalized before a new one starts.
            DrawStatus prev = _draws[previousId].status;
            if (prev == DrawStatus.Active) revert PreviousDrawNotFinalized();
        }

        uint256 newId = previousId + 1; // SC-02: unique, monotonically increasing id.
        currentDrawId = newId;
        pendingRollover = 0;

        Draw storage draw = _draws[newId];
        draw.id = newId;
        draw.startTime = block.timestamp; // SC-03
        draw.endTime = block.timestamp + DRAW_DURATION;
        draw.ticketPrice = ticketPrice;
        draw.minParticipants = minParticipants;
        draw.rollover = rollover; // SC-05
        draw.status = DrawStatus.Active; // SC-06

        emit DrawStarted(newId, draw.startTime, draw.endTime, draw.ticketPrice, draw.minParticipants, rollover);
    }

    /// @dev A draw is eligible for settlement when it is full or the deadline passed
    ///      (PRD draw trigger: 5 participants reached, or 24-hour timeout).
    function _isEligibleForDraw(Draw storage draw) private view returns (bool) {
        return
            draw.participantCount >= MAX_PARTICIPANTS || block.timestamp > draw.endTime;
    }

    /// @dev Pseudo-random lucky number in [1, 10]. MVP only — see contract-level note.
    function _generateLuckyNumber(Draw storage draw) private view returns (uint8) {
        uint256 entropy = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    draw.id,
                    draw.participantCount,
                    blockhash(block.number - 1),
                    address(this)
                )
            )
        );
        return uint8((entropy % MAX_TICKET_NUMBER) + 1);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Full draw record.
    function getDraw(uint256 drawId) external view returns (Draw memory) {
        return _draws[drawId];
    }

    /// @notice The current (latest) draw record.
    function getCurrentDraw() external view returns (Draw memory) {
        return _draws[currentDrawId];
    }

    /// @notice Ticket number held by `account` in `drawId` (0 = none).
    function ticketOf(uint256 drawId, address account) external view returns (uint8) {
        return _ticketOf[drawId][account];
    }

    /// @notice Owner of ticket `number` in `drawId` (address(0) = unassigned).
    function numberOwner(uint256 drawId, uint8 number) external view returns (address) {
        return _numberOwner[drawId][number];
    }

    /// @notice Participants of `drawId`.
    function getParticipants(uint256 drawId) external view returns (address[] memory) {
        return _participants[drawId];
    }

    /**
     * @notice Ticket number allocation table for the dashboard (PRD 4.2): for each
     *         number 1..10 returns the holding wallet (address(0) if free).
     * @return owners array of length 10 where index i corresponds to number (i+1).
     */
    function getAllocation(uint256 drawId) external view returns (address[] memory owners) {
        owners = new address[](MAX_TICKET_NUMBER);
        for (uint8 i = 0; i < MAX_TICKET_NUMBER; i++) {
            owners[i] = _numberOwner[drawId][i + 1];
        }
    }

    /// @notice Whether `account` already has a ticket in `drawId` (FE-04).
    function hasTicket(uint256 drawId, address account) external view returns (bool) {
        return _ticketOf[drawId][account] != 0;
    }

    /// @notice Whether the current draw is eligible to be drawn now (FE-05/4.4).
    function isDrawEligible() external view returns (bool) {
        Draw storage draw = _draws[currentDrawId];
        if (draw.status != DrawStatus.Active) return false;
        return _isEligibleForDraw(draw);
    }

    /// @notice Whether `account` can still claim a refund for `drawId`.
    function refundClaimed(uint256 drawId, address account) external view returns (bool) {
        return _refundClaimed[drawId][account];
    }

    /// @notice Seconds remaining before the current draw's deadline (0 if passed).
    function timeRemaining() external view returns (uint256) {
        Draw storage draw = _draws[currentDrawId];
        if (block.timestamp >= draw.endTime) return 0;
        return draw.endTime - block.timestamp;
    }
}
