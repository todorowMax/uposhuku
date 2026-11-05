// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Комісія в базисних пунктах, округлення вгору: на сумі більше нуля комісія ніколи не нуль,
/// тому дрібними платежами її не обійти. Втрата заказчика від округлення менша за одну найменшу одиницю токена.
library FeeMath {
    uint256 internal constant BPS = 10_000;

    function ceilFee(uint256 amount, uint256 feeBps) internal pure returns (uint256) {
        return (amount * feeBps + BPS - 1) / BPS;
    }
}
