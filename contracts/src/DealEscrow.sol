// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FeeMath} from "./FeeMath.sol";

/// @title DealEscrow
/// @notice Ескроу однієї угоди. Це реалізація для мінімальних клонів (EIP-1167), створює її лише EscrowFactory.
/// Ставка, отримувач комісії, арбітр, токен і строки спору зашиті в код реалізації (immutable), тому в клона
/// змінюються тільки поля самої угоди, а їх після ініціалізації нічим не змінити.
/// Заказчик вносить `amount + fee` (ціна плюс комісія зверху). Виконавець отримує свою частку ціни повністю;
/// комісія береться з частки виконавця, невикористана її частина повертається заказчику.
/// Прототип, аудиту не проходив.
contract DealEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        None, // клон створено, але ще не ініціалізовано (або це сама реалізація: у неї стан Closed)
        Funded, // гроші внесено
        Delivered, // виконавець здав роботу
        Disputed, // відкрито спір
        Closed // гроші виплачено
    }

    address public immutable FACTORY;
    IERC20 public immutable TOKEN;
    uint16 public immutable FEE_BPS;
    address public immutable FEE_RECIPIENT;
    address public immutable ARBITER;
    /// @notice Скільки секунд спір чекає рішення арбітра, перш ніж будь-хто зможе завершити його за запасним правилом.
    uint64 public immutable DISPUTE_TIMEOUT;
    /// @notice Запасне правило: частка виконавця (кратна 5) при завершенні спору без рішення арбітра.
    uint8 public immutable FALLBACK_PERFORMER_PCT;

    State public state;
    address public client;
    address public performer;
    /// @notice Ціна угоди без комісії.
    uint256 public amount;
    /// @notice Комісія зверху, внесена заказчиком (максимум, який може піти отримувачу).
    uint256 public fee;
    uint64 public deliverBy;
    uint64 public reviewPeriod;
    uint64 public reviewEnds;
    uint64 public disputedAt;
    bytes32 public dealRef;
    /// @notice Скільки отримав виконавець після закриття (для читання з сервера).
    uint256 public paidToPerformer;

    event Delivered(uint64 reviewEnds);
    event Disputed(address indexed by);
    event Closed(uint256 toPerformer, uint256 toFeeRecipient, uint256 toClient);

    error NotFactory();
    error WrongState();
    error NotClient();
    error NotPerformer();
    error NotParty();
    error NotArbiter();
    error NotSelf();
    error TooEarly();
    error TooLate();
    error BadPercent();
    error NotFunded();
    error InvalidParty();
    error Stuck();

    constructor(
        IERC20 token,
        uint16 feeBps,
        address feeRecipient,
        address arbiter,
        uint64 disputeTimeout,
        uint8 fallbackPerformerPct,
        address factory
    ) {
        TOKEN = token;
        FEE_BPS = feeBps;
        FEE_RECIPIENT = feeRecipient;
        ARBITER = arbiter;
        DISPUTE_TIMEOUT = disputeTimeout;
        FALLBACK_PERFORMER_PCT = fallbackPerformerPct;
        FACTORY = factory;
        // Сама реалізація не угода: ініціалізувати її не можна нікому.
        state = State.Closed;
    }

    /// @dev Гроші фабрика вже перевела на адресу клона. Лише фабрика, лише один раз.
    function initialize(
        address client_,
        address performer_,
        uint256 amount_,
        uint64 deliverBy_,
        uint64 reviewPeriod_,
        bytes32 dealRef_
    ) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (state != State.None) revert WrongState();
        if (client_ == address(this) || performer_ == address(this)) revert InvalidParty();
        uint256 fee_ = FeeMath.ceilFee(amount_, FEE_BPS);
        // Захист від токена з комісією переказу: баланс має покривати внесок.
        if (TOKEN.balanceOf(address(this)) < amount_ + fee_) revert NotFunded();

        state = State.Funded;
        client = client_;
        performer = performer_;
        amount = amount_;
        fee = fee_;
        deliverBy = deliverBy_;
        reviewPeriod = reviewPeriod_;
        dealRef = dealRef_;
    }

    /// @notice Виконавець здає роботу не пізніше `deliverBy` (включно).
    function deliver() external nonReentrant {
        if (msg.sender != performer) revert NotPerformer();
        if (state != State.Funded) revert WrongState();
        if (block.timestamp > deliverBy) revert TooLate();
        state = State.Delivered;
        reviewEnds = uint64(block.timestamp) + reviewPeriod;
        emit Delivered(reviewEnds);
    }

    /// @notice Заказчик приймає роботу, виконавець отримує все.
    function release() external nonReentrant {
        if (msg.sender != client) revert NotClient();
        if (state != State.Delivered) revert WrongState();
        _close(amount);
    }

    /// @notice Завершення за таймером, може викликати хто завгодно.
    /// Без здачі після `deliverBy` гроші повертаються заказчику; після здачі й `reviewEnds` йдуть виконавцю.
    function settle() external nonReentrant {
        if (state == State.Funded) {
            if (block.timestamp <= deliverBy) revert TooEarly();
            _close(0);
        } else if (state == State.Delivered) {
            if (block.timestamp <= reviewEnds) revert TooEarly();
            _close(amount);
        } else {
            revert WrongState();
        }
    }

    /// @notice Будь-яка сторона відкриває спір, поки гроші не виплачено. Таймери при спорі не діють.
    /// Часу на спір не обмежено навмисно: це вихід, якщо виплата не проходить (наприклад, адреса заблокована токеном).
    function dispute() external nonReentrant {
        if (msg.sender != client && msg.sender != performer) revert NotParty();
        if (state != State.Funded && state != State.Delivered) revert WrongState();
        state = State.Disputed;
        disputedAt = uint64(block.timestamp);
        emit Disputed(msg.sender);
    }

    /// @notice Арбітр ділить суму між заказчиком і виконавцем; частка виконавця кратна 5 %. Нікому іншому нічого не піде.
    function resolve(uint8 performerPct) external nonReentrant {
        if (msg.sender != ARBITER) revert NotArbiter();
        if (state != State.Disputed) revert WrongState();
        if (performerPct > 100 || performerPct % 5 != 0) revert BadPercent();
        _close((amount * performerPct) / 100);
    }

    /// @notice Якщо арбітр не вирішив спір за DISPUTE_TIMEOUT, будь-хто завершує його за запасним правилом.
    /// Якщо виплата за правилом не проходить (адресу заблоковано), пробуємо повернення заказчику, потім виплату виконавцю.
    function forceResolve() external nonReentrant {
        if (state != State.Disputed) revert WrongState();
        if (block.timestamp < uint256(disputedAt) + DISPUTE_TIMEOUT) revert TooEarly();
        state = State.Closed;
        uint256[3] memory options = [(amount * FALLBACK_PERFORMER_PCT) / 100, 0, amount];
        for (uint256 i = 0; i < options.length; i++) {
            // Невдала спроба відкочується цілком, разом із частковими переказами.
            try this.payOut(options[i]) {
                return;
            } catch {}
        }
        revert Stuck();
    }

    /// @dev Лише для try/catch у forceResolve.
    function payOut(uint256 toPerformer) external {
        if (msg.sender != address(this)) revert NotSelf();
        _payOut(toPerformer);
    }

    function _close(uint256 toPerformer) private {
        state = State.Closed;
        _payOut(toPerformer);
    }

    function _payOut(uint256 toPerformer) private {
        paidToPerformer = toPerformer;
        uint256 feeDue = FeeMath.ceilFee(toPerformer, FEE_BPS);
        uint256 feePaid = feeDue;
        // Заблокований отримувач комісії не повинен блокувати виплату: невиплачена комісія повертається заказчику.
        if (feeDue != 0 && !TOKEN.trySafeTransfer(FEE_RECIPIENT, feeDue)) feePaid = 0;
        if (toPerformer != 0) TOKEN.safeTransfer(performer, toPerformer);
        uint256 toClient = amount + fee - toPerformer - feePaid;
        if (toClient != 0) TOKEN.safeTransfer(client, toClient);
        emit Closed(toPerformer, feePaid, toClient);
    }
}
