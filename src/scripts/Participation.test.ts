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
  ParticipationContract,
  JoinCampaign,
} from '../contracts/Participation.js';

describe('Participation', () => {
  const doProofs = true;

  let { keys, addresses } = randomAccounts('project', 'p1', 'p2');
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let committeeContract: ParticipationContract;

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    committeeContract = new ParticipationContract(addresses.project);
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    console.log('JoinCampaign.compile...');
    await JoinCampaign.compile();
    if (doProofs) {
      console.log('ParticipationContract.compile...');
      await ParticipationContract.compile();
    } else {
      console.log('ParticipationContract.analyzeMethods...');
      ParticipationContract.analyzeMethods();
    }
  });
});
