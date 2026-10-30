import * as fs from "fs";
import * as path from "path";

/**
 * Exports compiled ABIs into locations consumed by the backend and frontend so all three
 * components share a single source of truth. Run after `hardhat compile`.
 */
function main() {
  const root = path.join(__dirname, "..");
  const artifacts = {
    DLottery: path.join(root, "artifacts/contracts/DLottery.sol/DLottery.json"),
    USD8: path.join(root, "artifacts/contracts/USD8.sol/USD8.json"),
  };

  const targets = [
    path.join(root, "..", "backend", "abi"),
    path.join(root, "..", "frontend", "src", "abi"),
    path.join(root, "deployments"),
  ];

  for (const dir of targets) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, artifactPath] of Object.entries(artifacts)) {
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Missing artifact ${artifactPath}; run 'hardhat compile' first.`);
      }
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      fs.writeFileSync(
        path.join(dir, `${name}.abi.json`),
        JSON.stringify(artifact.abi, null, 2)
      );
    }
    console.log(`ABIs exported to ${dir}`);
  }
}

main();
