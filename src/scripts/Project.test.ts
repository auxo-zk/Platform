import { Field, Reducer, Mina, PrivateKey, PublicKey, Cache } from 'o1js';
import fs from 'fs';
import { Key, Config } from './helper/config.js';
import { Contract } from '../constants.js';
import { getProfiler } from './helper/profiler.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import {
  ProjectContract,
  CreateProject,
  CreateProjectInput,
  ProjectProof,
  ProjectAction,
} from '../contracts/Project.js';
import {
  MemberArray,
  MemberStorage,
  InfoStorage,
  AddressStorage,
  EMPTY_LEVEL_2_TREE,
} from '../contracts/ProjectStorage.js';
import { compile, deploy, proveAndSend } from '../libs/utils.js';

describe('Project', () => {
  const doProofs = false;
  const profiling = false;
  const logMemory = false;
  const cache = Cache.FileSystem('./caches');
  const ProjectProfiler = getProfiler('Benchmark Project');
  const profiler = profiling ? ProjectProfiler : undefined;
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  Mina.setActiveInstance(Local);

  let accounts: Key[] = Local.testAccounts.slice(1, 5);
  let feePayerKey: Key = accounts[0];
  let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  let config = configJson.deployAliases[Contract.PROJECT];
  let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
    fs.readFileSync(config.keyPath, 'utf8')
  );
  let project: any = {
    key: {
      privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
      publicKey: PublicKey.fromBase58(keyBase58.publicKey),
    },
    actionStates: [Reducer.initialActionState],
  };
  project.contract = new ProjectContract(project.key.publicKey);

  // Project contract storage
  let memberStorage = new MemberStorage();
  let infoStorage = new InfoStorage();
  let addressStorage = new AddressStorage();

  // input
  let arrayPublicKey = [
    accounts[1].publicKey,
    accounts[2].publicKey,
    accounts[3].publicKey,
  ];
  let memberArray = new MemberArray(arrayPublicKey);
  let createProjectInput = new CreateProjectInput({
    members: memberArray,
    ipfsHash: IPFSHash.fromString('testing'),
    payeeAccount: accounts[1].publicKey,
  });

  // action
  let action = new ProjectAction({
    projectId: Field(-1),
    members: createProjectInput.members,
    ipfsHash: createProjectInput.ipfsHash,
    payeeAccount: createProjectInput.payeeAccount,
  });

  it('should compile programs and contracts', async () => {
    console.log('CreateProject.compile...');
    await compile(CreateProject, cache, logMemory, profiler);
    if (doProofs) {
      await compile(ProjectContract, cache, logMemory, profiler);
    } else {
      console.log('ProjectContract.analyzeMethods...');
      ProjectContract.analyzeMethods();
    }
  });

  it('should deploy contracts', async () => {
    await deploy(project, [], feePayerKey);
  });

  it('should create a new project', async () => {
    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      project.contract.createProject(createProjectInput);
    });
    await proveAndSend(tx, feePayerKey, 'ProjectContract', 'createProject');
  });

  it('should update projects by reduce actions', async () => {
    let reduceProof: ProjectProof = await CreateProject.firstStep(
      project.contract.nextProjectId.get(),
      project.contract.memberTreeRoot.get(),
      project.contract.projectInfoTreeRoot.get(),
      project.contract.payeeTreeRoot.get(),
      project.contract.lastRolledUpActionState.get()
    );

    reduceProof = await CreateProject.nextStep(
      reduceProof,
      action,
      memberStorage.getLevel1Witness(
        memberStorage.calculateLevel1Index(Field(0))
      ),
      infoStorage.getLevel1Witness(infoStorage.calculateLevel1Index(Field(0))),
      addressStorage.getLevel1Witness(
        addressStorage.calculateLevel1Index(Field(0))
      )
    );

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      project.contract.rollup(reduceProof);
    });
    await proveAndSend(tx, feePayerKey, 'ProjectContract', 'rollup');

    let tree1 = EMPTY_LEVEL_2_TREE();
    for (let i = 0; i < Number(memberArray.length); i++) {
      tree1.setLeaf(BigInt(i), MemberArray.hash(memberArray.get(Field(i))));
    }

    // update storage:
    memberStorage.updateInternal(Field(0), tree1);
    infoStorage.updateLeaf(
      infoStorage.calculateLeaf(createProjectInput.ipfsHash),
      Field(0)
    );
    addressStorage.updateLeaf(
      addressStorage.calculateLeaf(createProjectInput.payeeAccount),
      Field(0)
    );
  });
});
