// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {FeeMath} from "./FeeMath.sol";
import {DealEscrow} from "./DealEscrow.sol";

/// @title EscrowFactory
/// @notice Створює окремий ескроу-клон (EIP-1167, CREATE2) на кожну угоду й одразу вносить у нього гроші заказчика.
/// Немає власника, оновлень і функцій виводу. Прототип, аудиту не проходив.
contract EscrowFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 1000;
    uint64 public constant MIN_REVIEW_PERIOD = 1 days;
    uint64 public constant MAX_REVIEW_PERIOD = 60 days;
    uint64 public constant MAX_DELIVERY_WINDOW = 365 days;
    uint64 public constant MIN_DISPUTE_TIMEOUT = 14 days;
    uint64 public constant MAX_DISPUTE_TIMEOUT = 365 days;

    address public immutable IMPLEMENTATION;
    IERC20 public immutable TOKEN;
    uint16 public immutable FEE_BPS;
    address public immutable ARBITER;
    /// @notice Ліміт ціни однієї угоди (без комісії), в найменших одиницях токена.
    uint256 public immutable MAX_AMOUNT;

    event DealCreated(
        bytes32 indexed dealRef,
        address indexed escrow,
        address indexed client,
        address performer,
        uint256 amount,
        uint256 fee,
        uint64 deliverBy,
        uint64 reviewPeriod
    );

    error ZeroAddress();
    error FeeTooHigh();
    error BadTimeout();
    error BadPercent();
    error InvalidParty();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReviewPeriod();
    error ZeroRef();

    constructor(
        IERC20 token,
        uint16 feeBps,
        address feeRecipient,
        address arbiter,
        uint256 maxAmount,
        uint64 disputeTimeout,
        uint8 fallbackPerformerPct
    ) {
        if (address(token) == address(0) || feeRecipient == address(0) || arbiter == address(0)) revert ZeroAddress();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (maxAmount == 0) revert InvalidAmount();
        if (disputeTimeout < MIN_DISPUTE_TIMEOUT || disputeTimeout > MAX_DISPUTE_TIMEOUT) revert BadTimeout();
        if (fallbackPerformerPct > 100 || fallbackPerformerPct % 5 != 0) revert BadPercent();

        TOKEN = token;
        FEE_BPS = feeBps;
        ARBITER = arbiter;
        MAX_AMOUNT = maxAmount;
        IMPLEMENTATION = address(
            new DealEscrow(token, feeBps, feeRecipient, arbiter, disputeTimeout, fallbackPerformerPct, address(this))
        );
    }

    /// @notice Скільки заказчик має схвалити фабриці: ціна плюс комісія зверху.
    function quoteDeposit(uint256 amount) public view returns (uint256) {
        return amount + FeeMath.ceilFee(amount, FEE_BPS);
    }

    /// @notice Адреса ескроу заказчика `client` з посиланням `dealRef` (відома до створення).
    function predictEscrow(address client, bytes32 dealRef) public view returns (address) {
        return Clones.predictDeterministicAddress(IMPLEMENTATION, _salt(client, dealRef), address(this));
    }

    /// @notice Заказчик (той, хто викликає) створює ескроу й вносить `quoteDeposit(amount)`; потрібне попереднє схвалення.
    /// Пара (заказчик, dealRef) унікальна: повторне створення з тими самими значеннями відхиляється.
    function createDeal(
        address performer,
        uint256 amount,
        uint64 deliverBy,
        uint64 reviewPeriod,
        bytes32 dealRef
    ) external nonReentrant returns (address escrow) {
        if (performer == address(0) || performer == msg.sender) revert InvalidParty();
        if (msg.sender == ARBITER || performer == ARBITER) revert InvalidParty();
        if (amount == 0 || amount > MAX_AMOUNT) revert InvalidAmount();
        if (deliverBy <= block.timestamp || deliverBy > block.timestamp + MAX_DELIVERY_WINDOW) revert InvalidDeadline();
        if (reviewPeriod < MIN_REVIEW_PERIOD || reviewPeriod > MAX_REVIEW_PERIOD) revert InvalidReviewPeriod();
        if (dealRef == bytes32(0)) revert ZeroRef();

        escrow = Clones.cloneDeterministic(IMPLEMENTATION, _salt(msg.sender, dealRef));
        TOKEN.safeTransferFrom(msg.sender, escrow, quoteDeposit(amount));
        DealEscrow(escrow).initialize(msg.sender, performer, amount, deliverBy, reviewPeriod, dealRef);

        emit DealCreated(
            dealRef, escrow, msg.sender, performer, amount, FeeMath.ceilFee(amount, FEE_BPS), deliverBy, reviewPeriod
        );
    }

    function _salt(address client, bytes32 dealRef) private pure returns (bytes32) {
        return keccak256(abi.encode(client, dealRef));
    }
}
