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
import { ProjectContract, CreateProject } from '../contracts/Project.js';

describe('Project', () => {
  const doProofs = true;

  let { keys, addresses } = randomAccounts('project', 'p1', 'p2');
  let feePayerKey: PrivateKey;
  let feePayer: PublicKey;
  let committeeContract: ProjectContract;

  beforeAll(async () => {
    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);
    feePayerKey = Local.testAccounts[0].privateKey;
    feePayer = Local.testAccounts[0].publicKey;
    committeeContract = new ProjectContract(addresses.project);
  });

  // beforeEach(() => {});

  it('compile proof', async () => {
    console.log('CreateProject.compile...');
    await CreateProject.compile();
    if (doProofs) {
      console.log('ProjectContract.compile...');
      await ProjectContract.compile();
    } else {
      console.log('ProjectContract.analyzeMethods...');
      ProjectContract.analyzeMethods();
    }
  });
});
