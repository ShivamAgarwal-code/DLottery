//! Contract event bindings generated from the shared ABI.
//!
//! The ABI file is produced by `contracts/scripts/export-abi.ts` and copied to
//! `backend/abi/DLottery.abi.json`, so the backend decodes exactly the events the
//! deployed contract emits (PRD 2.5).

use alloy::sol;

sol!(
    #[allow(missing_docs)]
    #[derive(Debug)]
    DLottery,
    "abi/DLottery.abi.json"
);
