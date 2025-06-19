import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";

// Helper to get the size of the UserList account
const USER_LIST_SIZE = 8 + 4 + (1000 * 32);

describe("solana-d-app", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  let userListPda: anchor.web3.PublicKey;
  let userListBump: number;

  it("Initializes the user list", async () => {
    const payer = (program.provider as anchor.AnchorProvider).wallet;
    // Derive a PDA for the user list
    [userListPda, userListBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user-list")],
      program.programId
    );
    await program.methods
      .initialize()
      .accounts({
        userList: userListPda,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    // Fetch the account and check it's empty
    const userListAccount = await program.account.userList.fetch(userListPda);
    assert.isArray(userListAccount.users);
    assert.lengthOf(userListAccount.users, 0);
  });

  it("Registers a user", async () => {
    const user = anchor.web3.Keypair.generate();
    // Airdrop SOL to the user for fees
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);
    await program.methods
      .registerUser()
      .accounts({
        userList: userListPda,
        user: user.publicKey,
      })
      .signers([user])
      .rpc();
    // Fetch the account and check the user is registered
    const userListAccount = await program.account.userList.fetch(userListPda);
    assert.includeDeepMembers(userListAccount.users, [user.publicKey]);
  });
});
