import {
  Field,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Poseidon,
  MerkleMap,
  MerkleTree,
  MerkleWitness,
  Proof,
  Void,
} from 'o1js';

import { getProfiler } from './helper/profiler.js';
import randomAccounts from './helper/randomAccounts.js';
import {
  FundingContract,
  CreateReduceProof,
  CreateRollupProof,
} from '../contracts/Funding.js';

describe('Participation', () => {
  const doProofs = true;

  let { keys, addresses } = randomAccounts('project', 'p1', 'p2');
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let fundingContract: FundingContract;

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    fundingContract = new FundingContract(addresses.project);
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    console.log('CreateReduceProof.compile...');
    await CreateReduceProof.compile();
    console.log('CreateRollupProof.compile...');
    await CreateRollupProof.compile();
    if (doProofs) {
      console.log('FundingContract.compile...');
      await FundingContract.compile();
    } else {
      console.log('FundingContract.analyzeMethods...');
      FundingContract.analyzeMethods();
    }
  });
});
