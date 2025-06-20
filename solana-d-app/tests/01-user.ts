import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";
import idl from "../target/idl/solana_d_app.json";

describe("solana-d-app user", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

  it("Registers a user and creates a PDA with the 'all' community", async () => {
    const user = anchor.web3.Keypair.generate();
    // Airdrop SOL to the user for fees
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);
    // Derive the PDA for the user
    const [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );
    // Derive the PDA for the "all" community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    // Build the instruction
    const ix = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: communityPda,
      })
      .instruction();
    // Create and send the transaction with the user as fee payer
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = user.publicKey;
    const latestBlockhash = await program.provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    const signedTx = await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      [user]
    );
    console.log("RegisterUser transaction signature:", signedTx);
    // Fetch the user account and check its contents
    const userAccount = await program.account.userAccount.fetch(userPda);
    console.log("Fetched user account:", userAccount);
    assert.strictEqual(userAccount.authority.toBase58(), user.publicKey.toBase58());
    assert.isArray(userAccount.communities);
    assert.lengthOf(userAccount.communities, 1);
    // Check the "all" community reference details
    const allCommunityRef = userAccount.communities[0];
    assert.strictEqual(allCommunityRef.name, "all");
    assert.strictEqual(allCommunityRef.pdaAddress.toBase58(), communityPda.toBase58());
    console.log("User is registered with 'all' community reference:", allCommunityRef);
  });
}); 