import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys USD8 + DLottery and records addresses and ABIs to `deployments/<network>.json`
 * plus `deployments/shared.json` consumed by the backend and frontend.
 *
 * Config via env:
 *   DAO_ADDRESS         - DAO fee recipient (defaults to deployer)
 *   TICKET_PRICE        - whole USD8 units (default 10)
 *   MIN_PARTICIPANTS    - minimum to settle (default 2)
 *   FAUCET_RECIPIENTS   - comma-separated addresses to seed with USD8 (test only)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const decimals = 18n;
  const one = 10n ** decimals;

  const dao = process.env.DAO_ADDRESS || deployer.address;
  const ticketPriceWhole = BigInt(process.env.TICKET_PRICE || "10");
  const ticketPrice = ticketPriceWhole * one;
  const minParticipants = Number(process.env.MIN_PARTICIPANTS || "2");

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  // USD8
  const USD8 = await ethers.getContractFactory("USD8");
  const usd8 = await USD8.deploy(deployer.address, 1_000_000n); // 1,000,000 USD8 to deployer
  await usd8.waitForDeployment();
  const usd8Address = await usd8.getAddress();
  console.log(`USD8 deployed: ${usd8Address}`);

  // DLottery
  const DLottery = await ethers.getContractFactory("DLottery");
  const lottery = await DLottery.deploy(usd8Address, dao, ticketPrice, minParticipants);
  await lottery.waitForDeployment();
  const lotteryAddress = await lottery.getAddress();
  console.log(`DLottery deployed: ${lotteryAddress}`);

  // Optional: seed test wallets with USD8.
  const recipients = (process.env.FAUCET_RECIPIENTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const r of recipients) {
    const tx = await usd8.mint(r, 1000n * one);
    await tx.wait();
    console.log(`Minted 1000 USD8 to ${r}`);
  }

  // Determine the deployment block for the backend start-from-block.
  const deployBlock = await ethers.provider.getBlockNumber();

  const artifact = require("../artifacts/contracts/DLottery.sol/DLottery.json");
  const usd8Artifact = require("../artifacts/contracts/USD8.sol/USD8.json");

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployBlock,
    contracts: {
      USD8: { address: usd8Address, decimals: Number(decimals) },
      DLottery: {
        address: lotteryAddress,
        dao,
        ticketPrice: ticketPrice.toString(),
        minParticipants,
      },
    },
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(dir, `shared.json`), JSON.stringify(out, null, 2));
  fs.writeFileSync(
    path.join(dir, `DLottery.abi.json`),
    JSON.stringify(artifact.abi, null, 2)
  );
  fs.writeFileSync(path.join(dir, `USD8.abi.json`), JSON.stringify(usd8Artifact.abi, null, 2));

  console.log(`\nDeployment written to deployments/${network.name}.json`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
