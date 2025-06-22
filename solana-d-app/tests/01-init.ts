import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";
import idl from "../target/idl/solana_d_app.json";

describe("solana-d-app init", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm");

  it("Initializes the 'all' community if it doesn't exist", async () => {
    const authority = (program.provider as anchor.AnchorProvider).wallet;
    // Find the PDA for the "all" community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    // Try to fetch the community account first
    let communityAccount;
    try {
      communityAccount = await program.account.communityAccount.fetch(communityPda);
      console.log("Community already exists:", communityAccount);
      console.log("'all' community PDA address:", communityPda.toBase58());
    } catch (err) {
      console.log("Community doesn't exist, initializing...");
      // Initialize the "all" community
      const tx = await program.methods
        .initialize()
        .accounts({
          communityAccount: communityPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Initialize 'all' community transaction signature:", tx);
      // Fetch the newly created community account
      communityAccount = await program.account.communityAccount.fetch(communityPda);
    }
    // Verify the community account contents
    console.log("Fetched community account:", communityAccount);
    assert.strictEqual(communityAccount.name, "all");
    assert.strictEqual(communityAccount.authority.toBase58(), authority.publicKey.toBase58());
    assert.isArray(communityAccount.surveys);
    assert.lengthOf(communityAccount.surveys, 0);
  });
}); 