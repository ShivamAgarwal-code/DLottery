import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Mint test USD8 to an address (owner-only mint). Usage:
 *   TO=0x... AMOUNT=10000 npx hardhat run scripts/mint.ts --network sepolia
 */
async function main() {
  const to = process.env.TO;
  const amount = process.env.AMOUNT || "10000";
  if (!to) throw new Error("set TO=0x... (recipient address)");

  const dep = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "deployments", `${network.name}.json`),
      "utf8"
    )
  );
  const usd8 = await ethers.getContractAt("USD8", dep.contracts.USD8.address);

  const tx = await usd8.mint(to, ethers.parseUnits(amount, 18));
  await tx.wait();

  const bal = await usd8.balanceOf(to);
  console.log(`minted ${amount} USD8 to ${to}`);
  console.log(`new balance: ${ethers.formatUnits(bal, 18)} USD8`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
