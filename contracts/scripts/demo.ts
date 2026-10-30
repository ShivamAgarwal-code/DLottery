import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * End-to-end demo against a running node: two accounts buy tickets, time advances past the
 * 24h window, and the draw is settled. Useful for exercising the full event pipeline.
 *
 *   npx hardhat run scripts/demo.ts --network localhost
 */
async function main() {
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
  );
  const usd8Addr = dep.contracts.USD8.address;
  const lotteryAddr = dep.contracts.DLottery.address;

  const signers = await ethers.getSigners();
  const [, a, b] = signers; // skip deployer

  const usd8 = await ethers.getContractAt("USD8", usd8Addr);
  const lottery = await ethers.getContractAt("DLottery", lotteryAddr);

  const price = await lottery.ticketPrice();
  const drawId = await lottery.currentDrawId();
  console.log(`Current draw #${drawId}, ticket price ${ethers.formatUnits(price, 18)} USD8`);

  for (const [signer, num] of [
    [a, 3],
    [b, 7],
  ] as const) {
    const has = await lottery.ticketOf(drawId, signer.address);
    if (has !== 0n) {
      console.log(`${signer.address} already holds #${has}`);
      continue;
    }
    await (await usd8.connect(signer).approve(lotteryAddr, price)).wait();
    await (await lottery.connect(signer).buyTicket(num)).wait();
    console.log(`${signer.address} bought ticket #${num}`);
  }

  console.log("advancing time past the 24h window...");
  await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
  await network.provider.send("evm_mine", []);

  console.log("performing draw...");
  await (await lottery.performDraw()).wait();

  const settled = await lottery.getDraw(drawId);
  const statusNames = ["None", "Active", "Completed", "NoWinner", "Cancelled"];
  console.log(`Draw #${drawId} settled: status=${statusNames[Number(settled.status)]}`);
  console.log(`  lucky number: ${settled.luckyNumber}`);
  console.log(`  winner: ${settled.winner}`);
  console.log(`  total pool: ${ethers.formatUnits(settled.totalPool, 18)} USD8`);
  console.log(`  dao fee:    ${ethers.formatUnits(settled.daoFee, 18)} USD8`);
  console.log(`  winner prize: ${ethers.formatUnits(settled.winnerPrize, 18)} USD8`);
  console.log(`New current draw: #${await lottery.currentDrawId()}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
